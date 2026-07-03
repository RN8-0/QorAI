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

// Format a blog product's current price for the visitor's country from the live
// rollup (prices[cc]), falling back to the cheapest offer if it's already in the
// right currency. Empty string when there's no priced Amazon offer.
const BLOG_PRICE_CUR = { TR: 'TRY', DE: 'EUR', AT: 'EUR', GB: 'GBP', UK: 'GBP', US: 'USD' };
const BLOG_PRICE_LOC = { TR: 'tr-TR', DE: 'de-DE', AT: 'de-DE', GB: 'en-GB', UK: 'en-GB', US: 'en-US' };
function blogLivePrice(entry, country) {
  if (!entry) return '';
  const cc = String(country || 'TR').toUpperCase();
  const currency = BLOG_PRICE_CUR[cc] || 'USD';
  let amt = Number(entry.prices && entry.prices[cc]) || 0;
  if (!(amt > 0) && Number(entry.lowestPrice) > 0 && entry.lowestPriceCurrency === currency) amt = Number(entry.lowestPrice);
  if (!(amt > 0)) return '';
  try { return new Intl.NumberFormat(BLOG_PRICE_LOC[cc] || 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amt); }
  catch { return `${Math.round(amt)} ${currency}`; }
}

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

// Turn a "page" URL into a direct image URL where we can (Wikipedia/Wikimedia
// File:/Dosya: pages → Special:FilePath, which redirects to the actual file).
function normalizeImageUrl(url) {
  const u = String(url || '').trim();
  const m = u.match(/^https?:\/\/[^/]*\bwiki(?:pedia|media)\.org\/wiki\/(?:File|Dosya|Datei|Fichier|Archivo):(.+)$/i);
  if (m) return `https://commons.wikimedia.org/wiki/Special:FilePath/${m[1]}`;
  return u;
}
// On-error fallback chain for a blog image: direct → server proxy → hide.
function imageOnError(e) {
  const img = e.currentTarget;
  const orig = img.getAttribute('data-orig') || img.src;
  if (img.getAttribute('data-stage') !== 'proxy') {
    img.setAttribute('data-stage', 'proxy');
    img.src = `${pb.baseUrl.replace(/\/$/, '')}/api/img?url=${encodeURIComponent(orig)}`;
  } else {
    const fig = img.closest('figure'); if (fig) fig.style.display = 'none';
  }
}

// Inline markdown: **bold** and *italic*. Returns an array of strings/elements.
function parseInline(text, kp) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g).filter((s) => s !== '');
  return parts.map((seg, i) => {
    let m = seg.match(/^(?:\*\*|__)([\s\S]+)(?:\*\*|__)$/);
    if (m) return <strong key={`${kp}-b${i}`}>{m[1]}</strong>;
    m = seg.match(/^\*([\s\S]+)\*$/);
    if (m) return <em key={`${kp}-i${i}`}>{m[1]}</em>;
    return seg;
  });
}

// Renders a content-block's text as real, evenly-spaced structure so the
// editor's line breaks / bullets don't collapse into one run-on paragraph:
//  • "## " / "### " lines → headings (size control)
//  • a line that is just "Label:" / "Label?" → a bold sub-heading
//  • lines starting with -, –, —, •, * (space optional) → a tight <ul>
//  • "Label: rest" → bold label + rest
//  • everything else → its own paragraph
//  • inline **bold** / *italic* supported everywhere
function renderRichText(text, kp) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let bullets = [];
  // A line, with a leading "Label:" / "Label?" bolded + inline **bold**/*italic*.
  const fmtLine = (line, k) => {
    const m = line.match(/^([^:?]{2,32}[:?])\s+([\s\S]+)$/);
    if (m) return [<strong key={`${k}-l`}>{m[1]}</strong>, ' ', ...parseInline(m[2], k)];
    return parseInline(line, k);
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={`${kp}-u${out.length}`} className="post-prod-ul">
        {bullets.map((b, i) => <li key={i}>{fmtLine(b, `${kp}-u${out.length}-${i}`)}</li>)}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { flushBullets(); return; }
    // bullet — dash/bullet glyph, with or without a following space
    if (/^[-–—•*]\s*\S/.test(line)) { bullets.push(line.replace(/^[-–—•*]\s*/, '')); return; }
    flushBullets();
    // explicit heading markers
    let m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      const lvl = m[1].length; // 1→big, 3→small
      out.push(<p key={`${kp}-h${i}`} className={`post-prod-sub post-prod-sub-${lvl}`}>{parseInline(m[2], `${kp}-h${i}`)}</p>);
      return;
    }
    // standalone label line (e.g. "Artıları:", "Eksileri:") → sub-heading
    if (/^.{2,40}[:?]$/.test(line)) {
      out.push(<p key={`${kp}-s${i}`} className="post-prod-sub post-prod-sub-2">{parseInline(line, `${kp}-s${i}`)}</p>);
      return;
    }
    // "Label: rest" → bold the label, keep the rest inline
    m = line.match(/^([^:?]{2,32}[:?])\s+(.+)$/);
    if (m) {
      out.push(<p key={`${kp}-p${i}`} className="post-prod-desc"><strong>{m[1]}</strong> {parseInline(m[2], `${kp}-p${i}`)}</p>);
      return;
    }
    out.push(<p key={`${kp}-p${i}`} className="post-prod-desc">{parseInline(line, `${kp}-p${i}`)}</p>);
  });
  flushBullets();
  return out;
}

// A text block with an explicit style chosen in the admin editor (no markdown
// memorising needed). 'paragraph' keeps the smart auto-formatting; the others
// force a heading / sub-heading / bullet list for a consistent article standard.
function renderBlockText(text, style, kp) {
  const s = style || 'paragraph';
  if (s === 'heading' || s === 'subheading') {
    const cls = s === 'heading' ? 'post-prod-sub post-prod-sub-1' : 'post-prod-sub post-prod-sub-2';
    return String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .map((l, i) => <p key={`${kp}-h${i}`} className={cls}>{parseInline(l, `${kp}-h${i}`)}</p>);
  }
  if (s === 'bullets') {
    const items = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^[-–—•*]\s*/, '')).filter(Boolean);
    if (!items.length) return null;
    return <ul className="post-prod-ul">{items.map((b, i) => <li key={i}>{parseInline(b, `${kp}-b${i}`)}</li>)}</ul>;
  }
  return renderRichText(text, kp); // paragraph: smart auto-format (bullets/labels/**bold**)
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
  const [livePrices, setLivePrices] = useState({}); // id → product's per-country prices rollup
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
        const prods = Array.isArray(rec.products) ? rec.products.filter((p) => p && p.id && (p.kind || 'product') === 'product') : [];
        // LIVE prices: never trust the value baked into the article (frozen at
        // write time). Look up each product's current per-country price rollup so
        // the buy button always shows today's Amazon price (cron-refreshed).
        if (prods.length) {
          const filter = prods.map((p) => `id="${esc(p.id)}"`).join(' || ');
          pb.collection('products').getFullList({ filter, fields: 'id,prices,lowestPrice,lowestPriceCurrency', $autoCancel: false })
            .then((recs) => {
              if (!live) return;
              const m = {};
              for (const r of (recs || [])) m[r.id] = { prices: r.prices || {}, lowestPrice: r.lowestPrice, lowestPriceCurrency: r.lowestPriceCurrency };
              setLivePrices(m);
            }).catch(() => {});
        }
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
  // Custom items have a per-language name (name_tr/en/de); products/subscriptions
  // use their single catalog name. Resolve to the active language with fallbacks.
  const itemName = (p) => p[`name_${lang}`] || p.name_tr || p.name_en || p.name_de || p.name || '';
  const products = Array.isArray(post?.products) ? post.products.filter((p) => p && p.id && itemName(p)) : [];
  const cover = post?.cover || (post?.coverFile ? fileUrl(post, post.coverFile) : (products[0]?.image || products[0]?.imageUrl || ''));
  const url = `${SITE_URL}/blog/${slug}`;
  const pdesc = (p) => p[`desc_${lang}`] || p.desc_tr || p.desc_en || '';
  const pdesc2 = (p) => p[`desc2_${lang}`] || p.desc2_tr || p.desc2_en || '';
  const pimg = (p) => p.image || p.imageUrl || '';
  // Plain text for SEO / chat context, from the new blocks model or legacy descs.
  const blockText = (p) => {
    if (Array.isArray(p.blocks) && p.blocks.length) {
      return p.blocks.filter((b) => b.t === 'text').map((b) => b[lang] || b.tr || b.en || b.de || '').filter(Boolean).join(' ');
    }
    return `${pdesc(p)} ${pdesc2(p)}`.trim();
  };
  const publishedAt = post?.publishedAt || post?.created || '';
  const author = (post?.author || '').trim();
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
    ...products.map((p, i) => `${i + 1}. ${itemName(p)}${p.brand ? ` (${p.brand})` : ''}: ${blockText(p)}`.trim()),
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
      author: { '@type': 'Organization', name: author || 'Qor AI' },
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
    products.forEach((p, i) => parts.push(`${i + 1}. ${itemName(p)}${p.brand ? ` (${p.brand})` : ''}: ${blockText(p)}`.trim()));
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

  // One content block (product / subscription / custom), per its layout template.
  const renderProd = (p, i) => {
    const kind = p.kind || 'product';
    const name = itemName(p);
    const layout = p.layout || 'split';
    const size = p.imgSize || 'm';
    const img = pimg(p) || p.logo || '';
    // Resolve the internal/external link target for this item kind.
    const productTo = kind === 'product' ? productPath({ id: p.id, slug: p.slug, name }) : null;
    const subTo = kind === 'subscription' ? '/subscriptions' : null;
    const extHref = kind === 'custom' ? (p.link || '') : (kind === 'subscription' ? (p.affiliateUrl || p.website || '') : '');

    // Buttons per kind.
    let btns;
    if (kind === 'product') {
      btns = (
        <div className="post-prod-btns">
          <Link to={`${productTo}?ai=1`} className="ppbtn">✨ {L('AI analysis', 'AI Analizi', 'KI-Analyse')}</Link>
          <a href={amazonGoPath(p, geoCountry || 'TR')} target="_blank" rel="sponsored noopener nofollow" className="ppbtn ppbtn-amz" title="Amazon">
            <img src="/assets/amazon.svg" alt="Amazon" className="amz-logo" />
            {(() => { const lp = blogLivePrice(livePrices[p.id], geoCountry || 'TR') || p.price; return lp ? <span className="ppbtn-price">{lp}</span> : null; })()}
          </a>
          <Link to={productTo} className="ppbtn">→ {L('Product', 'Ürüne Git', 'Produkt')}</Link>
        </div>
      );
    } else if (kind === 'subscription') {
      btns = (
        <div className="post-prod-btns">
          <Link to={subTo} className="ppbtn">→ {L('Subscriptions', 'Abonelikler', 'Abos')}</Link>
          {extHref ? <a href={extHref} target="_blank" rel="sponsored noopener nofollow" className="ppbtn">🌐 {L('Official site', 'Resmi site', 'Offizielle Seite')}</a> : null}
        </div>
      );
    } else {
      btns = extHref ? (
        <div className="post-prod-btns">
          <a href={extHref} target="_blank" rel="sponsored noopener nofollow" className="ppbtn">→ {L('View', 'İncele', 'Ansehen')}</a>
        </div>
      ) : null;
    }

    // Title — links internally for product/subscription, externally for custom.
    let titleEl;
    if (kind === 'product') titleEl = <Link to={productTo} className="post-prod-title"><span className="ppn">{i + 1}.</span> {name}</Link>;
    else if (kind === 'subscription') titleEl = <Link to={subTo} className="post-prod-title"><span className="ppn">{i + 1}.</span> {name}</Link>;
    else if (extHref) titleEl = <a href={extHref} target="_blank" rel="noopener noreferrer" className="post-prod-title"><span className="ppn">{i + 1}.</span> {name}</a>;
    else titleEl = <span className="post-prod-title"><span className="ppn">{i + 1}.</span> {name}</span>;

    const linkFig = (el) => {
      if (kind === 'product') return <Link to={productTo}>{el}</Link>;
      if (kind === 'subscription') return <Link to={subTo}>{el}</Link>;
      if (extHref) return <a href={extHref} target="_blank" rel="noopener noreferrer">{el}</a>;
      return el;
    };

    let inner;
    const hasBlocks = Array.isArray(p.blocks) && p.blocks.length > 0;
    if (hasBlocks) {
      // New model: ordered text + image blocks. Floated images (left/right) let
      // the following text wrap down beside them; block order sets top/bottom.
      inner = (
        <div className="post-prod-blocks">
          {p.blocks.map((b, bi) => {
            if (b.t === 'image') {
              const u = b.url || '';
              if (!u) return null;
              const pos = b.pos || 'full';
              const bsize = b.size || 'm';
              const nu = normalizeImageUrl(u);
              return (
                <figure key={bi} className={`post-prod-fig fig-${pos} pp-${bsize}`}>
                  {linkFig(<img src={nu} data-orig={nu} alt={name} loading="lazy" onError={imageOnError} />)}
                </figure>
              );
            }
            const txt = b[lang] || b.tr || b.en || b.de || '';
            if (!String(txt).trim()) return null;
            return <div key={bi} className="post-prod-rich">{renderBlockText(txt, b.style, `${p.id || i}-${bi}`)}</div>;
          })}
          <div className="post-prod-clear" />
        </div>
      );
    } else {
      // Legacy model: desc1 / image / desc2 with a fixed layout template.
      // Run through renderRichText too so line breaks / bullets survive even
      // before an old article is re-saved into the block model.
      const d1 = pdesc(p) ? <div className="post-prod-rich">{renderRichText(pdesc(p), `${p.id || i}-d1`)}</div> : null;
      const d2 = pdesc2(p) ? <div className="post-prod-rich">{renderRichText(pdesc2(p), `${p.id || i}-d2`)}</div> : null;
      const nimg = normalizeImageUrl(img);
      const imgEl = img ? <span className={`post-prod-img pp-${size}`}>{linkFig(<img src={nimg} data-orig={nimg} alt={name} loading="lazy" onError={imageOnError} />)}</span> : null;
      if (layout === 'text' || !img) inner = <>{d1}{d2}</>;
      else if (layout === 'top') inner = <>{imgEl}{d1}{d2}</>;
      else if (layout === 'left') inner = <div className="post-prod-row">{imgEl}<div className="post-prod-rowtext">{d1}{d2}</div></div>;
      else if (layout === 'right') inner = <div className="post-prod-row rev">{imgEl}<div className="post-prod-rowtext">{d1}{d2}</div></div>;
      else inner = <>{d1}{imgEl}{d2}</>; // split (default)
    }
    return (
      <div className={`post-prod kind-${kind}`} key={p.id || `${kind}-${i}`}>
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
          {author ? <span className="blog-stat">✍ {author}</span> : null}
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
                const mcover = m.cover || (m.coverFile ? fileUrl(m, m.coverFile) : (mp[0]?.image || mp[0]?.imageUrl || ''));
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
