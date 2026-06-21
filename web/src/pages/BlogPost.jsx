import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL } from '../lib/seo';
import { productPath, articlePath } from '../lib/routes';
import { amazonGoPath } from '../lib/format';
import { useGeoCountry } from '../lib/geo';
import { getSimilar } from '../lib/typesense';
import { usePageContext } from '../lib/pageContext';
import ProductCard from '../components/ProductCard.jsx';
import ScrollRail from '../components/ScrollRail.jsx';
import Reviews from '../components/Reviews.jsx';
import { useT } from '../i18n/index.jsx';
import './Blog.css';

function esc(v) { return String(v || '').replace(/"/g, '\\"'); }
function sessionId() {
  try {
    let s = localStorage.getItem('qor-sid');
    if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('qor-sid', s); }
    return s;
  } catch { return 'anon'; }
}
function track(slug, type, duration) {
  try {
    pb.collection('article_events').create({ slug, type, session: sessionId(), duration: duration || 0 }, { $autoCancel: false }).catch(() => {});
  } catch { /* ignore */ }
}
// Deterministic per-article baseline so a brand-new guide carries social proof
// instead of a discouraging "0". Stable (seeded by slug); public count =
// baseline + real events. The admin panel always shows REAL numbers only.
function seedCount(slug, min, max) {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 16777619); }
  return min + (Math.abs(h) % (max - min + 1));
}

export default function BlogPost() {
  const { slug } = useParams();
  const { lang } = useI18n();
  const t = useT();
  const geoCountry = useGeoCountry();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState('loading');
  const [more, setMore] = useState([]);
  const [similarProds, setSimilarProds] = useState([]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const openedAt = useRef(Date.now());
  const readSent = useRef(false);

  const pick = (a, f) => (a ? (a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '') : '');

  useEffect(() => {
    let live = true;
    setStatus('loading'); setPost(null); setSimilarProds([]); setMore([]);
    openedAt.current = Date.now(); readSent.current = false;
    // Resolve by canonical slug OR any per-language slug → same article.
    pb.collection('articles').getFirstListItem(
      `(slug="${esc(slug)}" || slug_tr="${esc(slug)}" || slug_en="${esc(slug)}" || slug_de="${esc(slug)}") && status="published"`,
    )
      .then((rec) => {
        if (!live) return;
        const key = rec.slug || slug; // canonical key → counts/comments aggregate across languages
        setPost(rec); setStatus('ok');
        try { setLiked(localStorage.getItem('qor-liked-' + key) === '1'); } catch { /* ignore */ }
        track(key, 'view');
        const vBase = seedCount(key, 180, 520);
        const lBase = seedCount(key + '·l', 5, 22);
        setViewCount(vBase); setLikeCount(lBase);
        pb.collection('article_events').getList(1, 1, { filter: `slug="${esc(key)}" && type="like"`, $autoCancel: false }).then((r) => { if (live) setLikeCount(lBase + r.totalItems); }).catch(() => {});
        pb.collection('article_events').getList(1, 1, { filter: `slug="${esc(key)}" && type="view"`, $autoCancel: false }).then((r) => { if (live) setViewCount(vBase + r.totalItems + 1); }).catch(() => {});
        // similar articles
        pb.collection('articles').getList(1, 4, { filter: `status="published" && slug!="${esc(rec.slug)}"`, sort: '-updated', fields: 'slug,slug_tr,slug_en,slug_de,cover,coverFile,collectionId,collectionName,title_tr,title_en,title_de' })
          .then((r) => { if (live) setMore(r.items || []); }).catch(() => {});
        // similar products — same getSimilar() the product page uses, then ranked
        // by closeness to the article's average tech score ("yaklaşık teknik puan").
        const prods = Array.isArray(rec.products) ? rec.products.filter((p) => p && p.id) : [];
        if (rec.category) {
          const avg = prods.length ? Math.round(prods.reduce((s, p) => s + (Number(p.techScore) || 0), 0) / prods.length) : 0;
          const exclude = new Set(prods.map((p) => p.id));
          getSimilar(rec.category, avg, null, 24).then((list) => {
            if (!live) return;
            const ranked = (list || []).filter((p) => !exclude.has(p.id));
            if (avg) ranked.sort((a, b) => Math.abs((Number(a.techScore) || 0) - avg) - Math.abs((Number(b.techScore) || 0) - avg));
            setSimilarProds(ranked.slice(0, 12));
          }).catch(() => {});
        }
      })
      .catch(() => { if (live) setStatus('notfound'); });
    return () => { live = false; };
  }, [slug]);

  const canonKey = post?.slug || slug;

  // "read" event when the visitor reaches the bottom (with dwell duration).
  useEffect(() => {
    if (status !== 'ok') return undefined;
    const onScroll = () => {
      if (readSent.current) return;
      const scrolled = window.scrollY + window.innerHeight;
      if (scrolled >= document.body.scrollHeight - 600) {
        readSent.current = true;
        track(canonKey, 'read', Math.round((Date.now() - openedAt.current) / 1000));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [status, canonKey]);

  const title = pick(post, 'title');
  const lead = pick(post, 'lead');
  const body = pick(post, 'body');
  const conclusion = pick(post, 'conclusion');
  const cover = post?.coverFile ? pb.files.getURL(post, post.coverFile) : (post?.cover || '');
  const products = Array.isArray(post?.products) ? post.products.filter((p) => p && p.id && p.name) : [];
  const url = `${SITE_URL}/blog/${slug}`;
  const pdesc = (p) => p[`desc_${lang}`] || p.desc_tr || p.desc_en || '';
  const pdesc2 = (p) => p[`desc2_${lang}`] || p.desc2_tr || p.desc2_en || '';
  const pimg = (p) => p.image || p.imageUrl || '';
  const publishedAt = post?.publishedAt || post?.created || '';

  // Feed the whole article to the chat bubble so the assistant can read & comment.
  usePageContext(post ? [
    `${L('Blog article', 'Blog makalesi', 'Blog-Artikel')}: ${title}`, lead,
    ...products.map((p, i) => `${i + 1}. ${p.name}${p.brand ? ` (${p.brand})` : ''}: ${pdesc(p)} ${pdesc2(p)}`.trim()),
    conclusion ? conclusion.replace(/<[^>]+>/g, ' ') : '',
  ].filter(Boolean).join('\n') : '');

  useSeo({
    title: title ? `${title} | Qor AI` : 'Qor AI Blog',
    description: lead,
    image: cover || undefined,
    path: `/blog/${slug}`,
    type: 'article',
    noindex: status === 'notfound',
    jsonLd: post ? {
      '@context': 'https://schema.org', '@type': 'Article', '@id': `${url}#article`,
      headline: title, description: lead, ...(cover ? { image: [cover] } : {}),
      datePublished: publishedAt, dateModified: post.updated,
      author: { '@type': 'Organization', name: 'Qor AI' },
      publisher: { '@type': 'Organization', name: 'Qor AI', logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/qor_logo_512.png?v=20260605a` } },
      mainEntityOfPage: url,
    } : null,
  });

  const onLike = () => {
    if (liked) return;
    setLiked(true); setLikeCount((c) => c + 1);
    try { localStorage.setItem('qor-liked-' + canonKey, '1'); } catch { /* ignore */ }
    track(canonKey, 'like');
  };
  const onShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); }
    } catch { /* ignore */ }
  };
  const askAi = () => {
    const parts = [`${title}`, lead];
    products.forEach((p, i) => parts.push(`${i + 1}. ${p.name}${p.brand ? ` (${p.brand})` : ''}: ${pdesc(p)} ${pdesc2(p)}`.trim()));
    if (conclusion) parts.push(conclusion.replace(/<[^>]+>/g, ' '));
    window.dispatchEvent(new CustomEvent('qor-open-ai', { detail: { context: parts.filter(Boolean).join('\n') } }));
  };

  if (status === 'notfound') {
    return (
      <div className="container blog-page">
        <div className="blog-hero"><h1>{L('Article not found', 'Yazı bulunamadı', 'Artikel nicht gefunden')}</h1></div>
        <Link to="/blog" className="btn btn-primary">{L('All guides', 'Tüm rehberler', 'Alle Ratgeber')}</Link>
      </div>
    );
  }
  if (status === 'loading') {
    return <div className="container blog-page"><div className="blog-article"><div className="blog-card-skel" style={{ minHeight: 360, borderRadius: 18 }} /></div></div>;
  }

  const dateStr = publishedAt ? new Date(publishedAt).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const nf = (n) => Number(n || 0).toLocaleString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US');

  // One product block, rendered per its chosen layout template.
  const renderProd = (p, i) => {
    const to = productPath({ id: p.id, slug: p.slug, name: p.name });
    const layout = p.layout || 'split';
    const size = p.imgSize || 'm';
    const img = pimg(p);
    const btns = (
      <div className="post-prod-btns">
        <Link to={`${to}?ai=1`} className="ppbtn">✨ {L('AI analysis', 'AI Analizi', 'KI-Analyse')}</Link>
        <a href={amazonGoPath(p, geoCountry || 'TR')} target="_blank" rel="sponsored noopener nofollow" className="ppbtn ppbtn-amz" title="Amazon">
          <img src="/assets/amazon.svg" alt="Amazon" className="amz-logo" />
          {p.price ? <span className="ppbtn-price">{p.price}</span> : null}
        </a>
        <Link to={to} className="ppbtn">→ {L('Product', 'Ürüne Git', 'Produkt')}</Link>
      </div>
    );
    const titleEl = <Link to={to} className="post-prod-title"><span className="ppn">{i + 1}.</span> {p.name}</Link>;
    const d1 = pdesc(p) ? <p className="post-prod-desc">{pdesc(p)}</p> : null;
    const d2 = pdesc2(p) ? <p className="post-prod-desc">{pdesc2(p)}</p> : null;
    const imgEl = img ? <Link to={to} className={`post-prod-img pp-${size}`}><img src={img} alt={p.name} loading="lazy" /></Link> : null;
    let inner;
    if (layout === 'text' || !img) inner = <>{d1}{d2}</>;
    else if (layout === 'top') inner = <>{imgEl}{d1}{d2}</>;
    else if (layout === 'left') inner = <div className="post-prod-row">{imgEl}<div className="post-prod-rowtext">{d1}{d2}</div></div>;
    else if (layout === 'right') inner = <div className="post-prod-row rev">{imgEl}<div className="post-prod-rowtext">{d1}{d2}</div></div>;
    else inner = <>{d1}{imgEl}{d2}</>; // split (default)
    return <div className={`post-prod layout-${layout}`} key={p.id}>{btns}{titleEl}{inner}</div>;
  };

  return (
    <div className="container blog-page">
      <article className="blog-article">
        <nav className="blog-crumb"><Link to="/">Qor AI</Link> › <Link to="/blog">Blog</Link></nav>

        {/* stats — date + views left, like + share right */}
        <div className="blog-stats">
          {dateStr ? <span className="blog-stat">📅 {dateStr}</span> : null}
          <span className="blog-stat">👁 {nf(viewCount)}</span>
          <div className="blog-stats-actions">
            <button className={`blog-act blog-like ${liked ? 'on' : ''}`} onClick={onLike} aria-label="like">❤ {nf(likeCount)}</button>
            <button className="blog-act" onClick={onShare} aria-label="share">↗ {L('Share', 'Paylaş', 'Teilen')}</button>
          </div>
        </div>

        <h1>{title}</h1>
        {lead ? <p className="blog-lead">{lead}</p> : null}
        {body ? <div className="blog-body" dangerouslySetInnerHTML={{ __html: body }} /> : null}

        {products.length > 0 && <section className="post-prods">{products.map(renderProd)}</section>}

        {/* conclusion flows as part of the article (no rigid "Sonuç" box) */}
        {conclusion ? <div className="blog-body blog-concl-flow" dangerouslySetInnerHTML={{ __html: conclusion }} /> : null}

        {/* comments — same review system as product / compare pages (shows on the
            user's profile too). The small "Ask Qor AI" button sits across from
            the "Comments" heading. */}
        <Reviews
          productId={`blog:${canonKey}`} productName={title} lang={lang}
          headerSlot={(
            <button type="button" className="blog-ai-btn" onClick={askAi}>
              ✨ {L('Ask Qor AI about this article', 'Bu makale hakkında Qor AI’ya sor', 'Frag Qor AI zu diesem Artikel')}
            </button>
          )}
        />

        {/* similar articles */}
        {more.length > 0 && (
          <section className="blog-similar">
            <div className="sec-head"><h2><span className="bar" /> {L('Related guides', 'Benzer rehberler', 'Ähnliche Ratgeber')}</h2></div>
            <div className="blog-similar-grid">
              {more.map((m) => {
                const mcover = m.coverFile ? pb.files.getURL(m, m.coverFile) : (m.cover || '');
                return (
                  <Link key={m.slug} to={articlePath(m, lang)} className="blog-similar-card">
                    {mcover ? <div className="blog-similar-img"><img src={mcover} alt={pick(m, 'title')} loading="lazy" /></div> : null}
                    <span>{pick(m, 'title')}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* similar products — same rail + cards as the product page */}
        {similarProds.length > 0 && (
          <section className="blog-simprods">
            <div className="sec-head" style={{ marginTop: 40 }}><h2><span className="bar" /> {t('pd.similar')}</h2></div>
            <ScrollRail>
              {similarProds.map((sp) => <ProductCard key={sp.id} product={sp} />)}
            </ScrollRail>
          </section>
        )}
      </article>
    </div>
  );
}
