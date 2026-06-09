import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useParams, useSearchParams, Link } from 'react-router-dom';
import { getProduct, getSimilar, getVariants } from '../lib/typesense';
import { askQorAi } from '../lib/ai';
import { useCompare, COMPARE_MAX } from '../lib/compare';
import { useFavorites } from '../lib/favorites';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import { saveProductAnalysisHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { amazonUrlForProduct, catMeta, categoryLabel, keySpecChips } from '../lib/format';
import { useGeoCountry } from '../lib/geo';
import { bestOfferForLang, fetchProductOffers, formatOfferPrice, offerClickPath } from '../lib/offers';
import ProductCard from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import AmazonLogo from '../components/AmazonLogo.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import AiText from '../components/AiText.jsx';
import AiAnalysisView, {
  buildDeepPrompt, buildAltPrompt, buildAdvisorPrompt, buildPredictionPrompt, buildForumPrompt, parseAiJson,
} from '../components/AiAnalysis.jsx';
import Reviews from '../components/Reviews.jsx';
import { ensureSpecDictionary, trSpec } from '../lib/specDictionary';
import { localizedSpecLabel, localizedSpecValue } from '../lib/specDisplay';
import { useSeo, truncate, SITE_URL, DEFAULT_OG_IMAGE } from '../lib/seo';
import { pushRecent } from '../lib/recentViewed';
import { productImageList } from '../lib/imageUrl';
import { extractProductId, productPath } from '../lib/routes';
import { calculateProfileMatchScore, hasProfileMatch } from '../lib/profileMatch';
import './ProductDetail.css';

const YES_RE = /^(yes|var|evet|true|ja|oui|sí|si|sim|tak|有り|نعم)$/i;
const NO_RE = /^(no|yok|hayır|hayir|nein|non|não|nao|nie|false|無し|لا)$/i;

function bandLabel(s, L) {
  return s >= 90 ? L('Excellent', 'Mükemmel', 'Exzellent')
    : s >= 75 ? L('Good', 'İyi', 'Gut')
    : s >= 55 ? L('Average', 'Orta', 'Durchschnitt')
    : L('Weak', 'Zayıf', 'Schwach');
}
const SPEC_EMOJI = { 'spec.screen': '🖥️', 'spec.ram': '🧠', 'spec.storage': '💾', 'spec.battery': '🔋', 'spec.camera': '📷', 'spec.cpu': '⚙️', 'spec.gpu': '🎮' };

// Short label for a variant chip — RAM / storage when available, otherwise the
// trailing "(1 TB)" / "(512 GB)" from the name, otherwise the full name.
function variantLabel(v) {
  const ks = (v && v.keySpecs) || {};
  const ram = ks['spec.ram'] || ks.ram || '';
  const storage = ks['spec.storage'] || ks.storage || '';
  if (ram && storage) return `${ram} / ${storage}`;
  if (storage) return storage;
  const m = String(v?.name || '').match(/\(([^)]+)\)\s*$/);
  if (m) return m[1].trim();
  return v?.name || '';
}

// Picks up to 2 spec keys that vary across the variant list — the SAME keys for
// every card so the chips line up (e.g. all cards show "Storage / RAM" even
// when one variant only differs by one of them). Priority list is the user-
// recognisable axes; we drop a key if every variant has the same value.
function pickVariantDiffKeys(variants) {
  if (!Array.isArray(variants) || variants.length < 2) return [];
  const priority = ['spec.storage', 'spec.ram', 'spec.battery', 'spec.screen', 'spec.camera', 'spec.cpu'];
  const out = [];
  for (const k of priority) {
    const vals = new Set();
    for (const v of variants) {
      const ks = (v && v.keySpecs) || {};
      const val = String(ks[k] || '').trim();
      if (val) vals.add(val);
    }
    if (vals.size >= 2) out.push(k);
    if (out.length >= 2) break;
  }
  return out;
}

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

// Shared product fingerprint used by every AI prompt below — keeps the spec
// context identical across the four AI features (deep / alternatives / advisor
// / prediction) so the model has the same grounding regardless of which card
// the user opens first.
function productFingerprint(p, lang) {
  const productName = localizedProductName(p, lang);
  const ks = p.keySpecs && typeof p.keySpecs === 'object'
    ? Object.entries(p.keySpecs).slice(0, 18).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const priceFresh = Date.parse(p.bestOfferExpiresAt || '') > Date.now();
  const price = priceFresh && Number(p.lowestPriceUSD) > 0 ? `${Number(p.lowestPriceUSD).toFixed(0)} USD` : '-';
  return { productName, ks, price };
}

function aiDeepPrompt(p, lang) {
  const { productName, ks, price } = productFingerprint(p, lang);
  return (
    'You are Qor AI, a senior tech product analyst. Produce a deep technical analysis ' +
    `of the product below. Reply ONLY in language ISO=${lang}, valid markdown, no preamble.\n\n` +
    `Name: ${productName}\nBrand: ${p.brand || '-'}\nCategory: ${p.category || '-'}\n` +
    `Qor AI Tech Score: ${p.techScore || '-'}/100\nApprox. price: ${price}\n` +
    `Key specs: ${ks || '-'}\n\n` +
    '## OUTPUT\n' +
    '**Genel Değerlendirme / Overall** — 2-3 paragraphs.\n' +
    '**Güçlü Yönler / Strengths** — 5-7 "-" bullets with real-world impact.\n' +
    '**Zayıf Yönler / Weaknesses** — 4-6 honest "-" bullets.\n' +
    '**Performans Skoru** — give a short table of 4 axes (Performance, Design, Value, Longevity) each scored 0-100.\n'
  );
}
function aiAlternativesPrompt(p, lang) {
  const { productName, ks, price } = productFingerprint(p, lang);
  return (
    'You are Qor AI. List the 3 strongest competing alternatives to the product below. ' +
    `Reply ONLY in language ISO=${lang}, markdown, no preamble.\n\n` +
    `Name: ${productName}\nBrand: ${p.brand || '-'}\nCategory: ${p.category || '-'}\n` +
    `Approx. price: ${price}\nKey specs: ${ks || '-'}\n\n` +
    '## OUTPUT\nFor EACH of the 3 alternatives, give a section:\n' +
    '### <Product name>\n' +
    '**Neden bu? / Why this?** 1-2 sentences.\n' +
    '**Avantaj / Pros:** 2-3 "-" bullets vs the target.\n' +
    '**Dezavantaj / Cons:** 2-3 "-" bullets vs the target.\n' +
    '**Kime uygun / Who it fits:** 1 sentence.\n'
  );
}
function aiAdvisorPrompt(p, lang, userProfile = {}) {
  const { productName, ks, price } = productFingerprint(p, lang);
  const profile = Object.entries(userProfile)
    .filter(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`)
    .slice(0, 14).join('\n');
  return (
    'You are Qor AI Product Advisor. Give tailored buying advice based on the user profile. ' +
    `Reply ONLY in language ISO=${lang}, markdown, no preamble.\n\n` +
    `Product: ${productName} (${p.brand || '-'} / ${p.category || '-'})\n` +
    `Approx. price: ${price}\nKey specs: ${ks || '-'}\n` +
    (profile ? `\nUser profile:\n${profile}\n` : '') +
    '\n## OUTPUT\n' +
    '**Senin için uygun mu? / Is it right for you?** 2-3 paragraphs grounded in the profile.\n' +
    '**Dikkat Etmen Gerekenler / Watch out for** — 3-5 "-" bullets.\n' +
    '**Karar / Verdict** — 1 sentence, blunt: AL / DÜŞÜN / ALMA (BUY / CONSIDER / SKIP).\n'
  );
}
function aiPredictionPrompt(p, lang) {
  const { productName, ks, price } = productFingerprint(p, lang);
  return (
    'You are Qor AI Price Forecaster. Predict near-term price trend for the product. ' +
    `Reply ONLY in language ISO=${lang}, markdown, no preamble.\n\n` +
    `Product: ${productName}\nBrand: ${p.brand || '-'}\nCategory: ${p.category || '-'}\n` +
    `Approx. current price: ${price}\nKey specs: ${ks || '-'}\n\n` +
    '## OUTPUT\n' +
    '**Fiyat Trendi / Trend** — short paragraph (Will it drop, hold, or rise in the next 3-6 months and why).\n' +
    '**En İyi Alım Zamanı / Best time to buy** — 1-2 sentences with a target month / season.\n' +
    '**Risk Faktörleri / Risks** — 3-4 "-" bullets (new model coming, supply, demand cycle, etc.).\n' +
    '**Tahmini İndirim / Expected discount** — give a rough % range expected within 6 months.\n'
  );
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
    '**Verdict** — 4-6 rich paragraphs with the product story, category context, value, durability and long-term ownership outlook.\n' +
    '**Strengths** — 5-7 detailed "-" bullets grounded in the specs above; each bullet should explain the real-world impact.\n' +
    '**Weaknesses** — 4-6 honest "-" bullets with severity and who should care.\n' +
    '**Community reception** — 3-4 paragraphs synthesising how reviewers and owners generally regard it, including praise, recurring criticisms and long-term reports.\n' +
    '**Who it is for** — 2-3 paragraphs on the ideal buyer, edge cases, and who should skip it.\n' +
    '**Final recommendation** — 2-3 paragraphs with buy/consider/skip guidance and concrete alternatives if it is not ideal.\n\n' +
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

// Per-product spec translator. The product carries a COMPLETE Turkish→target
// term map in multiLangSpecs[lang] / multiLangSections[lang] (built offline for
// exactly this product's terms), so prefer it — that guarantees no untranslated
// word leaks for de/en. Only fall back to the shared runtime dictionary (trSpec,
// which has gaps and depends on a PocketBase fetch that can fail on cold start)
// when a term is missing from the per-product map.
function buildSpecTranslator(product, lang) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const norm = (s) => String(s ?? '')
    .replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\s*:\s*$/, '');
  const lookup = new Map();
  if (code !== 'tr') {
    for (const src of [product?.multiLangSections?.[code], product?.multiLangSpecs?.[code]]) {
      if (src && typeof src === 'object' && !Array.isArray(src)) {
        for (const [k, v] of Object.entries(src)) {
          const nk = norm(k);
          if (nk && v != null && String(v).trim()) lookup.set(nk, String(v));
        }
      }
    }
  }
  return (term) => {
    const raw = String(term ?? '');
    if (code === 'tr' || !raw.trim()) return code === 'tr' ? raw : trSpec(raw, code);
    if (raw.includes('\n')) {
      return raw.split(/\r?\n/).map((line) => {
        const t = line.trim();
        if (!t) return line;
        const hit = lookup.get(norm(t));
        return hit != null ? line.replace(t, hit) : trSpec(line, code);
      }).join('\n');
    }
    const hit = lookup.get(norm(raw));
    return hit != null ? hit : trSpec(raw, code);
  };
}

function mergeSpecBricks(product, keySpecsTitle, allSpecsTitle, lang) {
  const tr = buildSpecTranslator(product, lang);
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
        addRows(tr(section), sectionIcon(section), Object.entries(specs));
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
    if (missing.length) addRows(allSpecsTitle, '📋', missing);
  }
  return bricks;
}


function dateOnly(value) {
  const n = Date.parse(value || '');
  if (!Number.isFinite(n)) return '';
  return new Date(n).toISOString().slice(0, 10);
}

function seoImageUrls(product) {
  const urls = productImageList(product, 'full')
    .filter((src) => /^https?:\/\//i.test(src))
    .slice(0, 6);
  return urls.length ? urls : [DEFAULT_OG_IMAGE];
}

function productPropertyValues(product, lang) {
  const out = [];
  const seen = new Set();
  const add = (name, value) => {
    const n = String(name || '').replace(/\s+/g, ' ').trim();
    const v = String(value || '').replace(/\s+/g, ' ').trim();
    if (!n || !v || seen.has(n.toLowerCase())) return;
    seen.add(n.toLowerCase());
    out.push({ '@type': 'PropertyValue', name: n, value: v });
  };

  const score = Number(product?.techScore) || 0;
  if (score > 0) add('Qor AI Tech Score', `${Math.round(score)}/100`);

  seoSpecEntries(product).slice(0, 8).forEach(([name, value]) => {
    add(localizedSpecLabel(name, lang), localizedSpecValue(String(value || ''), lang));
  });

  return out.slice(0, 10);
}

function seoSpecEntries(product) {
  const entries = product?.keySpecs && typeof product.keySpecs === 'object'
    ? Object.entries(product.keySpecs)
    : [];
  return entries.filter(([name, value]) => {
    const label = String(name || '').toLowerCase();
    const val = String(value || '').toLowerCase();
    if (!label || !val || val.length > 50) return false;
    if (/qor|score|puan|rank|tier|internal|anchor|engine/.test(label)) return false;
    if (/(battery|batarya|pil|akku)/.test(label) && /\b(gb|tb|usb|hdmi|displayport)\b/.test(val)) return false;
    if (/(storage|depolama|speicher)/.test(label) && /\bmah\b/.test(val)) return false;
    if (/(screen|display|ekran|bildschirm)/.test(label) && /\b(gb|tb|mah|usb)\b/.test(val)) return false;
    return true;
  });
}

function productOffer(product, url) {
  const validUntil = dateOnly(product?.bestOfferExpiresAt);
  const fresh = validUntil && Date.parse(`${validUntil}T23:59:59.999Z`) > Date.now();
  if (!fresh) return null;

  const localPrice = Number(product?.lowestPrice) || 0;
  const localCurrency = String(product?.lowestPriceCurrency || '').toUpperCase();
  const usdPrice = Number(product?.lowestPriceUSD) || 0;
  const price = localPrice > 0 && /^[A-Z]{3}$/.test(localCurrency) ? localPrice : usdPrice;
  const currency = localPrice > 0 && /^[A-Z]{3}$/.test(localCurrency) ? localCurrency : 'USD';
  if (!(price > 0)) return null;

  return {
    '@type': 'Offer',
    url,
    price: Number(price.toFixed(2)),
    priceCurrency: currency,
    priceValidUntil: validUntil,
    availability: 'https://schema.org/InStock',
    itemCondition: 'https://schema.org/NewCondition',
  };
}

function productIdentifiers(product) {
  const ids = { sku: product?.id };
  const gtin = String(product?.gtin || '').replace(/\s+/g, '').trim();
  const mpn = String(product?.mpn || '').trim();
  if (gtin) ids.gtin = gtin;
  if (mpn) ids.mpn = mpn;
  return ids;
}

function buildLoadingProductSeo(id, path) {
  return {
    title: 'Ürün yükleniyor — Qor AI',
    description: 'Qor AI ürün detay sayfası hazırlanıyor.',
    path: path || productPath(id),
    noindex: !id,
  };
}

// Builds title / description / Open Graph + Product & Breadcrumb JSON-LD.
function buildProductSeo(p, t, lang) {
  if (!p) {
    return { title: `${t('pd.notFound')} — Qor AI`, description: t('pd.notFoundDesc'), noindex: true };
  }
  const meta = catMeta(p.category);
  const name = localizedProductName(p, lang);
  const category = categoryLabel(p.category, lang);
  const keySpecs = seoSpecEntries(p).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const score = Number(p.techScore) || 0;
  const title = truncate(`${name} özellikleri ve karşılaştırma — Qor AI`, 68);
  const description = truncate(
    p.description
    || `${name}: ${p.brand ? `${p.brand}, ` : ''}${category}. `
       + `${score > 0 ? `Qor AI teknik skoru ${score}/100. ` : ''}`
       + `${keySpecs ? `${keySpecs}. ` : ''}`
       + 'Özellikleri incele, karşılaştır ve karar ver.',
  );
  const images = seoImageUrls(p);
  const image = images[0] || DEFAULT_OG_IMAGE;
  const path = productPath(p);
  const url = `${SITE_URL}${path}`;
  const categoryUrl = p.category
    ? `${SITE_URL}/category?cat=${encodeURIComponent(String(p.category).toLowerCase())}`
    : `${SITE_URL}/category`;
  const offer = productOffer(p, url);
  const properties = productPropertyValues(p, lang);

  const product = {
    '@type': 'Product',
    '@id': `${url}#product`,
    ...productIdentifiers(p),
    name,
    image: images,
    description,
    url,
    mainEntityOfPage: { '@id': `${url}#webpage` },
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.category ? { category } : {}),
    ...(properties.length ? { additionalProperty: properties } : {}),
    ...(offer ? { offers: offer } : {}),
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: category || meta.label, item: categoryUrl },
      { '@type': 'ListItem', position: 3, name, item: url },
    ],
  };
  const webPage = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: lang || 'tr',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    primaryImageOfPage: { '@type': 'ImageObject', url: image },
    breadcrumb: { '@id': `${url}#breadcrumb` },
    mainEntity: { '@id': `${url}#product` },
  };
  return {
    title, description, image, imageAlt: name, path, type: 'product',
    jsonLd: { '@context': 'https://schema.org', '@graph': [webPage, product, breadcrumb] },
  };
}

export default function ProductDetail() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const loc = useLocation();
  const id = extractProductId(params.id || searchParams.get('id') || '');
  const { t, lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const { ids, has, add, remove } = useCompare();
  const { has: isFavorite, toggle: toggleFavorite } = useFavorites();
  const geoCountry = useGeoCountry();
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
  const [compareBase, setCompareBase] = useState(null);
  const [compareMsg, setCompareMsg] = useState('');
  // Ship-to country for the price list. Defaults to the IP-detected country but
  // the visitor can override it (e.g. someone in TR comparing the DE price, or
  // when the cached geo lags behind a VPN). '' until the user picks / geo loads.
  const [priceCountry, setPriceCountry] = useState('');
  const priceCountryTouched = useRef(false);

  // Four separate AI cards (deep, alternatives, advisor, prediction) — each
  // tracks its own busy / notice / text / expanded flag so the user can open
  // one without it kicking off all four (Qor coin costs add up otherwise).
  const [aiCards, setAiCards] = useState({
    deep: { text: '', busy: false, notice: '', expanded: false },
    alts: { text: '', busy: false, notice: '', expanded: false },
    advisor: { text: '', busy: false, notice: '', expanded: false },
    pred: { text: '', busy: false, notice: '', expanded: false },
    forum: { text: '', busy: false, notice: '', expanded: false },
  });
  const aiUserKeyRef = useRef('');

  // Seed the ship-to country from the detected geo once it resolves, unless the
  // visitor has already picked one manually.
  useEffect(() => {
    if (priceCountryTouched.current) return;
    const cc = String(geoCountry || '').toUpperCase();
    if (cc) setPriceCountry(cc);
  }, [geoCountry]);

  const [similar, setSimilar] = useState([]);
  const [variants, setVariants] = useState([]);

  useEffect(() => {
    const key = `${user?.id || ''}|${user?.quizCompleted === true ? '1' : '0'}`;
    if (aiUserKeyRef.current && aiUserKeyRef.current !== key) {
      setAiCards({
        deep: { text: '', busy: false, notice: '', expanded: false },
        alts: { text: '', busy: false, notice: '', expanded: false },
        advisor: { text: '', busy: false, notice: '', expanded: false },
        pred: { text: '', busy: false, notice: '', expanded: false },
        forum: { text: '', busy: false, notice: '', expanded: false },
      });
    }
    aiUserKeyRef.current = key;
  }, [user?.id, user?.quizCompleted]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setAiCards({
      deep: { text: '', busy: false, notice: '', expanded: false },
      alts: { text: '', busy: false, notice: '', expanded: false },
      advisor: { text: '', busy: false, notice: '', expanded: false },
      pred: { text: '', busy: false, notice: '', expanded: false },
      forum: { text: '', busy: false, notice: '', expanded: false },
    });
    setSimilar([]); setVariants([]);
    getProduct(id)
      .then((prod) => {
        if (!live) return;
        setP(prod); setOffers([]); setActiveImg(0); setLightbox(false); setTab('specs');
        if (prod) {
          pushRecent(prod);
          getSimilar(prod.category, prod.techScore, prod.id).then((s) => live && setSimilar(s)).catch(() => {});
          getVariants(prod.variantGroup, prod.id).then((v) => live && setVariants(v)).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  useEffect(() => {
    if (!p?.id) return;
    const canonicalPath = productPath(p);
    const currentPath = `${loc.pathname}${loc.search}`;
    if (canonicalPath !== currentPath && loc.pathname.startsWith('/product')) {
      window.history.replaceState(window.history.state, '', canonicalPath);
    }
  }, [loc.pathname, loc.search, p]);

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

  // Click handler shared by the four AI cards in the AI tab. Each card is
  // independent: the user pays a detail_ai cost only for the card they open,
  // and re-opening a card that already has content just toggles the expand
  // state (no second charge).
  const runAiCard = useCallback(async (key, promptBuilder) => {
    if (!p) return;
    setAiCards((prev) => {
      const cur = prev[key] || { text: '', busy: false, notice: '', expanded: false };
      if (cur.text) {
        return { ...prev, [key]: { ...cur, expanded: !cur.expanded } };
      }
      return prev;
    });
    const cur = aiCards[key];
    if (cur && (cur.text || cur.busy)) return;
    setAiCards((prev) => ({ ...prev, [key]: { ...prev[key], busy: true, notice: '', expanded: true } }));
    const access = await requireAiAccess('detail_ai', {
      onMessage: (message) => setAiCards((prev) => ({ ...prev, [key]: { ...prev[key], notice: message } })),
    });
    if (!access.ok) {
      setAiCards((prev) => ({ ...prev, [key]: { ...prev[key], busy: false } }));
      return;
    }
    try {
      const prompt = promptBuilder(p, lang, aiUserProfile(user));
      const txt = await askQorAi([{ role: 'user', text: prompt }]);
      setAiCards((prev) => ({ ...prev, [key]: { ...prev[key], busy: false, text: txt, expanded: true } }));
      if (key === 'deep') saveProductAnalysisHistory({ product: p, analysis: txt });
    } catch {
      setAiCards((prev) => ({ ...prev, [key]: { ...prev[key], busy: false, notice: t('pd.aiError') } }));
    }
  }, [p, lang, requireAiAccess, t, user, aiCards]);

  useEffect(() => {
    let live = true;
    setCompareMsg('');
    const baseId = ids.find((x) => x !== p?.id) || ids[0] || '';
    if (!baseId) {
      setCompareBase(null);
      return () => { live = false; };
    }
    getProduct(baseId)
      .then((prod) => { if (live) setCompareBase(prod || null); })
      .catch(() => { if (live) setCompareBase(null); });
    return () => { live = false; };
  }, [ids.join(','), p?.id]);

  useSeo(loading
    ? buildLoadingProductSeo(id, `${loc.pathname}${loc.search}`)
    : buildProductSeo(p, t, lang));

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
  const specTr = buildSpecTranslator(p, lang);
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
    chips.forEach((c) => push({
      key: c.labelKey,
      icon: SPEC_EMOJI[c.labelKey] || '•',
      value: localizedSpecValue(c.value, lang),
      label: localizedSpecLabel(t(c.labelKey), lang),
    }));
    bricks.flatMap((br) => br.rows || []).forEach(([k, v]) => {
      const value = localizedSpecValue(specTr(String(v).split(/\r?\n/)[0].trim()), lang);
      const label = localizedSpecLabel(specTr(k), lang).replace(/\s*:\s*$/, '');
      if (/\d/.test(value) && value.length <= 24 && !/sponsor|reklam|advert/i.test(`${label} ${value}`)) {
        push({ key: k, icon: sectionIcon(k), value, label });
      }
    });
    return out.slice(0, 10);
  })();

  const tech = Number(p.techScore) || 0;
  const showMatchScore = hasProfileMatch(user);
  const match = showMatchScore ? calculateProfileMatchScore(user, p) : 0;
  const offer = bestOfferForLang(offers, p, lang);
  const hasExactPrice = Boolean(offer?.hasExactPrice);
  const price = hasExactPrice ? Number(offer?.price) || 0 : 0;
  const displayPrice = hasExactPrice ? formatOfferPrice(offer, lang) : '';
  const offerUrl = offerClickPath(offer);
  const inCompare = has(p.id);
  const compareCount = ids.length;
  const compareCategory = compareBase?.category || (inCompare ? p.category : '');
  const canOpenCompare = compareCount >= 2;
  function toggleComparePool() {
    setCompareMsg('');
    if (inCompare) {
      remove(p.id);
      return;
    }
    if (compareCategory && String(compareCategory) !== String(p.category || '')) {
      setCompareMsg(t('cmp.sameCategoryOnly', { cat: categoryLabel(compareCategory, lang) }));
      return;
    }
    if (!add(p.id)) alert(t('pd.maxAlert', { max: COMPARE_MAX }));
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1240 }}>
        {/* breadcrumb + favorite / compare actions (aligned to the title row) */}
        <nav className="pd-crumbs">
          <div className="pd-crumbs-path">
            <button className="pd-crumb-back" aria-label="back"
              onClick={() => (window.history.length > 1 ? window.history.back() : null)}>‹</button>
            <Link to="/">{L('Home', 'Ana Sayfa', 'Start')}</Link>
            <span aria-hidden="true">›</span>
            <Link to={`/category?cat=${encodeURIComponent(p.category || '')}`}>{categoryLabel(p.category, lang)}</Link>
            <span aria-hidden="true">›</span>
            <b title={displayName}>{displayName}</b>
          </div>
          <div className="pd-crumbs-actions">
            <a
              className="pd-act-btn pd-act-yt"
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${displayName} ${lang === 'tr' ? 'inceleme' : lang === 'de' ? 'test' : 'review'}`)}`}
              target="_blank" rel="noopener"
              title={L('Watch video reviews', 'Video incelemeleri izle', 'Video-Reviews ansehen')}
              aria-label="YouTube">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.1 5 12 5 12 5s-6.1 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.9 19 12 19 12 19s6.1 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3Z" />
              </svg>
            </a>
            <button type="button"
              className={'pd-act-btn pd-act-fav' + (isFavorite(p.id) ? ' on' : '')}
              onClick={() => toggleFavorite(p.id)}
              title={isFavorite(p.id) ? L('In favorites', 'Favorilerde', 'In Favoriten') : L('Add to favorites', 'Favorilere ekle', 'Zu Favoriten hinzufügen')}
              aria-label={L('Favorite', 'Favori', 'Favorit')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite(p.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
            </button>
            <button type="button"
              className={'pd-cmp-btn' + (inCompare ? ' on' : '')}
              onClick={toggleComparePool}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>{inCompare ? L('In compare', 'Karşılaştırmada', 'Im Vergleich') : L('Compare', 'Karşılaştır', 'Vergleichen')}</span>
            </button>
          </div>
        </nav>

        <div className="prod-grid pd-product-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(360px,0.86fr) minmax(0,1.14fr)', gap: 32, alignItems: 'stretch' }}>
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
              {showMatchScore && match > 0 && (
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

            {compareMsg && <small className="pd-compare-msg">{compareMsg}</small>}

          </div>
        </div>

        {/* Detail flow: prices → variants → specs/AI tabs → reviews */}
        <div className="pd-detail-flow">
          {(() => {
            // Countries that actually have a retailer offer for this product
            // (Amazon excluded — it has its own geo link), plus the visitor's
            // detected geo, so the ship-to selector always lists somewhere useful.
            const offerCountries = [...new Set(
              offers
                .filter((o) => o.url && String(o.network || '').toLowerCase() !== 'amazon' && !/(^|\.)amazon\./i.test(o.url))
                .map((o) => String(o.country || '').toUpperCase())
                .filter(Boolean),
            )];
            const sel = String(priceCountry || geoCountry || 'US').toUpperCase();
            // Always offer a stable base list (so TR never disappears after the
            // user switches to DE), plus the detected geo and any country that
            // actually has an offer for this product.
            const FLAG = { TR: '🇹🇷', DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', NL: '🇳🇱', AT: '🇦🇹', CH: '🇨🇭', BE: '🇧🇪', CA: '🇨🇦' };
            const countryOptions = [...new Set([
              String(geoCountry || '').toUpperCase(),
              'TR', 'DE', 'GB', 'US',
              ...offerCountries,
              sel,
            ].filter(Boolean))];

            const amazonUrl = amazonUrlForProduct(p, sel || 'US');
            // Retailer offers shippable to the SELECTED country. Amazon is shown
            // once as its own geo link, so its stored offers are dropped here.
            const priced = offers.filter((o) => {
              if (!o.url) return false;
              const isAmazon = String(o.network || '').toLowerCase() === 'amazon' || /(^|\.)amazon\./i.test(o.url);
              if (isAmazon) return false;
              const oc = String(o.country || '').toUpperCase();
              if (oc && sel && oc !== sel) return false;
              return true;
            });
            if (!amazonUrl && priced.length === 0 && countryOptions.length <= 1) return null;
            return (
              <section className="pd-block">
                {/* Title + ship-to selector on one aligned row (selector right,
                    not floating alone in the centre). */}
                <div className="pd-prices-head">
                  <h2 className="pd-block-title pd-block-title-inline">{L('Prices', 'Fiyatlar', 'Preise')}</h2>
                  {countryOptions.length > 0 && (
                    <label className="pd-ship-to">
                      <span className="pd-ship-to-lbl">📍 {L('Ship to', 'Teslimat', 'Lieferland')}</span>
                      <select
                        className="pd-ship-to-sel"
                        value={sel}
                        onChange={(e) => { priceCountryTouched.current = true; setPriceCountry(e.target.value); }}
                      >
                        {countryOptions.map((c) => (
                          <option key={c} value={c}>{`${FLAG[c] || '🌍'} ${c}`}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="pd-prices-list">
                  {amazonUrl && (
                    <a className="pd-price-row" href={amazonUrl} target="_blank" rel="sponsored noopener">
                      <span className="pd-price-store"><AmazonLogo height={26} /></span>
                      <span className="pd-price-amt pd-price-amt-link">{L('See price', 'Fiyata bak', 'Preis ansehen')}</span>
                    </a>
                  )}
                  {priced.map((o) => (
                    <a key={o.id || o.url} className="pd-price-row" href={offerClickPath(o)} target="_blank" rel="sponsored noopener">
                      <span className="pd-price-store">{o.store || L('Store', 'Mağaza', 'Shop')}</span>
                      {o.hasExactPrice
                        ? <span className="pd-price-amt">{formatOfferPrice(o, lang)}</span>
                        : <span className="pd-price-amt pd-price-amt-link">{L('See price', 'Fiyata bak', 'Preis ansehen')}</span>}
                    </a>
                  ))}
                </div>
              </section>
            );
          })()}

          {variants.length > 0 && (() => {
            const diffKeys = pickVariantDiffKeys(variants);
            return (
              <section className="pd-block">
                <h2 className="pd-block-title">{L('Variants', 'Varyantlar', 'Varianten')}</h2>
                <div className="pd-variants-list">
                  {variants.map((v) => {
                    const vks = (v && v.keySpecs) || {};
                    return (
                      <Link key={v.id} to={productPath(v)}
                        className={'pd-variant-card' + (v.id === p.id ? ' on' : '')}>
                        <div className="pd-variant-media">
                          <div className="pd-variant-img">
                            <ProductImg src={v.imageUrl || (v.images && v.images[0])} alt={v.name} size="card" />
                          </div>
                        </div>
                        <div className="pd-variant-body">
                          {v.brand && <span className="pd-variant-brand">{v.brand}</span>}
                          <span className="pd-variant-name">{variantLabel(v)}</span>
                          {diffKeys.length > 0 && (
                            <div className="pd-variant-specs">
                              {diffKeys.map((k) => {
                                const raw = String(vks[k] || '').trim();
                                return (
                                  <span className="pd-variant-spec" key={k}>
                                    <b>{raw ? localizedSpecValue(raw, lang) : '—'}</b>
                                    <small>{localizedSpecLabel(specTr(k), lang)}</small>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          <section className="pd-block">
            <div className="pd-tabs2">
              <button className={tab === 'specs' ? 'on' : ''} onClick={() => setTab('specs')}>{t('pd.tabSpecs')}</button>
              <button className={tab === 'premium' ? 'on' : ''} onClick={() => setTab('premium')}>{t('pd.tabAi')}</button>
            </div>
            <div className="pd-tab-body">
              {tab === 'specs' && (
                <div className="fade-up">
                  {p.description && <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6, marginBottom: 16 }}>{p.description}</p>}
                  {bricks.length > 0 ? (
                    <div className="pd-bricks">
                      {bricks.map((b, i) => <SpecBrick key={i} brick={b} lang={lang} tr={specTr} dictReady={dictReady} />)}
                    </div>
                  ) : (
                    !p.description && <div className="card pad muted">{t('pd.noSpecs')}</div>
                  )}
                </div>
              )}
              {tab === 'premium' && (
                <div className="fade-up pd-ai-grid">
                  <AiAnalysisCard
                    icon="🧠"
                    kind="deep"
                    lang={lang}
                    gradient="grad-violet"
                    title={L('AI Deep Analysis', 'AI Derin Analiz', 'KI-Tiefenanalyse')}
                    subtitle={L('Comprehensive AI product evaluation', 'Kapsamlı AI ürün değerlendirmesi', 'Umfassende KI-Produktbewertung')}
                    state={aiCards.deep}
                    onOpen={() => runAiCard('deep', buildDeepPrompt)}
                    loadingLabel={t('pd.aiLoading')}
                  />
                  <AiAnalysisCard
                    icon="🔁"
                    gradient="grad-orange"
                    title={L('Smart Alternatives', 'Akıllı Alternatifler', 'Intelligente Alternativen')}
                    subtitle={L('AI-curated similar products', 'AI tarafından seçilmiş benzer ürünler', 'KI-kuratierte ähnliche Produkte')}
                    state={aiCards.alts}
                    kind="alts"
                    lang={lang}
                    onOpen={() => runAiCard('alts', buildAltPrompt)}
                    loadingLabel={t('pd.aiLoading')}
                  />
                  <AiAnalysisCard
                    icon="🎯"
                    gradient="grad-cyan"
                    title={L('AI Product Advisor', 'AI Ürün Danışmanı', 'KI-Produktberater')}
                    subtitle={L('Buying advice tailored to your profile', 'Profiline göre satın alma tavsiyeleri', 'Maßgeschneiderte Kaufberatung')}
                    state={aiCards.advisor}
                    kind="advisor"
                    lang={lang}
                    onOpen={() => runAiCard('advisor', buildAdvisorPrompt)}
                    loadingLabel={t('pd.aiLoading')}
                  />
                  <AiAnalysisCard
                    icon="📉"
                    gradient="grad-green"
                    title={L('Price Prediction', 'Fiyat Tahmini', 'Preisvorhersage')}
                    subtitle={L('AI price trend & best time to buy', 'AI fiyat trendi ve en iyi alım zamanı', 'KI-Preistrend & beste Kaufzeit')}
                    state={aiCards.pred}
                    kind="pred"
                    lang={lang}
                    onOpen={() => runAiCard('pred', buildPredictionPrompt)}
                    loadingLabel={t('pd.aiLoading')}
                  />
                  <AiAnalysisCard
                    icon="👥"
                    kind="forum"
                    lang={lang}
                    gradient="grad-pink"
                    title={L('Forum Satisfaction', 'Forum Memnuniyeti', 'Forum-Zufriedenheit')}
                    subtitle={L('What communities (Reddit, forums…) really think', 'Toplulukların (Reddit, forumlar…) gerçek görüşü', 'Was Communities (Reddit, Foren…) wirklich denken')}
                    state={aiCards.forum}
                    onOpen={() => runAiCard('forum', buildForumPrompt)}
                    loadingLabel={t('pd.aiLoading')}
                  />
                  {(pros.length > 0 || cons.length > 0) && (
                    <div className="pd-ai-procon">
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
                </div>
              )}
            </div>
          </section>

          <section className="pd-block">
            <h2 className="pd-block-title">💬 {L('Reviews', 'Yorumlar', 'Bewertungen')}</h2>
            <Reviews productId={p.id} productName={displayName} lang={lang} />
          </section>
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

// Collapsible AI analysis card used in the AI tab. Mirrors the mobile app's
// SharedPremiumFeaturesSection style: gradient header with icon + title +
// chevron, body either shows a spinner, a notice (auth / insufficient coins)
// or a fully rendered markdown analysis.
function AiAnalysisCard({ icon, gradient, title, subtitle, state, onOpen, loadingLabel, kind, lang }) {
  const { text, busy, notice, expanded } = state || {};
  const open = !!expanded;
  // Prefer the app-style structured visual; if the model returned non-JSON,
  // fall back to plain markdown so the user still sees something useful.
  const structured = !busy && text && kind ? <AiAnalysisView kind={kind} raw={text} lang={lang} /> : null;
  const showText = !busy && text && (!kind || !parseAiJson(text));
  return (
    <div className={'pd-ai-card' + (open ? ' on' : '')}>
      <button type="button" className={'pd-ai-card-head ' + gradient} onClick={onOpen} disabled={busy}>
        <span className="pd-ai-card-ic">{icon}</span>
        <span className="pd-ai-card-h">
          <b>{title}</b>
          <small>{subtitle}</small>
        </span>
        <span className="pd-ai-card-arr" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="pd-ai-card-body fade-up">
          {busy && (
            <div className="pd-ai-loading"><div className="spinner" /><span>{loadingLabel}</span></div>
          )}
          {!busy && notice && (
            <div className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>{notice}</div>
          )}
          {structured}
          {showText && (
            <div style={{ fontSize: 14.5, lineHeight: 1.65 }}><AiText text={text} /></div>
          )}
        </div>
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

function SpecBrick({ brick, lang, tr }) {
  const rows = brick.rows.filter(([, v]) => v != null && String(v).trim() !== '');
  if (!rows.length) return null;
  return (
    <div className="pd-brick">
      <div className="pd-brick-head"><span>{brick.icon}</span> {localizedSpecLabel(brick.title, lang)}</div>
      <div className="pd-brick-body">
        {rows.map(([k, v]) => {
          const s = localizedSpecValue(tr(String(v).trim()), lang);
          const label = localizedSpecLabel(tr(k), lang);
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
