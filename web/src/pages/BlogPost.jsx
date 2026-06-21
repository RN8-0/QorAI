import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { pb, currentUser, fileUrl } from '../lib/pocketbase';
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

function slugifyHeading(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

export default function BlogPost() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const previewId = sp.get('previewId') || '';
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
  const [progress, setProgress] = useState(0);
  const openedAt = useRef(Date.now());
  const readSent = useRef(false);
  const likeEventId = useRef(null);

  const pick = (a, f) => (a ? (a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '') : '');

  useEffect(() => {
    let live = true;
    setStatus('loading'); setPost(null); setSimilarProds([]); setMore([]);
    openedAt.current = Date.now(); readSent.current = false;
    // Preview mode (admin): fetch the exact record by id, even if it's a draft.
    // Otherwise resolve by canonical slug OR any per-language slug → same article.
    const fetchArticle = previewId
      ? pb.collection('articles').getOne(previewId, { $autoCancel: false })
      : pb.collection('articles').getFirstListItem(
        `(slug="${esc(slug)}" || slug_tr="${esc(slug)}" || slug_en="${esc(slug)}" || slug_de="${esc(slug)}") && status="published"`,
      );
    fetchArticle
      .then((rec) => {
        if (!live) return;
        const key = rec.slug || slug; // canonical key → counts/comments aggregate across languages
        setPost(rec); setStatus('ok');
        if (!previewId) track(key, 'view'); // don't count admin previews
        // liked state: for signed-in users it's their own like event (so it
        // works across devices + can be undone); otherwise localStorage.
        const me = currentUser();
        if (me) {
          pb.collection('article_events').getList(1, 1, { filter: `type="like" && userId="${esc(me.id)}" && slug="${esc(key)}"`, $autoCancel: false })
            .then((r) => { if (live && r.items[0]) { setLiked(true); likeEventId.current = r.items[0].id; } }).catch(() => {});
        } else {
          try { setLiked(localStorage.getItem('qor-liked-' + key) === '1'); } catch { /* ignore */ }
        }
        const vBase = seedCount(key, 180, 520);
        const lBase = seedCount(key + '·l', 5, 22);
        setViewCount(vBase); setLikeCount(lBase);
        pb.collection('article_events').getList(1, 1, { filter: `slug="${esc(key)}" && type="like"`, $autoCancel: false }).then((r) => { if (live) setLikeCount(lBase + r.totalItems); }).catch(() => {});
        pb.collection('article_events').getList(1, 1, { filter: `slug="${esc(key)}" && type="view"`, $autoCancel: false }).then((r) => { if (live) setViewCount(vBase + r.totalItems + 1); }).catch(() => {});
        // similar articles
        pb.collection('articles').getList(1, 4, { filter: `status="published" && slug!="${esc(rec.slug)}"`, sort: '-updated', fields: 'slug,slug_tr,slug_en,slug_de,cover,coverFile,products,collectionId,collectionName,title_tr,title_en,title_de,lead_tr,lead_en,lead_de' })
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
  }, [slug, previewId]);

  const canonKey = post?.slug || slug;

  // "read" event when the visitor reaches the bottom (with dwell duration).
  useEffect(() => {
    if (status !== 'ok') return undefined;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 0);
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
  const products = Array.isArray(post?.products) ? post.products.filter((p) => p && p.id && p.name) : [];
  const cover = post?.coverFile ? fileUrl(post, post.coverFile) : (post?.cover || products[0]?.image || products[0]?.imageUrl || '');
  const url = `${SITE_URL}/blog/${slug}`;
  const pdesc = (p) => p[`desc_${lang}`] || p.desc_tr || p.desc_en || '';
  const pdesc2 = (p) => p[`desc2_${lang}`] || p.desc2_tr || p.desc2_en || '';
  const pimg = (p) => p.image || p.imageUrl || '';
  const publishedAt = post?.publishedAt || post?.created || '';
  const author = (post?.author || '').trim() || 'Qor AI';
  const tags = String(pick(post, 'tags') || post?.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  const metaTitle = (pick(post, 'metaTitle') || post?.metaTitle || '').trim();
  const metaDescription = (pick(post, 'metaDescription') || post?.metaDescription || '').trim();

  // Inject ids into h2/h3 of the body + build a table of contents.
  const { bodyHtml, toc } = useMemo(() => {
    if (!body) return { bodyHtml: '', toc: [] };
    try {
      const doc = new DOMParser().parseFromString(`<div id="b">${body}</div>`, 'text/html');
      const heads = [...doc.querySelectorAll('h2, h3')];
      const t = heads.map((h, i) => { const id = `s-${i}-${slugifyHeading(h.textContent)}`; h.id = id; return { id, text: h.textContent || '', level: h.tagName === 'H2' ? 2 : 3 }; });
      return { bodyHtml: doc.getElementById('b').innerHTML, toc: t.filter((x) => x.text) };
    } catch { return { bodyHtml: body, toc: [] }; }
  }, [body]);

  // Feed the whole article to the chat bubble so the assistant can read & comment.
  usePageContext(post ? [
    `${L('Blog article', 'Blog makalesi', 'Blog-Artikel')}: ${title}`, lead,
    ...products.map((p, i) => `${i + 1}. ${p.name}${p.brand ? ` (${p.brand})` : ''}: ${pdesc(p)} ${pdesc2(p)}`.trim()),
    conclusion ? conclusion.replace(/<[^>]+>/g, ' ') : '',
  ].filter(Boolean).join('\n') : '');

  useSeo({
    title: metaTitle || (title ? `${title} | Qor AI` : 'Qor AI Blog'),
    description: metaDescription || lead,
    image: cover || undefined,
    path: `/blog/${slug}`,
    type: 'article',
    noindex: status === 'notfound' || !!previewId,
    jsonLd: post ? {
      '@context': 'https://schema.org', '@type': 'Article', '@id': `${url}#article`,
      headline: title, description: metaDescription || lead, ...(cover ? { image: [cover] } : {}),
      datePublished: publishedAt, dateModified: post.updated,
      author: { '@type': 'Organization', name: author },
      publisher: { '@type': 'Organization', name: 'Qor AI', logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/qor_logo_512.png?v=20260605a` } },
      mainEntityOfPage: url,
    } : null,
  });

  const onLike = () => {
    const me = currentUser();
    if (me) {
      if (liked) { // undo
        setLiked(false); setLikeCount((c) => Math.max(0, c - 1));
        const id = likeEventId.current; likeEventId.current = null;
        if (id) pb.collection('article_events').delete(id, { $autoCancel: false }).catch(() => {});
      } else {
        setLiked(true); setLikeCount((c) => c + 1);
        pb.collection('article_events').create({ slug: canonKey, type: 'like', session: sessionId(), userId: me.id }, { $autoCancel: false })
          .then((rec) => { likeEventId.current = rec.id; }).catch(() => {});
      }
      return;
    }
    // anonymous: localStorage toggle
    if (liked) {
      setLiked(false); setLikeCount((c) => Math.max(0, c - 1));
      try { localStorage.removeItem('qor-liked-' + canonKey); } catch { /* ignore */ }
    } else {
      setLiked(true); setLikeCount((c) => c + 1);
      try { localStorage.setItem('qor-liked-' + canonKey, '1'); } catch { /* ignore */ }
      track(canonKey, 'like');
    }
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
    return (
      <div className={`post-prod layout-${layout}`} key={p.id}>
        <div className="post-prod-head">{titleEl}{btns}</div>
        {inner}
      </div>
    );
  };

  return (
    <div className="container blog-page">
      <div className="blog-progress" style={{ width: `${progress}%` }} />
      {previewId ? <div className="blog-preview-banner">👁 {L('Preview — not public', 'Önizleme — yayında değil', 'Vorschau — nicht öffentlich')}{post?.status !== 'published' ? ` · ${L('draft', 'taslak', 'Entwurf')}` : ''}</div> : null}
      <article className="blog-article">
        <nav className="blog-crumb"><Link to="/">Qor AI</Link> › <Link to="/blog">Blog</Link></nav>

        {/* stats — date + author + views left, like + share right */}
        <div className="blog-stats">
          {dateStr ? <span className="blog-stat">📅 {dateStr}</span> : null}
          <span className="blog-stat">✍ {author}</span>
          <span className="blog-stat">👁 {nf(viewCount)}</span>
          <div className="blog-stats-actions">
            <button className={`blog-act blog-like ${liked ? 'on' : ''}`} onClick={onLike} aria-label="like">❤ {nf(likeCount)}</button>
            <button className="blog-act" onClick={onShare} aria-label="share">↗ {L('Share', 'Paylaş', 'Teilen')}</button>
          </div>
        </div>

        <h1>{title}</h1>
        {lead ? <p className="blog-lead">{lead}</p> : null}

        {toc.length >= 2 && (
          <nav className="blog-toc">
            <div className="blog-toc-h">{L('Contents', 'İçindekiler', 'Inhalt')}</div>
            <ul>
              {toc.map((h) => (
                <li key={h.id} className={h.level === 3 ? 'lvl3' : ''}>
                  <a href={`#${h.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{h.text}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {bodyHtml ? <div className="blog-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} /> : null}

        {products.length > 0 && <section className="post-prods">{products.map(renderProd)}</section>}

        {/* conclusion flows as part of the article (no rigid "Sonuç" box) */}
        {conclusion ? <div className="blog-body blog-concl-flow" dangerouslySetInnerHTML={{ __html: conclusion }} /> : null}

        {tags.length > 0 && (
          <div className="blog-tags">
            {tags.map((tg) => <Link key={tg} to={`/blog?tag=${encodeURIComponent(tg)}`} className="blog-tag">#{tg}</Link>)}
          </div>
        )}

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

        {/* similar articles — horizontal rows: cover left, title + excerpt right */}
        {more.length > 0 && (
          <section className="blog-similar">
            <div className="sec-head"><h2><span className="bar" /> {L('Related guides', 'Benzer rehberler', 'Ähnliche Ratgeber')}</h2></div>
            <div className="blog-simrows">
              {more.map((m) => {
                const mp = Array.isArray(m.products) ? m.products : [];
                const mcover = m.coverFile ? fileUrl(m, m.coverFile) : (m.cover || mp[0]?.image || mp[0]?.imageUrl || '');
                return (
                  <Link key={m.slug} to={articlePath(m, lang)} className="blog-simrow">
                    {mcover ? <div className="blog-simrow-img"><img src={mcover} alt={pick(m, 'title')} loading="lazy" /></div> : null}
                    <div className="blog-simrow-body">
                      <h3>{pick(m, 'title')}</h3>
                      {pick(m, 'lead') ? <p>{pick(m, 'lead')}</p> : null}
                    </div>
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
