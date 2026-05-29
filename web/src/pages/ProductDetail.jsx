import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProduct, getSimilar } from '../lib/typesense';
import { askQorAi } from '../lib/ai';
import { useCompare } from '../lib/compare';
import { useI18n } from '../i18n/index.jsx';
import { catMeta, scoreClass, scoreLabel, PLACEHOLDER_IMG } from '../lib/format';
import ProductCard from '../components/ProductCard.jsx';
import AiText from '../components/AiText.jsx';
import Reviews from '../components/Reviews.jsx';
import { ensureSpecDictionary, trSpec } from '../lib/specDictionary';
import { useSeo, truncate, SITE_URL, DEFAULT_OG_IMAGE } from '../lib/seo';
import { pushRecent } from '../lib/recentViewed';
import { canonicalizeSpecMaps, canonicalSpecSection } from '../lib/specCanonical';
import './ProductDetail.css';

const YES_RE = /^(yes|var|evet|true|ja|oui|sí|si|sim|tak|有り|نعم)$/i;
const NO_RE = /^(no|yok|hayır|hayir|nein|non|não|nao|nie|false|無し|لا)$/i;

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

function aiPrompt(p, lang) {
  const productName = localizedProductName(p, lang);
  const ks = p.keySpecs && typeof p.keySpecs === 'object'
    ? Object.entries(p.keySpecs).slice(0, 14).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  return (
    'Analyze this tech product as Qor AI, a product advisor.\n' +
    `Product: ${productName}\nBrand: ${p.brand || '-'}\nCategory: ${p.category || '-'}\n` +
    `Qor AI score: ${p.techScore || '-'}/100\nKey specs: ${ks || '-'}\n\n` +
    'Give a concise review: a 2-3 sentence verdict, then **Strengths**, **Weaknesses** ' +
    'and **Who it is for** sections. Use "-" for bullets and **bold** headings. ' +
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
  if (product?.keySpecs && typeof product.keySpecs === 'object' && Object.keys(product.keySpecs).length > 0) {
    addRows(keySpecsTitle, '⭐', Object.entries(product.keySpecs));
  }

  const sections = product?.specSections && typeof product.specSections === 'object' ? product.specSections : null;
  if (sections) {
    for (const [section, specs] of Object.entries(sections)) {
      if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
        addRows(trSpec(section, lang), sectionIcon(section), Object.entries(specs));
      }
    }
  }

  // Catch-all: any flat spec that didn't make it into a section above.
  const flat = product?.specs && typeof product.specs === 'object' ? product.specs : null;
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
  const { has, toggle } = useCompare();

  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('specs');
  const [activeImg, setActiveImg] = useState(0);
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
        setP(prod); setActiveImg(0); setTab('specs');
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
  const images = (Array.isArray(p.images) && p.images.length ? p.images : [p.imageUrl]).filter(Boolean);
  const subscores = p.techSubscores && typeof p.techSubscores === 'object' ? p.techSubscores : null;
  const pros = Array.isArray(p.pros) ? p.pros.filter(Boolean) : [];
  const cons = Array.isArray(p.cons) ? p.cons.filter(Boolean) : [];
  const bricks = mergeSpecBricks(p, t('pd.keySpecs'), t('pd.allSpecs'), lang);
  const displayName = localizedProductName(p, lang);

  return (
    <div className="pd">
      <div className="container">
        <div className="pd-crumb">
          <Link to="/">{t('nav.home')}</Link> <span>/</span>
          <span>{meta.label}</span> <span>/</span>
          <b>{displayName}</b>
        </div>

        {/* HERO */}
        <div className="pd-top">
          <div className="pd-gallery">
            <div className="pd-main-img">
              <img src={images[activeImg] || PLACEHOLDER_IMG} alt={displayName}
                onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} />
            </div>
            {images.length > 1 && (
              <div className="pd-thumbs">
                {images.slice(0, 6).map((src, i) => (
                  <button key={i} className={'pd-thumb' + (i === activeImg ? ' active' : '')}
                    onClick={() => setActiveImg(i)}>
                    <img src={src} alt="" onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pd-info">
            <span className="pd-cat">{meta.icon} {meta.label}</span>
            {p.brand && <div className="pd-brand">{p.brand}</div>}
            <h1 className="pd-name">{displayName}</h1>

            <div className="pd-score-box">
              <div className={'pd-score-ring ' + scoreClass(p.techScore)}>
                <b>{scoreLabel(p.techScore)}</b>
                <small>/ 100</small>
              </div>
              <div className="pd-score-text">
                <strong>{t('pd.scoreTitle')}</strong>
                <span>{t('pd.scoreDesc')}</span>
              </div>
            </div>

            {subscores && (
              <div className="pd-subscores">
                {Object.entries(subscores).slice(0, 8).map(([k, v]) => {
                  const val = Math.max(0, Math.min(100, Number(v) || 0));
                  return (
                    <div className="pd-sub" key={k}>
                      <div className="pd-sub-row"><span>{k}</span><b>{Math.round(val)}</b></div>
                      <div className="pd-sub-bar"><i style={{ width: `${val}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pd-actions">
              {has(p.id) ? (
                <>
                  <Link to="/compare" className="btn btn-primary">{t('pd.openCompare')}</Link>
                  <button className="btn btn-ghost" onClick={() => toggle(p.id)}>{t('pd.inList')}</button>
                </>
              ) : (
                <button className="btn btn-primary"
                  onClick={() => { if (!toggle(p.id)) alert(t('pd.maxAlert', { max: 4 })); }}>
                  {t('pd.addCompare')}
                </button>
              )}
              <button className="btn btn-ghost"
                onClick={() => window.dispatchEvent(new CustomEvent('qor-open-ai', {
                detail: t('pd.askAiQuestion', { name: displayName }),
                }))}>
                {t('pd.askAi')}
              </button>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="pd-tabs">
          <button className={tab === 'specs' ? 'active' : ''} onClick={() => setTab('specs')}>
            {t('pd.tabSpecs')}
          </button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
            {t('pd.tabAi')}
          </button>
        </div>

        <div className="pd-tab-body">
          {tab === 'specs' && (
            <div className="pd-specs fade-up">
              {p.description && <p className="pd-desc">{p.description}</p>}
              {(pros.length > 0 || cons.length > 0) && (
                <div className="pd-pc">
                  {pros.length > 0 && (
                    <div className="pd-pc-col pd-pros">
                      <h4>{t('pd.pros')}</h4>
                      <ul>{pros.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                  {cons.length > 0 && (
                    <div className="pd-pc-col pd-cons">
                      <h4>{t('pd.cons')}</h4>
                      <ul>{cons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
              {bricks.length > 0 ? (
                <div className="pd-bricks">
                  {bricks.map((b, i) => <SpecBrick key={i} brick={b} lang={lang} dictReady={dictReady} />)}
                </div>
              ) : (
                !p.description && <div className="pd-note">{t('pd.noSpecs')}</div>
              )}
            </div>
          )}

          {tab === 'ai' && (
            <div className="fade-up">
              {aiBusy && (
                <div className="pd-ai-loading"><div className="spinner" /><span>{t('pd.aiLoading')}</span></div>
              )}
              {!aiBusy && aiText && (
                <div className="pd-ai">
                  <div className="pd-ai-head">{t('pd.aiHead')}</div>
                  <div className="pd-ai-body"><AiText text={aiText} /></div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SIMILAR PRODUCTS */}
        {similar.length > 0 && (
          <section className="pd-section">
            <div className="pd-section-head">
              <h2>{t('pd.similar')}</h2>
              <span>{t('pd.similarDesc')}</span>
            </div>
            <div className="pd-sim-row">
              {similar.map((sp) => (
                <div className="pd-sim-card" key={sp.id}><ProductCard product={sp} /></div>
              ))}
            </div>
          </section>
        )}

        {/* REVIEWS */}
        <Reviews productId={p.id} />
      </div>
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
