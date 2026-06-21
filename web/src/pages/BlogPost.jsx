import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL } from '../lib/seo';
import { productPath, categoryPath } from '../lib/routes';
import { amazonGoPath } from '../lib/format';
import { useGeoCountry } from '../lib/geo';
import './Blog.css';

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

export default function BlogPost() {
  const { slug } = useParams();
  const { lang } = useI18n();
  const geoCountry = useGeoCountry();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState('loading');
  const [more, setMore] = useState([]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const openedAt = useRef(Date.now());
  const readSent = useRef(false);

  const pick = (a, f) => (a ? (a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '') : '');

  useEffect(() => {
    let live = true;
    setStatus('loading'); setPost(null); openedAt.current = Date.now(); readSent.current = false;
    pb.collection('articles').getFirstListItem(`slug="${slug}" && status="published"`)
      .then((rec) => {
        if (!live) return;
        setPost(rec); setStatus('ok');
        setLikeCount(Number(rec.likes) || 0);
        try { setLiked(localStorage.getItem('qor-liked-' + slug) === '1'); } catch { /* ignore */ }
        track(slug, 'view');
        // similar articles
        pb.collection('articles').getList(1, 4, { filter: `status="published" && slug!="${slug}"`, sort: '-updated', fields: 'slug,cover,title_tr,title_en,title_de,lead_tr,lead_en,lead_de' })
          .then((r) => { if (live) setMore(r.items || []); }).catch(() => {});
      })
      .catch(() => { if (live) setStatus('notfound'); });
    return () => { live = false; };
  }, [slug]);

  // "read" event when the visitor reaches the bottom (with dwell duration).
  useEffect(() => {
    if (status !== 'ok') return undefined;
    const onScroll = () => {
      if (readSent.current) return;
      const scrolled = window.scrollY + window.innerHeight;
      if (scrolled >= document.body.scrollHeight - 600) {
        readSent.current = true;
        track(slug, 'read', Math.round((Date.now() - openedAt.current) / 1000));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [status, slug]);

  const title = pick(post, 'title');
  const lead = pick(post, 'lead');
  const body = pick(post, 'body');
  const conclusion = pick(post, 'conclusion');
  const cover = post?.cover || '';
  const products = Array.isArray(post?.products) ? post.products.filter((p) => p && p.id && p.name) : [];
  const url = `${SITE_URL}/blog/${slug}`;
  const pdesc = (p) => p[`desc_${lang}`] || p.desc_tr || p.desc_en || '';
  const publishedAt = post?.publishedAt || post?.created || '';

  const readMin = useMemo(() => {
    const words = `${body} ${conclusion} ${products.map(pdesc).join(' ')}`.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return Math.max(2, Math.round(words / 200));
  }, [body, conclusion, products, lang]);

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
    try { localStorage.setItem('qor-liked-' + slug, '1'); } catch { /* ignore */ }
    track(slug, 'like');
  };
  const onShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); }
    } catch { /* ignore */ }
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

  return (
    <div className="container blog-page">
      <article className="blog-article">
        <nav className="blog-crumb"><Link to="/">Qor AI</Link> › <Link to="/blog">Blog</Link></nav>

        {/* 1) stats bar */}
        <div className="blog-stats">
          {dateStr ? <span className="blog-stat">📅 {dateStr}</span> : null}
          <span className="blog-stat">⏱ {readMin} {L('min read', 'dk okuma', 'Min. Lesezeit')}</span>
          <button className={`blog-stat blog-like ${liked ? 'on' : ''}`} onClick={onLike}>❤ {likeCount}</button>
          <button className="blog-stat" onClick={onShare}>↗ {L('Share', 'Paylaş', 'Teilen')}</button>
        </div>

        {/* 2) title  3) lead  4) general intro */}
        <h1>{title}</h1>
        {lead ? <p className="blog-lead">{lead}</p> : null}
        {body ? <div className="blog-body" dangerouslySetInnerHTML={{ __html: body }} /> : null}

        {/* 5) product blocks: buttons → title → (image floated, desc wraps) */}
        {products.length > 0 && (
          <section className="blog-rank">
            {products.map((p, i) => {
              const to = productPath({ id: p.id, slug: p.slug, name: p.name });
              return (
                <div className="rank-item2" key={p.id}>
                  <div className="rank-top">
                    <span className="rank-num2">{i + 1}</span>
                    <div className="rank-btns">
                      <Link to={`${to}?ai=1`} className="rank-btn rank-btn-ai">✨ {L('AI analysis', 'AI Analizi', 'KI-Analyse')}</Link>
                      <a href={amazonGoPath(p, geoCountry || 'TR')} target="_blank" rel="sponsored noopener nofollow" className="rank-btn rank-btn-buy">🛒 {L('See on Amazon', "Amazon'da Gör", 'Bei Amazon')}</a>
                      <Link to={to} className="rank-btn rank-btn-ghost">→ {L('Go to product', 'Ürüne Git', 'Zum Produkt')}</Link>
                    </div>
                  </div>
                  <Link to={to} className="rank-title2">
                    {p.brand ? <span className="rank-brand">{p.brand}</span> : null}
                    {p.name}
                    {p.techScore ? <span className="rank-score">{p.techScore}/100</span> : null}
                  </Link>
                  <div className="rank-flow">
                    {p.imageUrl ? <Link to={to} className="rank-flow-img"><img src={p.imageUrl} alt={p.name} loading="lazy" /></Link> : null}
                    <p>{pdesc(p)}</p>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* 6) conclusion */}
        {conclusion ? (
          <section className="blog-concl">
            <h2>{L('Verdict', 'Sonuç', 'Fazit')}</h2>
            <div dangerouslySetInnerHTML={{ __html: conclusion }} />
          </section>
        ) : null}

        {/* 9) AI chat help */}
        <div className="blog-aihelp">
          <div>
            <strong>{L('Need help deciding?', 'Karar veremedin mi?', 'Unentschlossen?')}</strong>
            <p>{L('Ask Qor AI about this guide and your needs.', 'Bu rehber ve ihtiyacın hakkında Qor AI’ya sor.', 'Frag Qor AI zu diesem Ratgeber.')}</p>
          </div>
          <Link to={`/ai-chat?about=${encodeURIComponent(slug)}`} className="btn btn-primary">{L('Ask Qor AI', 'Qor AI’ya Sor', 'Qor AI fragen')}</Link>
        </div>

        {/* 7) similar articles */}
        {more.length > 0 && (
          <section className="blog-similar">
            <h2>{L('Related guides', 'Benzer rehberler', 'Ähnliche Ratgeber')}</h2>
            <div className="blog-similar-grid">
              {more.map((m) => (
                <Link key={m.slug} to={`/blog/${m.slug}`} className="blog-similar-card">
                  {m.cover ? <div className="blog-similar-img"><img src={m.cover} alt={pick(m, 'title')} loading="lazy" /></div> : null}
                  <span>{pick(m, 'title')}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 8) similar products → category */}
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
