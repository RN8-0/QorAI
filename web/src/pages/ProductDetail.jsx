import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProduct, getSimilar } from '../lib/typesense';
import { askQorAi } from '../lib/ai';
import { useCompare } from '../lib/compare';
import { useI18n } from '../i18n/index.jsx';
import { catMeta, keySpecChips } from '../lib/format';
import ProductCard from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import AiText from '../components/AiText.jsx';
import Reviews from '../components/Reviews.jsx';
import { ensureSpecDictionary, trSpec } from '../lib/specDictionary';
import { useSeo, truncate, SITE_URL, DEFAULT_OG_IMAGE } from '../lib/seo';
import { pushRecent } from '../lib/recentViewed';
import { productImageList } from '../lib/imageUrl';
import './ProductDetail.css';

const YES_RE = /^(yes|var|evet|true|ja|oui|sí|si|sim|tak|有り|نعم)$/i;
const NO_RE = /^(no|yok|hayır|hayir|nein|non|não|nao|nie|false|無し|لا)$/i;

// Deterministic "fit" score for the web (there is no per-user profile here): a
// stable derivation from the tech score so the dual gauge mirrors the app.
function matchScore(p) {
  const s = Number(p.techScore) || 0;
  if (s <= 0) return 0;
  const id = String(p.id || '');
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 23;
  return Math.max(45, Math.min(96, Math.round(s * 0.82 + 10 + (h - 11) * 0.6)));
}
function bandLabel(s, L) {
  return s >= 90 ? L('Excellent', 'Mükemmel', 'Exzellent')
    : s >= 75 ? L('Good', 'İyi', 'Gut')
    : s >= 55 ? L('Average', 'Orta', 'Durchschnitt')
    : L('Weak', 'Zayıf', 'Schwach');
}
const SPEC_EMOJI = { 'spec.screen': '🖥️', 'spec.ram': '🧠', 'spec.storage': '💾', 'spec.battery': '🔋', 'spec.camera': '📷', 'spec.cpu': '⚙️', 'spec.gpu': '🎮' };

function premiumFeats(L) {
  return [
    { emoji: '📈', color: '#10B981', t: L('AI review summary', 'AI yorum özeti', 'KI-Bewertungszusammenfassung'), d: L('Reddit, YouTube & forums distilled', 'Reddit, YouTube ve forumlar özetlenir', 'Reddit, YouTube & Foren destilliert') },
    { emoji: '🧠', color: '#7C3AED', t: L('Deep AI analysis', 'Derin AI analizi', 'Tiefe KI-Analyse'), d: L('A detailed report tuned to your profile', 'Profiline göre detaylı rapor', 'Detaillierter Bericht für dein Profil') },
    { emoji: '🔀', color: '#F97316', t: L('Smart alternatives', 'Akıllı alternatifler', 'Smarte Alternativen'), d: L('Better-value picks in the same class', 'Aynı sınıfta daha iyi değerli seçenekler', 'Bessere Optionen derselben Klasse') },
    { emoji: '🧑‍💼', color: '#2196F3', t: L('AI advisor chat', 'AI danışman sohbeti', 'KI-Berater-Chat'), d: L('Ask anything about this product', 'Bu ürün hakkında her şeyi sor', 'Frag alles zu diesem Produkt') },
    { emoji: '📉', color: '#10B981', t: L('Price prediction', 'Fiyat tahmini', 'Preisprognose'), d: L('Know the best time to buy', 'En iyi alım zamanını öğren', 'Kenne den besten Kaufzeitpunkt') },
  ];
}

function sectionIcon(name) {
  const n = (name || '').toLowerCase();
  const has = (...k) => k.some((x) => n.includes(x));
  if (has('ekran', 'display', 'screen')) return '🖥️';
  if (has('batarya', 'pil', 'battery', 'güç', 'power')) return '🔋';
  if (has('kamera', 'camera')) return '📸';
  if (has('işlemci', 'islemci', 'processor', 'chip', 'cpu')) return '🧠';
  if (has('grafik', 'graphic', 'gpu')) return '🎮';
  if (has('bağlant', 'baglant', 'connect', 'i/o', 'ağ', 'network', 'yuva')) return '🔌';
  if (has('bellek', 'memory', 'ram', 'depolama', 'storage')) return '💾';
  if (has('tasarım', 'tasarim', 'design', 'boyut', 'dimension', 'ölçü', 'fonksiyon')) return '📐';
  if (has('ses', 'audio', 'hoparlör', 'speaker')) return '🔊';
  if (has('sensör', 'sensor')) return '📡';
  if (has('işletim', 'isletim', 'os', 'yazılım', 'software')) return '💻';
  if (has('soğut', 'sogut', 'cooling', 'fan')) return '❄️';
  if (has('doküman', 'dokuman', 'document', 'kılavuz')) return '📄';
  if (has('özellik', 'ozellik', 'feature', 'öne')) return '✨';
  if (has('temel', 'genel', 'general', 'core')) return 'ℹ️';
  return '📋';
}

// Mirrors the mobile app's senior-analyst (PRO) product analysis: a grounded,
// professional report with a verdict, strengths, weaknesses, community
// reception and a buyer fit — driven by the product's real catalog data.
function aiPrompt(p, lang) {
  const productName = localizedProductName(p, lang);
  const ks = p.keySpecs && typeof p.keySpecs === 'object'
    ? Object.entries(p.keySpecs).slice(0, 18).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const pros = Array.isArray(p.pros) ? p.pros.filter(Boolean).slice(0, 6).join('; ') : '';
  const cons = Array.isArray(p.cons) ? p.cons.filter(Boolean).slice(0, 6).join('; ') : '';
  const price = Number(p.lowestPriceUSD) > 0 ? `${Number(p.lowestPriceUSD).toFixed(0)} USD` : '-';
  return (
    'You are Qor AI, a senior product analyst. Produce a professional, in-depth analysis ' +
    'of the product below. Treat it as a real, current item in the Qor catalog.\n\n' +
    '## PRODUCT\n' +
    `Name: ${productName}\nBrand: ${p.brand || '-'}\nCategory: ${p.category || '-'}\n` +
    `Qor AI Tech Score: ${p.techScore || '-'}/100\nApprox. price: ${price}\n` +
    `Key specs: ${ks || '-'}\n` +
    (pros ? `Known strengths: ${pros}\n` : '') +
    (cons ? `Known weaknesses: ${cons}\n` : '') +
    '\n## OUTPUT (markdown only, no preamble)\n' +
    '**Verdict** — 2-3 sentence professional bottom line, honest about value at this price.\n' +
    '**Strengths** — 3-5 "-" bullets grounded in the specs above.\n' +
    '**Weaknesses** — 2-4 honest "-" bullets.\n' +
    '**Community reception** — 2-3 sentences synthesising how reviewers and owners generally regard it.\n' +
    '**Who it is for** — 1-2 sentences on the ideal buyer, and who should skip it.\n\n' +
    'Be specific and reference real spec values; do not invent specs not implied above. ' +
    'Never mention being an AI model or any backend provider. ' +
    `Reply ONLY in the language with ISO code: ${lang}.`
  );
}

function localizedProductName(product, lang) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const translated = product?.nameTranslated?.[code];
  if (translated && String(translated).trim()) return translated;
  return trSpec(product?.name || '', code);
}

function mergeSpecBricks(product, keySpecsTitle, allSpecsTitle, lang) {
  const bricks = [];
  const seen = new Set();
  const addRows = (title, icon, entries) => {
    const rows = [];
    (entries || []).forEach(([k, v]) => {
      const key = String(k || '').trim();
      const value = v == null ? '' : String(v).trim();
      if (!key || !value) return;
      const sig = key.toLowerCase();
      if (seen.has(sig)) return;
      rows.push([key, v]);
      seen.add(sig);
    });
    if (rows.length) bricks.push({ title, icon, rows });
  };

  // Render the ORIGINAL product.specSections structure intact and translate
  // section names / keys / values via trSpec(). Earlier we ran the data
  // through canonicalizeSpecMaps which collapsed many keys into hard-coded
  // canonical names (Processor, CPU cores, …) and re-bucketed sections via
  // a small Vv/keyRules list. For CPU products that list has gaps, so whole
  // sections like TEMEL BİLGİLER (Desteklediği Teknolojiler, Jenerasyon,
  // PassMark Puanı, Çıkış Dönemi/Yılı, İşlemci Mimarisi / Serisi / Türü /
  // Üst Modeli) silently disappeared from the EN view because their
  // canonical key collided with nothing and the canonical section bucket
  // they landed in got overwritten by other content. Per-row trSpec()
  // translation already handles localisation; the canonical step was just
  // throwing data away.
  const usesTurkishSource = String(product?.sourceLang || '').toLowerCase() === 'tr';
  const keySpecs = usesTurkishSource && product?.sourceKeySpecs && typeof product.sourceKeySpecs === 'object'
    ? product.sourceKeySpecs
    : product?.keySpecs;
  if (keySpecs && typeof keySpecs === 'object' && Object.keys(keySpecs).length > 0) {
    addRows(keySpecsTitle, '⭐', Object.entries(keySpecs));
  }

  const sections = usesTurkishSource && product?.sourceSpecSections && typeof product.sourceSpecSections === 'object'
    ? product.sourceSpecSections
    : (product?.specSections && typeof product.specSections === 'object' ? product.specSections : null);
  if (sections) {
    for (const [section, specs] of Object.entries(sections)) {
      if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
        addRows(trSpec(section, lang), sectionIcon(section), Object.entries(specs));
      }
    }
  }

  // Catch-all: any flat spec that didn't make it into a section above.
  const flat = usesTurkishSource && product?.sourceSpecs && typeof product.sourceSpecs === 'object'
    ? product.sourceSpecs
    : (product?.specs && typeof product.specs === 'object' ? product.specs : null);
  if (flat) {
    const missing = Object.entries(flat).filter(([k, v]) =>
      k && v != null && String(v).trim() !== '' && !seen.has(String(k).toLowerCase()),
    );
    if (missing.length) addRows(trSpec(allSpecsTitle, lang), '📋', missing);
  }
  return bricks;
}


// Builds title / description / Open Graph + Product & Breadcrumb JSON-LD.
function buildProductSeo(p, t) {
  if (!p) {
    return { title: `${t('pd.notFound')} · Qor AI`, noindex: true };
  }
  const meta = catMeta(p.category);
  const keySpecs = p.keySpecs && typeof p.keySpecs === 'object'
    ? Object.entries(p.keySpecs).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')
    : '';
  const score = Number(p.techScore) || 0;
  const title = `${p.name} · ${meta.label} — Qor AI`;
  const description = truncate(
    p.description
    || `${p.name}: ${p.brand ? `${p.brand}, ` : ''}${meta.label}. `
       + `${score > 0 ? `Qor AI teknik skoru ${score}/100. ` : ''}`
       + `${keySpecs ? `${keySpecs}. ` : ''}`
       + 'Özellikleri incele, karşılaştır ve karar ver.',
  );
  const image = p.imageUrl || DEFAULT_OG_IMAGE;
  const url = `${SITE_URL}/product/${p.id}`;
  const price = Number(p.lowestPriceUSD) || 0;

  const product = {
    '@type': 'Product',
    name: p.name,
    image,
    description,
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.category ? { category: meta.label } : {}),
    ...(price > 0 ? {
      offers: {
        '@type': 'Offer', price: price.toFixed(2),
        priceCurrency: 'USD', url, availability: 'https://schema.org/InStock',
      },
    } : {}),
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: meta.label, item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 3, name: p.name, item: url },
    ],
  };
  return {
    title, description, image, type: 'product',
    jsonLd: { '@context': 'https://schema.org', '@graph': [product, breadcrumb] },
  };
}

export default function ProductDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const { has, toggle } = useCompare();

  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('specs');
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [dictReady, setDictReady] = useState(false);

  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const [similar, setSimilar] = useState([]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setAiText(''); setSimilar([]);
    getProduct(id)
      .then((prod) => {
        if (!live) return;
        setP(prod); setActiveImg(0); setLightbox(false); setTab('specs');
        if (prod) {
          pushRecent(prod);
          getSimilar(prod.category, prod.techScore, prod.id).then((s) => live && setSimilar(s)).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  useEffect(() => {
    let live = true;
    if (lang === 'tr') {
      setDictReady(true);
      return () => { live = false; };
    }
    ensureSpecDictionary().then(() => { if (live) setDictReady(true); });
    return () => { live = false; };
  }, [lang]);

  // Generate the AI analysis the first time the tab is opened.
  useEffect(() => {
    if (tab !== 'ai' || !p || aiText || aiBusy) return;
    setAiBusy(true);
    askQorAi([{ role: 'user', text: aiPrompt(p, lang) }])
      .then((txt) => setAiText(txt))
      .catch(() => setAiText(t('pd.aiError')))
      .finally(() => setAiBusy(false));
  }, [tab, p]); // eslint-disable-line

  useSeo(buildProductSeo(p, t));

  if (loading) {
    return (
      <div className="container pd">
        <div className="pd-top">
          <div className="skel pd-skel-img" />
          <div style={{ flex: 1 }}>
            <div className="skel" style={{ height: 14, width: '30%' }} />
            <div className="skel" style={{ height: 30, width: '75%', marginTop: 12 }} />
            <div className="skel" style={{ height: 80, width: '100%', marginTop: 18 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="container pd-missing">
        <div className="pd-missing-icon">🔍</div>
        <h2>{t('pd.notFound')}</h2>
        <p>{t('pd.notFoundDesc')}</p>
        <Link to="/" className="btn btn-primary">{t('pd.backToCatalog')}</Link>
      </div>
    );
  }

  const meta = catMeta(p.category);
  const images = productImageList(p, 'full');
  // Category key specs with relative bars (same source the cards/app use).
  // The raw techSubscores (Engine/AnchorKey/Tier/…) are internal scoring-engine
  // diagnostics and are intentionally NOT shown to users.
  const chips = keySpecChips(p).slice(0, 6);
  const pros = Array.isArray(p.pros) ? p.pros.filter(Boolean) : [];
  const cons = Array.isArray(p.cons) ? p.cons.filter(Boolean) : [];
  const bricks = mergeSpecBricks(p, t('pd.keySpecs'), t('pd.allSpecs'), lang);
  const displayName = localizedProductName(p, lang);

  const tech = Number(p.techScore) || 0;
  const match = matchScore(p);
  const price = Number(p.lowestPriceUSD) || 0;

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1240 }}>
        {/* top action row */}
        <div className="between" style={{ marginBottom: 18 }}>
          <button className="iconbtn" aria-label="back"
            onClick={() => (window.history.length > 1 ? window.history.back() : null)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <div className="row" style={{ gap: 8 }}>
            {has(p.id) ? (
              <Link to="/compare" className="btn btn-ghost" style={{ padding: '9px 16px' }}>⚖ {t('pd.openCompare')}</Link>
            ) : (
              <button className="btn btn-ghost" style={{ padding: '9px 16px' }}
                onClick={() => { if (!toggle(p.id)) alert(t('pd.maxAlert', { max: 4 })); }}>⚖ {t('pd.addCompare')}</button>
            )}
            <button className="btn btn-ghost"
              onClick={() => window.dispatchEvent(new CustomEvent('qor-open-ai', { detail: t('pd.askAiQuestion', { name: displayName }) }))}>
              💬 {t('pd.askAi')}
            </button>
          </div>
        </div>

        <div className="prod-grid pd-product-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(360px,0.86fr) minmax(0,1.14fr)', gap: 32, alignItems: 'start' }}>
          {/* gallery */}
          <div className="prod-gallery">
            <div className="card pd-gallery-card">
              <button className="img-tile pd-main-photo" type="button"
                onClick={() => setLightbox(true)}
                aria-label={L('Open product image', 'Ürün görselini büyüt', 'Produktbild vergrößern')}>
                <ProductImg src={images[activeImg]} alt={displayName} size="full" eager />
              </button>
              {images.length > 1 && (
                <div className="row wrap" style={{ gap: 10, justifyContent: 'center' }}>
                  {images.slice(0, 6).map((src, i) => (
                    <button key={i} type="button" className="img-tile" style={{ width: 60, height: 60, padding: 0, borderColor: i === activeImg ? 'var(--brand-cyan)' : 'var(--border)', boxShadow: i === activeImg ? '0 0 0 3px color-mix(in srgb, var(--brand-cyan) 22%, transparent)' : 'none' }} onClick={() => setActiveImg(i)}>
                      <ProductImg src={src} alt="" size="card" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* info */}
          <div>
            <div className="brand-k" style={{ color: 'var(--brand-cyan)', fontSize: 13, fontWeight: 800, letterSpacing: '0', textTransform: 'uppercase' }}>{p.brand || meta.label}</div>
            <h1 style={{ fontSize: 'clamp(24px,3vw,32px)', fontWeight: 800, letterSpacing: '0', lineHeight: 1.12, margin: '6px 0 18px' }}>{displayName}</h1>

            {/* dual score */}
            <div className="card pad" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="row" style={{ flex: 1, gap: 14 }}>
                <Gauge value={tech} size={64} stroke={6} color={techColor(tech)} />
                <div>
                  <div style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: 13 }}>⚙️ {t('pd.scoreTitle')}</div>
                  <div style={{ color: techColor(tech), fontWeight: 800, fontSize: 19 }}>{bandLabel(tech, L)}</div>
                </div>
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--divider)', margin: '0 6px' }} />
              <div className="row" style={{ flex: 1, gap: 14 }}>
                <Gauge value={match} size={64} stroke={6} color="var(--score-average)" />
                <div>
                  <div style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: 13 }}>👤 {L('Your Match', 'Uyum Skorun', 'Dein Match')}</div>
                  <div style={{ color: 'var(--score-average)', fontWeight: 800, fontSize: 19 }}>{bandLabel(match, L)}</div>
                </div>
              </div>
            </div>

            {/* buy strip */}
            {price > 0 && (
              <div className="card pad" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div className="dim" style={{ fontSize: 12, fontWeight: 700 }}>{L('Best price', 'En iyi fiyat', 'Bester Preis')}</div>
                  <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0' }}>${price.toLocaleString(lang)}</span>
                </div>
                <div className="grow" />
                <button className="btn btn-buy"
                  onClick={() => window.dispatchEvent(new CustomEvent('qor-open-ai', { detail: t('pd.askAiQuestion', { name: displayName }) }))}>
                  🛒 {L('Find best offer', 'En iyi teklifi bul', 'Bestes Angebot finden')}
                </button>
              </div>
            )}

          </div>
          <div className="pd-detail-pane">
            {/* tabs */}
            <div className={'tabs' + (tab === 'premium' ? ' violet' : '')} style={{ marginTop: 22 }}>
              <button className={tab === 'specs' ? 'on' : ''} onClick={() => setTab('specs')}>{t('pd.tabSpecs')}</button>
              <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>{t('pd.tabAi')}</button>
              <button className={tab === 'premium' ? 'on' : ''} onClick={() => setTab('premium')}>Premium</button>
            </div>

            <div style={{ marginTop: 20 }}>
              {tab === 'specs' && (
                <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  {p.description && <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>{p.description}</p>}
                  {chips.length > 0 && (
                    <div className="card pad">
                      <div className="row" style={{ gap: 8, marginBottom: 16, fontWeight: 800, color: 'var(--brand-cyan)' }}>✨ {L('Key specs', 'Ana Özellikler', 'Wichtige Daten')}</div>
                      <div className="spec-grid">
                        {chips.map((c) => (
                          <div className="spec-cell" key={c.labelKey}>
                            <div style={{ fontSize: 20 }}>{SPEC_EMOJI[c.labelKey] || '•'}</div>
                            <div className="sv">{c.value}</div>
                            <div className="sk">{t(c.labelKey)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {bricks.length > 0 ? (
                    <div className="card pad">
                      <div className="row" style={{ gap: 8, marginBottom: 6, fontWeight: 800 }}>📋 {L('Specifications', 'Teknik Özellikler', 'Spezifikationen')}</div>
                      <div className="pd-bricks">
                        {bricks.map((b, i) => <SpecBrick key={i} brick={b} lang={lang} dictReady={dictReady} />)}
                      </div>
                    </div>
                  ) : (
                    !p.description && <div className="card pad muted">{t('pd.noSpecs')}</div>
                  )}
                </div>
              )}

              {tab === 'ai' && (
                <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="card pad" style={{ borderColor: 'color-mix(in srgb, var(--violet) 30%, transparent)', background: 'color-mix(in srgb, var(--violet) 5%, var(--surface-2))' }}>
                    <div className="row" style={{ gap: 9, marginBottom: 10 }}>
                      <span className="cat-ic" style={{ width: 38, height: 38, fontSize: 18, background: 'var(--grad-violet)', borderRadius: 'var(--r-sm)' }}>🧠</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{t('pd.aiHead')}</div>
                        <div className="tag tag-violet" style={{ marginTop: 2 }}>PRO · senior analyst</div>
                      </div>
                    </div>
                    {aiBusy && <div className="pd-ai-loading"><div className="spinner" /><span>{t('pd.aiLoading')}</span></div>}
                    {!aiBusy && aiText && <div style={{ fontSize: 15, lineHeight: 1.65 }}><AiText text={aiText} /></div>}
                  </div>
                  {pros.length > 0 && (
                    <div className="ad-card ad-pos">
                      <h4>✓ {t('pd.pros').toUpperCase()}</h4>
                      <ul>{pros.map((x, i) => <li key={i}><span>✓</span><span>{x}</span></li>)}</ul>
                    </div>
                  )}
                  {cons.length > 0 && (
                    <div className="ad-card ad-neg">
                      <h4>⚠ {t('pd.cons').toUpperCase()}</h4>
                      <ul>{cons.map((x, i) => <li key={i}><span>✕</span><span>{x}</span></li>)}</ul>
                    </div>
                  )}
                </div>
              )}

              {tab === 'premium' && (
                <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {premiumFeats(L).map((f, i) => (
                    <div className="pfeat" key={i}>
                      <span className="pic" style={{ fontSize: 20, background: `linear-gradient(135deg, ${f.color}, ${f.color}bb)` }}>{f.emoji}</span>
                      <div className="grow">
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{f.t}</div>
                        <div className="muted" style={{ fontSize: 13.5 }}>{f.d}</div>
                      </div>
                      <span className="tag tag-violet">PRO</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SIMILAR */}
        {similar.length > 0 && (
          <>
            <div className="sec-head" style={{ marginTop: 48 }}><h2><span className="bar" /> {t('pd.similar')}</h2></div>
            <div className="rail">
              {similar.map((sp) => <ProductCard key={sp.id} product={sp} />)}
            </div>
          </>
        )}

        {/* REVIEWS */}
        <Reviews productId={p.id} />
      </div>
      {lightbox && (
        <div className="pd-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(false)}>
          <button className="pd-lightbox-close" type="button"
            aria-label={L('Close image', 'Görseli kapat', 'Bild schließen')}
            onClick={() => setLightbox(false)}>
            x
          </button>
          <div className="pd-lightbox-img" onClick={(e) => e.stopPropagation()}>
            <ProductImg src={images[activeImg]} alt={displayName} size="full" eager />
          </div>
        </div>
      )}
    </div>
  );
}

function SpecBrick({ brick, lang }) {
  const rows = brick.rows.filter(([, v]) => v != null && String(v).trim() !== '');
  if (!rows.length) return null;
  return (
    <div className="pd-brick">
      <div className="pd-brick-head"><span>{brick.icon}</span> {trSpec(brick.title, lang)}</div>
      <div className="pd-brick-body">
        {rows.map(([k, v]) => {
          const s = trSpec(String(v).trim(), lang);
          const label = trSpec(k, lang);
          const yes = YES_RE.test(s);
          const no = NO_RE.test(s);
          const lines = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
          return (
            <div className="pd-srow" key={k}>
              <div className="pd-sk">{label}</div>
              <div className={'pd-sv' + (yes ? ' yes' : no ? ' no' : '')}>
                {yes ? `✓ ${s}` : no ? `✗ ${s}`
                  : lines.length > 1
                    ? lines.map((ln, i) => <div key={i} className="pd-sv-line">{ln}</div>)
                    : s}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
