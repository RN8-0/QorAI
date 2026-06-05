import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getProduct, getSimilar } from '../lib/typesense';
import { askQorAi } from '../lib/ai';
import { useCompare } from '../lib/compare';
import { useAuth } from '../lib/auth';
import { aiUserProfile, hasCompletedQuiz } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import { saveProductAnalysisHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { catMeta, categoryLabel, keySpecChips } from '../lib/format';
import { bestOfferForLang, fetchProductOffers, formatOfferPrice, offerClickPath } from '../lib/offers';
import ProductCard from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import AiText from '../components/AiText.jsx';
import Reviews from '../components/Reviews.jsx';
import { ensureSpecDictionary, trSpec } from '../lib/specDictionary';
import { useSeo, truncate, SITE_URL, DEFAULT_OG_IMAGE } from '../lib/seo';
import { pushRecent } from '../lib/recentViewed';
import { productImageList } from '../lib/imageUrl';
import { productPath } from '../lib/routes';
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

function normHeroSpecText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

function looksLikeScreenSize(value) {
  const raw = String(value || '');
  const text = normHeroSpecText(raw);
  if (!/\d/.test(text)) return false;
  if (/\d+\s*[x×]\s*\d+/.test(text)) return false;
  if (/(mp|mah|hz|khz|mhz|ghz|nits?|ppi|dpi|pixel|piksel|displayport|thunderbolt|usb|hdmi|gb|tb)/i.test(text)) {
    return false;
  }
  if (/(cm²|cm2|cm\^2|m²|m2|m\^2|mm)/i.test(raw)) return false;
  const n = Number((raw.match(/\d+(?:[.,]\d+)?/) || ['0'])[0].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return false;
  if (/\b(cm|centimeter|zentimeter)\b/i.test(text)) {
    const inches = n / 2.54;
    return inches >= 0.5 && inches <= 120;
  }
  return n >= 0.5 && n <= 120;
}

function heroSpecConcept(label, value) {
  const key = normHeroSpecText(label);
  const val = normHeroSpecText(value);
  const both = `${key} ${val}`;
  if (/(camera|kamera|megapixel|selfie|rear|front|arka kamera|on kamera)/.test(both)) return 'camera';
  const screenish = /(screen|display|ekran|bildschirm)/.test(key);
  const sizeish = /(size|boyut|groesse|grosse|größe|diagonal|inch|inc|inç|zoll|["″]|cm)/i.test(`${label} ${value}`);
  if (screenish && sizeish) return looksLikeScreenSize(value) ? 'screen' : '';
  if (/\bram\b|bellek|memory|arbeitsspeicher/.test(key)) return 'ram';
  if (/(storage|depolama|dahili depolama|speicher|ssd|hdd|kapasite)/.test(key) && !/(battery|batarya|pil|akku)/.test(key)) return 'storage';
  if (/(battery|batarya|pil|akku|power)/.test(key)) return 'battery';
  if (/(processor|prozessor|islemci|işlemci|\bcpu\b|chipset|\bsoc\b)/.test(key)) return 'cpu';
  if (/(\bgpu\b|graphics|grafik)/.test(key)) return 'gpu';
  if (/(operating system|isletim sistemi|işletim sistemi|\bos\b|software|yazilim|yazılım)/.test(key)) return 'os';
  if (/(5g|4g|lte|wi-?fi|wlan|bluetooth|nfc|network|baglanti|bağlantı|connect)/.test(both)) return 'network';
  if (/(resolution|cozunurluk|çözünürlük|auflosung|auflösung|pixel|piksel)/.test(key)) return 'resolution';
  if (/(weight|agirlik|ağırlık|gewicht)/.test(key)) return 'weight';
  return `misc:${key.replace(/[^a-z0-9]+/g, '_')}`;
}

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
function aiPrompt(p, lang, userProfile = {}) {
  const productName = localizedProductName(p, lang);
  const ks = p.keySpecs && typeof p.keySpecs === 'object'
    ? Object.entries(p.keySpecs).slice(0, 18).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const pros = Array.isArray(p.pros) ? p.pros.filter(Boolean).slice(0, 6).join('; ') : '';
  const cons = Array.isArray(p.cons) ? p.cons.filter(Boolean).slice(0, 6).join('; ') : '';
  const priceFresh = Date.parse(p.bestOfferExpiresAt || '') > Date.now();
  const price = priceFresh && Number(p.lowestPriceUSD) > 0 ? `${Number(p.lowestPriceUSD).toFixed(0)} USD` : '-';
  const profile = Object.entries(userProfile)
    .filter(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`)
    .slice(0, 14)
    .join('\n');
  return (
    'You are Qor AI, a senior product analyst. Produce a professional, in-depth analysis ' +
    'of the product below. Treat it as a real, current item in the Qor catalog.\n\n' +
    '## PRODUCT\n' +
    `Name: ${productName}\nBrand: ${p.brand || '-'}\nCategory: ${p.category || '-'}\n` +
    `Qor AI Tech Score: ${p.techScore || '-'}/100\nApprox. price: ${price}\n` +
    `Key specs: ${ks || '-'}\n` +
    (pros ? `Known strengths: ${pros}\n` : '') +
    (cons ? `Known weaknesses: ${cons}\n` : '') +
    (profile ? `\n## USER PROFILE\n${profile}\n` : '') +
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
  const url = `${SITE_URL}${productPath(p.id)}`;
  const priceFresh = Date.parse(p.bestOfferExpiresAt || '') > Date.now();
  const price = priceFresh ? Number(p.lowestPriceUSD) || 0 : 0;

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
    title, description, image, path: productPath(p.id), type: 'product',
    jsonLd: { '@context': 'https://schema.org', '@graph': [product, breadcrumb] },
  };
}

export default function ProductDetail() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const id = params.id || searchParams.get('id') || '';
  const { t, lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const { has, toggle } = useCompare();
  const { user } = useAuth();
  const requireAiAccess = useAiAccess(lang);

  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('specs');
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [dictReady, setDictReady] = useState(false);
  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);

  const [aiText, setAiText] = useState('');
  const [aiNotice, setAiNotice] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const aiRunRef = useRef('');
  const aiUserKeyRef = useRef('');

  const [similar, setSimilar] = useState([]);

  useEffect(() => {
    const key = `${user?.id || ''}|${user?.quizCompleted === true ? '1' : '0'}`;
    if (aiUserKeyRef.current && aiUserKeyRef.current !== key) aiRunRef.current = '';
    aiUserKeyRef.current = key;
  }, [user?.id, user?.quizCompleted]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setAiText(''); setAiNotice(''); setSimilar([]); aiRunRef.current = '';
    getProduct(id)
      .then((prod) => {
        if (!live) return;
        setP(prod); setOffers([]); setActiveImg(0); setLightbox(false); setTab('specs');
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
    if (!p?.id) {
      setOffers([]);
      return () => { live = false; };
    }
    setOffersLoading(true);
    fetchProductOffers(p.id)
      .then((items) => { if (live) setOffers(items); })
      .catch(() => { if (live) setOffers([]); })
      .finally(() => { if (live) setOffersLoading(false); });
    return () => { live = false; };
  }, [p?.id]);

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
    const runKey = `${p.id}|${lang}`;
    if (aiRunRef.current === runKey) return;
    aiRunRef.current = runKey;
    (async () => {
      setAiNotice('');
      setAiBusy(true);
      const access = await requireAiAccess('detail_ai', {
        onMessage: (message) => setAiNotice(message),
      });
      if (!access.ok) {
        setAiBusy(false);
        return;
      }
      try {
        const txt = await askQorAi([{ role: 'user', text: aiPrompt(p, lang, aiUserProfile(user)) }]);
        setAiText(txt);
        saveProductAnalysisHistory({ product: p, analysis: txt });
      } catch {
        setAiNotice(t('pd.aiError'));
      } finally {
        setAiBusy(false);
      }
    })();
  }, [tab, p, aiText, aiBusy, lang, requireAiAccess, t, user]);

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
  const setImageIndex = (index) => {
    if (!images.length) return;
    setActiveImg((index + images.length) % images.length);
  };
  const stepImage = (delta) => setImageIndex(activeImg + delta);
  // Category key specs with relative bars (same source the cards/app use).
  // The raw techSubscores (Engine/AnchorKey/Tier/…) are internal scoring-engine
  // diagnostics and are intentionally NOT shown to users.
  const chips = keySpecChips(p).slice(0, 6);
  const pros = Array.isArray(p.pros) ? p.pros.filter(Boolean) : [];
  const cons = Array.isArray(p.cons) ? p.cons.filter(Boolean) : [];
  const bricks = mergeSpecBricks(p, t('pd.keySpecs'), t('pd.allSpecs'), lang);
  const displayName = localizedProductName(p, lang);

  // Hero key specs: the structured screen/RAM/storage/battery chips first, then
  // topped up with measurable rows from the spec sheet to at least ~10 so the
  // column fills the height beside the photo (no empty space). Booleans
  // (Var/Yok), sponsored/ad rows and label-less values are skipped.
  const heroSpecs = (() => {
    const out = [];
    const seen = new Set();
    const push = (s) => {
      const label = String(s.label || '').trim();
      const value = String(s.value || '').trim();
      if (!label || !value) return;
      const concept = heroSpecConcept(label, value);
      if (!concept || seen.has(concept)) return;
      seen.add(concept); out.push({ ...s, label, value });
    };
    chips.forEach((c) => push({ key: c.labelKey, icon: SPEC_EMOJI[c.labelKey] || '•', value: c.value, label: t(c.labelKey) }));
    bricks.flatMap((br) => br.rows || []).forEach(([k, v]) => {
      const value = trSpec(String(v).split(/\r?\n/)[0].trim(), lang);
      const label = trSpec(k, lang).replace(/\s*:\s*$/, '');
      if (/\d/.test(value) && value.length <= 24 && !/sponsor|reklam|advert/i.test(`${label} ${value}`)) {
        push({ key: k, icon: sectionIcon(k), value, label });
      }
    });
    return out.slice(0, 10);
  })();

  const tech = Number(p.techScore) || 0;
  const match = matchScore(p);
  const offer = bestOfferForLang(offers, p, lang);
  const hasExactPrice = Boolean(offer?.hasExactPrice);
  const price = hasExactPrice ? Number(offer?.price) || 0 : 0;
  const displayPrice = hasExactPrice ? formatOfferPrice(offer, lang) : '';
  const offerUrl = offerClickPath(offer);

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1240 }}>
        {/* breadcrumb */}
        <nav className="pd-crumbs">
          <button className="pd-crumb-back" aria-label="back"
            onClick={() => (window.history.length > 1 ? window.history.back() : null)}>‹</button>
          <Link to="/">{L('Home', 'Ana Sayfa', 'Start')}</Link>
          <span aria-hidden="true">›</span>
          <Link to={`/category?cat=${encodeURIComponent(p.category || '')}`}>{categoryLabel(p.category, lang)}</Link>
          <span aria-hidden="true">›</span>
          <b title={displayName}>{displayName}</b>
        </nav>

        <div className="prod-grid pd-product-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(360px,0.86fr) minmax(0,1.14fr)', gap: 32, alignItems: 'start' }}>
          {/* gallery */}
          <div className="prod-gallery">
            <div className="card pd-gallery-card">
              <button className="pd-photo" type="button"
                onClick={() => setLightbox(true)}
                aria-label={L('Open product image', 'Ürün görselini büyüt', 'Produktbild vergrößern')}>
                <ProductImg src={images[activeImg]} alt={displayName} size="full" eager />
                <span className="pd-photo-zoom" aria-hidden="true">⤢</span>
              </button>
              {images.length > 1 && (
                <div className="pd-thumbs2">
                  {images.slice(0, 6).map((src, i) => (
                    <button key={i} type="button"
                      className={'pd-thumb2' + (i === activeImg ? ' on' : '')}
                      onClick={() => setImageIndex(i)} onMouseEnter={() => setImageIndex(i)}
                      aria-label={`${i + 1}`}>
                      <ProductImg src={src} alt="" size="card" />
                    </button>
                  ))}
                  {images.length > 6 && (
                    <button type="button" className="pd-thumb2 pd-thumb-more"
                      onClick={() => setLightbox(true)}>+{images.length - 6}</button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* info */}
          <div className="pd-info2">
            <div className="pd-brand2">{p.brand || meta.label}</div>
            <h1 className="pd-name2">{displayName}</h1>

            <div className="pd-scores2">
              <div className="pd-score2">
                <Gauge value={tech} size={56} stroke={6} color={techColor(tech)} fontSize={17} />
                <span className="pd-score2-t">
                  <small>⚙️ {t('pd.scoreTitle')}</small>
                  <b style={{ color: techColor(tech) }}>{bandLabel(tech, L)}</b>
                </span>
              </div>
              {/* The personal match score only shows for signed-in users who
                  have a profile from the quiz — hidden otherwise. */}
              {hasCompletedQuiz(user) && match > 0 && (
                <>
                  <span className="pd-score2-sep" />
                  <div className="pd-score2">
                    <Gauge value={match} size={56} stroke={6} color="var(--score-average)" fontSize={17} />
                    <span className="pd-score2-t">
                      <small>👤 {L('Your Match', 'Uyum Skorun', 'Dein Match')}</small>
                      <b style={{ color: 'var(--score-average)' }}>{bandLabel(match, L)}</b>
                    </span>
                  </div>
                </>
              )}
            </div>

            {heroSpecs.length > 0 && (
              <div className="pd-keyspecs2">
                {heroSpecs.map((c, i) => (
                  <div className="pd-keyspec2" key={`${c.key}-${i}`}>
                    <span className="pd-keyspec2-ic">{c.icon}</span>
                    <span className="pd-keyspec2-t">
                      <b title={c.value}>{c.value}</b>
                      <small>{c.label}</small>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="pd-actions2">
              {has(p.id) ? (
                <Link to="/compare" className="btn btn-primary pd-act-main">⚖ {t('pd.openCompare')}</Link>
              ) : (
                <button className="btn btn-primary pd-act-main"
                  onClick={() => { if (!toggle(p.id)) alert(t('pd.maxAlert', { max: 4 })); }}>⚖ {t('pd.addCompare')}</button>
              )}
              <button className="btn btn-ghost pd-act-ai"
                onClick={() => window.dispatchEvent(new CustomEvent('qor-open-ai', { detail: t('pd.askAiQuestion', { name: displayName }) }))}>
                💬 {t('pd.askAi')}
              </button>
            </div>

            {/* Affiliate store link — prices are intentionally not shown; the
                affiliate link itself stays so users can still jump to the store. */}
            {offerUrl && (
              <>
                <a className="btn btn-buy pd-store2" href={offerUrl} target="_blank" rel="sponsored noopener">
                  🛒 {L('View at store', 'Mağazada incele', 'Im Shop ansehen')}
                  {offer?.store ? <span className="pd-store2-name">· {offer.store}</span> : null}
                </a>
                <p className="pd-aff2">
                  {L(
                    'Some links may be affiliate links — this never changes your price or affects Qor AI scores.',
                    'Bazı bağlantılar affiliate olabilir — ödeyeceğin fiyatı değiştirmez, Qor AI puanlarını etkilemez.',
                    'Einige Links können Affiliate-Links sein — ohne Einfluss auf Preis oder Qor AI Bewertung.',
                  )}{' '}
                  <a href="/affiliate-disclosure.html">{L('Disclosure', 'Açıklama', 'Hinweis')}</a>
                </p>
              </>
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
                  {/* Key-spec overview removed here — it duplicated the hero key
                      specs; the full sectioned sheet below is the single source. */}
                  {bricks.length > 0 ? (
                    <div className="card pad pd-spec-sheet">
                      <div className="pd-section-title">📋 {L('Specifications', 'Teknik Özellikler', 'Spezifikationen')}</div>
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
                    {!aiBusy && aiNotice && <div className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>{aiNotice}</div>}
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
            <ScrollRail>
              {similar.map((sp) => <ProductCard key={sp.id} product={sp} />)}
            </ScrollRail>
          </>
        )}

        {/* REVIEWS */}
        <Reviews productId={p.id} />
      </div>
      {lightbox && createPortal(
        <div className="pd-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(false)}>
          <section className="pd-lightbox-panel" onClick={(e) => e.stopPropagation()}>
            <header className="pd-lightbox-head">
              <div>
                <strong>{displayName}</strong>
                <span>{L('Product images', 'Ürün görselleri', 'Produktbilder')} · {activeImg + 1}/{images.length}</span>
              </div>
              <button className="pd-lightbox-close" type="button"
                aria-label={L('Close image', 'Görseli kapat', 'Bild schließen')}
                onClick={() => setLightbox(false)}>
                ×
              </button>
            </header>
            <div className="pd-lightbox-body">
              {images.length > 1 && (
                <button className="pd-lightbox-nav pd-lightbox-prev" type="button"
                  aria-label={L('Previous image', 'Önceki görsel', 'Vorheriges Bild')}
                  onClick={() => stepImage(-1)}>
                  ‹
                </button>
              )}
              <div className="pd-lightbox-img">
                <ProductImg src={images[activeImg]} alt={displayName} size="full" eager />
              </div>
              {images.length > 1 && (
                <button className="pd-lightbox-nav pd-lightbox-next" type="button"
                  aria-label={L('Next image', 'Sonraki görsel', 'Nächstes Bild')}
                  onClick={() => stepImage(1)}>
                  ›
                </button>
              )}
              {images.length > 1 && (
                <aside className="pd-lightbox-thumbs">
                  {images.map((src, index) => (
                    <button key={`${src}-${index}`} type="button"
                      className={index === activeImg ? 'on' : ''}
                      onClick={() => setImageIndex(index)}>
                      <ProductImg src={src} alt="" size="thumb" />
                    </button>
                  ))}
                </aside>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Horizontally scrollable rail with prev/next arrows (desktop affordance for
// the otherwise touch-only swipe). Arrows hide when there's nothing to scroll.
function ScrollRail({ children }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 8, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [children]); // eslint-disable-line
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * Math.max(320, ref.current.clientWidth * 0.85), behavior: 'smooth' });
  return (
    <div className="pd-rail-wrap">
      {edges.left && <button type="button" className="pd-rail-arr pd-rail-prev" aria-label="‹" onClick={() => scroll(-1)}>‹</button>}
      <div className="rail" ref={ref}>{children}</div>
      {edges.right && <button type="button" className="pd-rail-arr pd-rail-next" aria-label="›" onClick={() => scroll(1)}>›</button>}
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
