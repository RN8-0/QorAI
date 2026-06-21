import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pb, currentUser } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import { useSeo, SITE_URL } from '../lib/seo';
import { productPath, categoryPath, articlePath } from '../lib/routes';
import { amazonGoPath } from '../lib/format';
import { useGeoCountry } from '../lib/geo';
import { getCategoryPage, searchProducts } from '../lib/typesense';
import { usePageContext } from '../lib/pageContext';
import ProductCard from '../components/ProductCard.jsx';
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
// instead of a discouraging "0". Stable (seeded by slug, never random/jittery);
// the public count = baseline + real events. The admin panel always shows the
// REAL numbers (it reads article_events directly), never this baseline.
function seedCount(slug, min, max) {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 16777619); }
  return min + (Math.abs(h) % (max - min + 1));
}

export default function BlogPost() {
  const { slug } = useParams();
  const { lang } = useI18n();
  const { user, openAuth } = useAuth();
  const geoCountry = useGeoCountry();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState('loading');
  const [more, setMore] = useState([]);
  const [relProds, setRelProds] = useState([]);
  const [comments, setComments] = useState([]);
  const [cText, setCText] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const openedAt = useRef(Date.now());
  const readSent = useRef(false);

  const pick = (a, f) => (a ? (a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '') : '');

  useEffect(() => {
    let live = true;
    setStatus('loading'); setPost(null); setComments([]); setRelProds([]); setMore([]);
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
        // comments (public read), keyed by canonical slug
        pb.collection('article_comments').getList(1, 100, { filter: `slug="${esc(key)}"`, sort: '-created', $autoCancel: false }).then((r) => { if (live) setComments(r.items || []); }).catch(() => {});
        // similar articles
        pb.collection('articles').getList(1, 4, { filter: `status="published" && slug!="${esc(rec.slug)}"`, sort: '-updated', fields: 'slug,slug_tr,slug_en,slug_de,cover,coverFile,collectionId,collectionName,title_tr,title_en,title_de' })
          .then((r) => { if (live) setMore(r.items || []); }).catch(() => {});
        // related products under the article (popular in the same category)
        if (rec.category) {
          getCategoryPage({ category: rec.category, perPage: 8, sort: 'trend' })
            .then((r) => { if (live && r.hits?.length) setRelProds(r.hits.slice(0, 8)); }).catch(() => {});
        } else {
          searchProducts(rec.title_tr || rec.title_en || '', 8).then((hits) => { if (live) setRelProds(hits.slice(0, 8)); }).catch(() => {});
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
  const publishedAt = post?.publishedAt || post?.created || '';

  // Feed the whole article to the chat bubble so "Ask Qor AI" — and any chat
  // opened on this page — can read and comment on it.
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
  const submitComment = async (e) => {
    e.preventDefault();
    const u = currentUser();
    if (!u) { openAuth?.(); return; }
    const text = cText.trim();
    if (!text || cBusy) return;
    setCBusy(true);
    const name = u.name || u.displayName || (u.email ? u.email.split('@')[0] : 'User');
    try {
      const rec = await pb.collection('article_comments').create({ slug: canonKey, name, text, userId: u.id }, { $autoCancel: false });
      setComments((list) => [rec, ...list]);
      setCText('');
    } catch { /* ignore */ } finally { setCBusy(false); }
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
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

  return (
    <div className="container blog-page">
      <article className="blog-article">
        <nav className="blog-crumb"><Link to="/">Qor AI</Link> › <Link to="/blog">Blog</Link></nav>

        {/* stats bar — date + views on the left, like + share on the right */}
        <div className="blog-stats">
          {dateStr ? <span className="blog-stat">📅 {dateStr}</span> : null}
          <span className="blog-stat">👁 {viewCount.toLocaleString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US')}</span>
          <div className="blog-stats-actions">
            <button className={`blog-act blog-like ${liked ? 'on' : ''}`} onClick={onLike} aria-label="like">❤ {likeCount.toLocaleString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US')}</button>
            <button className="blog-act" onClick={onShare} aria-label="share">↗ {L('Share', 'Paylaş', 'Teilen')}</button>
          </div>
        </div>

        <h1>{title}</h1>
        {lead ? <p className="blog-lead">{lead}</p> : null}
        {body ? <div className="blog-body" dangerouslySetInnerHTML={{ __html: body }} /> : null}

        {/* products: tiny buttons → title(link) → desc → image → desc2 (no tech score) */}
        {products.length > 0 && (
          <section className="post-prods">
            {products.map((p, i) => {
              const to = productPath({ id: p.id, slug: p.slug, name: p.name });
              return (
                <div className="post-prod" key={p.id}>
                  <div className="post-prod-btns">
                    <Link to={`${to}?ai=1`} className="ppbtn">✨ {L('AI analysis', 'AI Analizi', 'KI-Analyse')}</Link>
                    <a href={amazonGoPath(p, geoCountry || 'TR')} target="_blank" rel="sponsored noopener nofollow" className="ppbtn ppbtn-amz" title="Amazon">
                      <img src="/assets/amazon.svg" alt="Amazon" className="amz-logo" />
                      {p.price ? <span className="ppbtn-price">{p.price}</span> : null}
                    </a>
                    <Link to={to} className="ppbtn">→ {L('Product', 'Ürüne Git', 'Produkt')}</Link>
                  </div>
                  <Link to={to} className="post-prod-title"><span className="ppn">{i + 1}.</span> {p.name}</Link>
                  {pdesc(p) ? <p className="post-prod-desc">{pdesc(p)}</p> : null}
                  {p.imageUrl ? <Link to={to} className="post-prod-img"><img src={p.imageUrl} alt={p.name} loading="lazy" /></Link> : null}
                  {pdesc2(p) ? <p className="post-prod-desc">{pdesc2(p)}</p> : null}
                </div>
              );
            })}
          </section>
        )}

        {/* conclusion */}
        {conclusion ? (
          <section className="blog-concl">
            <h2>{L('Verdict', 'Sonuç', 'Fazit')}</h2>
            <div dangerouslySetInnerHTML={{ __html: conclusion }} />
          </section>
        ) : null}

        {/* AI chat help */}
        <div className="blog-aihelp">
          <div>
            <strong>{L('Need help deciding?', 'Karar veremedin mi?', 'Unentschlossen?')}</strong>
            <p>{L('Ask Qor AI about this guide and your needs.', 'Bu rehber ve ihtiyacın hakkında Qor AI’ya sor.', 'Frag Qor AI zu diesem Ratgeber.')}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => {
            const parts = [`${title}`, lead];
            products.forEach((p, i) => parts.push(`${i + 1}. ${p.name}${p.brand ? ` (${p.brand})` : ''}: ${pdesc(p)} ${pdesc2(p)}`.trim()));
            if (conclusion) parts.push(conclusion.replace(/<[^>]+>/g, ' '));
            window.dispatchEvent(new CustomEvent('qor-open-ai', { detail: { context: parts.filter(Boolean).join('\n') } }));
          }}>{L('Ask Qor AI', 'Qor AI’ya Sor', 'Qor AI fragen')}</button>
        </div>

        {/* similar articles */}
        {more.length > 0 && (
          <section className="blog-similar">
            <h2>{L('Related guides', 'Benzer rehberler', 'Ähnliche Ratgeber')}</h2>
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

        {/* related products under the article */}
        {relProds.length > 0 && (
          <section className="blog-relprods">
            <h2>{L('Popular products', 'Popüler ürünler', 'Beliebte Produkte')}</h2>
            <div className="blog-relprods-grid">
              {relProds.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        {/* comments */}
        <section className="blog-comments">
          <h2>{L('Comments', 'Yorumlar', 'Kommentare')} ({comments.length})</h2>
          {user ? (
            <form className="bc-form" onSubmit={submitComment}>
              <textarea value={cText} onChange={(e) => setCText(e.target.value)} rows={3}
                placeholder={L('Write a comment…', 'Bir yorum yaz…', 'Schreibe einen Kommentar…')} maxLength={2000} />
              <button type="submit" className="btn btn-primary" disabled={cBusy || !cText.trim()}>
                {cBusy ? '…' : L('Post', 'Gönder', 'Senden')}
              </button>
            </form>
          ) : (
            <p className="bc-signin">
              {L('Sign in to join the conversation.', 'Yorum yapmak için giriş yap.', 'Melde dich an, um mitzureden.')}{' '}
              <button className="bc-link" onClick={() => openAuth?.()}>{L('Sign in', 'Giriş yap', 'Anmelden')}</button>
            </p>
          )}
          <div className="bc-list">
            {comments.length === 0 ? (
              <p className="bc-empty">{L('No comments yet — be the first.', 'Henüz yorum yok — ilk sen ol.', 'Noch keine Kommentare.')}</p>
            ) : comments.map((c) => (
              <div className="bc-item" key={c.id}>
                <div className="bc-head"><span className="bc-name">{c.name}</span><span className="bc-date">{fmtDate(c.created)}</span></div>
                <p className="bc-text">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* footer nav */}
        {post?.category ? (
          <div className="blog-foot">
            <Link to={categoryPath(post.category)} className="btn btn-ghost">{L('Browse all', 'Tümünü gör', 'Alle ansehen')} →</Link>
            <Link to="/blog" className="btn btn-ghost">{L('← All guides', '← Tüm rehberler', '← Alle Ratgeber')}</Link>
          </div>
        ) : (
          <div className="blog-foot"><Link to="/blog" className="btn btn-ghost">{L('← All guides', '← Tüm rehberler', '← Alle Ratgeber')}</Link></div>
        )}
      </article>
    </div>
  );
}
