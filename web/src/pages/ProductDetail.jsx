import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useParams, useSearchParams, Link } from 'react-router-dom';
import { getProduct, getSimilar, getVariants } from '../lib/typesense';
import { askQorAiGrounded, askQorAiRaw } from '../lib/ai';
import { generateQuiz } from '../lib/linkAnalysis';
import { useCompare, COMPARE_MAX } from '../lib/compare';
import { useFavorites } from '../lib/favorites';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import { saveProductAnalysisHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { AMAZON_ONELINK_COUNTRIES, amazonUrlForProduct, catMeta, categoryLabel, countryDisplayName, keySpecChips } from '../lib/format';
import { useGeoCountry } from '../lib/geo';
import { bestOfferForLang, fetchProductOffers, formatOfferPrice, offerClickPath } from '../lib/offers';
import ProductCard from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import AmazonLogo from '../components/AmazonLogo.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import AiAnalysisView, {
  buildFullPrompt,
  buildProductResearchPrompt,
  hasStaleAvailabilityClaims,
  parseAiJson,
  withFreshnessRetryInstruction,
} from '../components/AiAnalysis.jsx';
import AiLoadingSteps from '../components/AiLoadingSteps.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import { ensureSpecDictionary, trSpec } from '../lib/specDictionary';
import { localizedSpecLabel, localizedSpecValue } from '../lib/specDisplay';
import { useSeo, truncate, SITE_URL, DEFAULT_OG_IMAGE } from '../lib/seo';
import { pushRecent } from '../lib/recentViewed';
import { productImageList } from '../lib/imageUrl';
import { extractProductId, productPath } from '../lib/routes';
import { calculateProfileMatchScore, hasProfileMatch } from '../lib/profileMatch';
import { cleanProductName, displayProductName } from '../lib/productNames';
import Reviews from '../components/Reviews.jsx';
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
const HERO_SPEC_PRIORITY = [
  { re: /(capacity|kapasite|\b\d+\s*(gb|tb)\b)/i, icon: '💾', rank: 10 },
  { re: /(speed|hız|hizi|mhz|mt\/s|ghz|clock|frekans)/i, icon: '⚡', rank: 20 },
  { re: /(type|tip|ddr|lpddr|gddr|standard|teknoloji|technology)/i, icon: '🧬', rank: 30 },
  { re: /(kit|kiti|count|sayı|sayısı|1x|2x|4x|8x)/i, icon: '🧩', rank: 40 },
  { re: /(form|modül|modul|module|dimm|sodimm|so-dimm|udimm|rdimm|layout)/i, icon: '📐', rank: 50 },
  { re: /(pin|pins|yuva|slot|socket|interface|arayüz|arabirim|pcie|sata|m\.2)/i, icon: '🔌', rank: 60 },
  { re: /(platform|dizüstü|dizustu|laptop|notebook|masaüstü|masaustu|desktop)/i, icon: '💻', rank: 70 },
  { re: /(ecc|registered|buffered|hata düzeltme|hata duzeltme|correction)/i, icon: '🛡️', rank: 80 },
  { re: /(latency|gecikme|cl\b|cas|timing|tepki|response)/i, icon: '⏱️', rank: 90 },
  { re: /(voltage|voltaj|gerilim|power|güç|tdp|watt|mah|wh)/i, icon: '🔋', rank: 100 },
  { re: /(xmp|expo|rgb|ışıklandırma|isiklandirma|lighting|heatsink|soğut|sogut|cool)/i, icon: '🧊', rank: 110 },
  { re: /(processor|işlemci|islemci|cpu|gpu|chipset|core|çekirdek|cekirdek)/i, icon: '🧠', rank: 120 },
  { re: /(screen|display|ekran|resolution|çözünürlük|cozunurluk|refresh|hz|inch|inç)/i, icon: '🖥️', rank: 130 },
  { re: /(storage|depolama|ssd|hdd|disk)/i, icon: '💽', rank: 140 },
  { re: /(camera|kamera|mp|lens|video)/i, icon: '📷', rank: 150 },
  { re: /(weight|ağırlık|agirlik|dimension|boyut|ölçü|olcu|height|width|depth)/i, icon: '📏', rank: 160 },
  { re: /(wireless|wi-?fi|bluetooth|nfc|ethernet|network|bağlantı|baglanti)/i, icon: '📡', rank: 170 },
];

// Short label for a variant chip — RAM / storage when available, otherwise the
// trailing "(1 TB)" / "(512 GB)" from the name, otherwise the full name.
function variantSpecKind(label, value = '') {
  const text = `${label || ''} ${value || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\bram\b|bellek|memory|arbeitsspeicher/.test(text)) return 'ram';
  if (/storage|depolama|ssd|hdd|speicher|kapasite/.test(text) && !/battery|batarya|pil|akku/.test(text)) return 'storage';
  if (/processor|islemci|işlemci|cpu|gpu|graphics|grafik|chip/.test(text)) return 'processor';
  if (/screen|display|ekran|bildschirm|inch|inç|zoll/.test(text)) return 'screen';
  if (/battery|batarya|pil|akku|wh|mah/.test(text)) return 'battery';
  if (/color|renk|farbe/.test(text)) return 'color';
  return '';
}

function variantSpecValue(v, kind) {
  const ks = (v && v.keySpecs) || {};
  for (const [key, value] of Object.entries(ks)) {
    if (variantSpecKind(key, value) === kind) return String(value || '').trim();
  }
  return '';
}

function variantModelLabel(v, lang) {
  const processor = variantSpecValue(v, 'processor');
  if (processor) return localizedSpecValue(processor, lang);
  return displayProductName(v, lang) || cleanProductName(v?.name || '');
}

function pickVariantDiffKinds(products) {
  const priority = ['ram', 'storage', 'processor', 'screen', 'battery', 'color'];
  const out = [];
  for (const kind of priority) {
    const vals = new Set();
    for (const v of products || []) {
      const val = variantSpecValue(v, kind);
      if (val) vals.add(val.toLowerCase());
    }
    if (vals.size >= 2) out.push(kind);
    if (out.length >= 3) break;
  }
  return out;
}

function variantKindLabel(kind, lang) {
  const labels = {
    ram: 'RAM',
    storage: 'Storage',
    processor: 'Processor/GPU',
    screen: 'Screen',
    battery: 'Battery',
    color: 'Color',
  };
  return localizedSpecLabel(labels[kind] || kind, lang);
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

function fallbackProductQuiz(lang, productName) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const copy = code === 'tr'
    ? [
        ['Bu ürünü en çok hangi senaryoda kullanacaksın?', ['Günlük kullanım ve uzun ömür', 'Yoğun iş/üretkenlik', 'Oyun veya yüksek performans', 'Yedek parça/yükseltme odaklı']],
        ['Performans tarafında senin için en kritik nokta hangisi?', ['Anlık hız ve tepki', 'Ağır yükte stabilite', 'Sessiz/serin çalışma', 'Benim kullanımım hafif kalır']],
        ['Uyumluluk konusunda ne kadar risk almak istersin?', ['Sadece kesin uyumlu ürün isterim', 'Küçük araştırma yapabilirim', 'Gerekirse ayar/BIOS güncellerim', 'Uyumluluk benim için kritik değil']],
        ['Uzun vadede seni en çok ne rahatsız eder?', ['Performansın erken eskimesi', 'Garanti/servis belirsizliği', 'Fiyatın kısa sürede düşmesi', 'Toplulukta sorun raporları']],
        ['Ürün seçiminde kullanıcı yorumlarının ağırlığı ne olsun?', ['Çok yüksek, sorun yaşayanları önemserim', 'Dengeli bakarım', 'Teknik veriler daha önemli', 'Yorumlara az bakarım']],
        ['Alternatiflere bakarken hangi fark seni ikna eder?', ['Daha iyi performans', 'Daha güvenilir marka/servis', 'Daha iyi fiyat/performans', 'Daha yeni teknoloji']],
        ['Satın alma zamanlamanda ne kadar esneksin?', ['Hemen almam gerekiyor', 'İndirim bekleyebilirim', 'Yeni model bekleyebilirim', 'Fiyat sabitse alırım']],
        ['Bu ürün beklentini karşılamazsa en büyük problem ne olur?', ['Para boşa gitmiş gibi hissetmek', 'Sisteme/cihaza uymaması', 'Performansın düşük kalması', 'İade/değişimle uğraşmak']],
      ]
    : code === 'de'
      ? [
          ['What will you mainly use this product for?', ['Everyday use and longevity', 'Heavy work/productivity', 'Gaming or high performance', 'Upgrade or spare-part focused']],
          ['Which performance aspect matters most?', ['Snappy response', 'Stability under load', 'Quiet/cool operation', 'My usage is light']],
          ['How much compatibility risk is acceptable?', ['Only proven compatibility', 'I can do some research', 'I can update settings/BIOS', 'Compatibility is not critical']],
          ['What would bother you most long term?', ['Performance aging quickly', 'Warranty/service uncertainty', 'Price dropping soon', 'Community issue reports']],
          ['How much should user reviews affect the decision?', ['Very much', 'Balanced', 'Specs matter more', 'Only a little']],
          ['What alternative would convince you?', ['Better performance', 'Better reliability/service', 'Better value', 'Newer technology']],
          ['How flexible is your timing?', ['I need it now', 'I can wait for discounts', 'I can wait for a successor', 'I buy if price is stable']],
          ['If it disappoints, what is the biggest problem?', ['Feeling money was wasted', 'Not fitting my system/device', 'Underwhelming performance', 'Return hassle']],
        ]
      : [
          ['What will you mainly use this product for?', ['Everyday use and longevity', 'Heavy work/productivity', 'Gaming or high performance', 'Upgrade or spare-part focused']],
          ['Which performance aspect matters most?', ['Snappy response', 'Stability under load', 'Quiet/cool operation', 'My usage is light']],
          ['How much compatibility risk is acceptable?', ['Only proven compatibility', 'I can do some research', 'I can update settings/BIOS', 'Compatibility is not critical']],
          ['What would bother you most long term?', ['Performance aging quickly', 'Warranty/service uncertainty', 'Price dropping soon', 'Community issue reports']],
          ['How much should user reviews affect the decision?', ['Very much', 'Balanced', 'Specs matter more', 'Only a little']],
          ['What alternative would convince you?', ['Better performance', 'Better reliability/service', 'Better value', 'Newer technology']],
          ['How flexible is your timing?', ['I need it now', 'I can wait for discounts', 'I can wait for a successor', 'I buy if price is stable']],
          ['If it disappoints, what is the biggest problem?', ['Feeling money was wasted', 'Not fitting my system/device', 'Underwhelming performance', 'Return hassle']],
        ];
  return copy.map(([text, options], i) => ({
    id: `fallback-${i}`,
    text: i === 0 && productName ? text.replace('this product', productName) : text,
    options,
  }));
}

function localizedProductName(product, lang) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const named = displayProductName(product, code);
  return code === 'tr' ? named : cleanProductName(trSpec(named, code));
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
  // The product's SOURCE-language entry in multiLangSpecs is the FULL spec
  // object ({label: value}) — Epey stores .tr that way, Geizhals .de — and
  // multiLangSections.<source> is NESTED. Neither is an atom map: feeding
  // them into the lookup makes a label resolve to its own VALUE ("Pil
  // kapasitesi" → "3988 mAh", so the row shows "3988 mAh | 3988 mAh") and
  // section titles render "[object Object]". A same-language view needs no
  // per-product lookup at all — the content already is that language.
  const srcLang = String(product?.sourceLang || '').toLowerCase()
    || (/epey/i.test(String(product?.source || '')) ? 'tr' : '');
  const skipLookup = code === srcLang;
  if (!skipLookup) {
    // Half-translated atoms from old MT runs ("Ekran Boyutu (İnç)" →
    // "Display Boyutu (İnç)") must not win over the curated fallback chain —
    // an EN "translation" still carrying Turkish/German letters is junk.
    const junkForEn = /[çğışıİäßÇĞŞ]|\b(?:diger|ozelligi?|kart\s+okuyucu|okuyucu|klavye|pil|batarya|ekran|depolama|dahili|grafik)\b|\bthe(?:\s+the){2,}\b/i;
    for (const src of [product?.multiLangSections?.[code], product?.multiLangSpecs?.[code]]) {
      if (src && typeof src === 'object' && !Array.isArray(src)) {
        for (const [k, v] of Object.entries(src)) {
          if (typeof v !== 'string') continue; // nested objects are not atoms
          if (code === 'en' && junkForEn.test(v)) continue;
          const nk = norm(k);
          if (nk && v.trim()) lookup.set(nk, v);
        }
      }
    }
  }
  return (term) => {
    const raw = String(term ?? '');
    let fallback = code === 'tr' ? raw : trSpec(raw, code);
    if (!raw.trim()) return fallback;
    const isSectionOrKeySpec = raw.length < 50 && !raw.includes(':') && !raw.includes('\n');
    if (isSectionOrKeySpec) {
      fallback = localizedSpecLabel(raw, code) || fallback;
    }
    if (raw.includes('\n')) {
      return raw.split(/\r?\n/).map((line) => {
        const t = line.trim();
        if (!t) return line;
        const hit = lookup.get(norm(t));
        return hit != null ? line.replace(t, hit) : (code === 'tr' ? line : trSpec(line, code));
      }).join('\n');
    }
    const hit = lookup.get(norm(raw));
    return hit != null ? hit : fallback;
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
  const srcLang = String(product?.sourceLang || '').toLowerCase();
  // Same-language source wins: a Turkish visitor on an Epey (TR) product and a
  // German visitor on a Geizhals (DE) product both get the AUTHENTIC source
  // specs — no translation round-trip, zero leak risk.
  const usesTurkishSource = srcLang === 'tr' && String(lang).toLowerCase().startsWith('tr');
  const usesGermanSource = srcLang === 'de' && String(lang).toLowerCase().startsWith('de');
  const useSource = (usesTurkishSource || usesGermanSource);
  const keySpecs = useSource && product?.sourceKeySpecs && typeof product.sourceKeySpecs === 'object' && Object.keys(product.sourceKeySpecs).length
    ? product.sourceKeySpecs
    : product?.keySpecs;
  if (keySpecs && typeof keySpecs === 'object' && Object.keys(keySpecs).length > 0) {
    addRows(keySpecsTitle, '⭐', Object.entries(keySpecs));
  }

  const sections = useSource && product?.sourceSpecSections && typeof product.sourceSpecSections === 'object' && Object.keys(product.sourceSpecSections).length
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
  const flat = useSource && product?.sourceSpecs && typeof product.sourceSpecs === 'object' && Object.keys(product.sourceSpecs).length
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

  // One consolidated AI analysis: a single API call returns all five sections
  // (deep, alternatives, advisor, prediction, forum). The user is charged once
  // (detail_ai_full = 3 Qor Coins, free/unlimited on Premium).
  const [aiFull, setAiFull] = useState({ phase: 'idle', busy: false, notice: '', data: null, questions: [] });
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
      setAiFull({ phase: 'idle', busy: false, notice: '', data: null, questions: [] });
    }
    aiUserKeyRef.current = key;
  }, [user?.id, user?.quizCompleted]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setAiFull({ phase: 'idle', busy: false, notice: '', data: null, questions: [] });
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

  // Charge + gate UP FRONT (2 Qor Coins; unlimited on Premium). With no balance
  // we never even prepare the quiz (the quiz generator is an AI call too) and
  // send the user to Premium. The analysis run below is NOT charged again.
  const startFullAnalysisQuiz = useCallback(async () => {
    if (!p || aiFull.busy || aiFull.data) return;
    setAiFull((s) => ({ ...s, busy: true, notice: '' }));
    const access = await requireAiAccess('detail_ai_full', {
      onMessage: (message) => setAiFull((s) => ({ ...s, notice: message })),
    });
    if (!access.ok) {
      setAiFull((s) => ({ ...s, phase: 'idle', busy: false }));
      return;
    }
    setAiFull((s) => ({ ...s, phase: 'quizLoading', busy: true, notice: '', questions: [] }));
    try {
      let questions = await generateQuiz({
        category: p.category,
        productTitle: localizedProductName(p, lang),
        url: productPath(p),
        language: lang,
        userProfile: aiUserProfile(user),
      });
      if (!questions.length) questions = fallbackProductQuiz(lang, localizedProductName(p, lang));
      setAiFull((s) => ({ ...s, phase: 'quiz', busy: false, questions }));
    } catch {
      setAiFull((s) => ({
        ...s,
        phase: 'quiz',
        busy: false,
        questions: fallbackProductQuiz(lang, localizedProductName(p, lang)),
      }));
    }
  }, [p, lang, user, aiFull.busy, aiFull.data, requireAiAccess]);

  // Quiz answers → one researched, consolidated report. Already paid for at
  // startFullAnalysisQuiz, so no second charge here (this is why answering the
  // quiz then continuing no longer bounces back to the quiz).
  const runFullAnalysis = useCallback(async (answers = []) => {
    if (!p || aiFull.data) return;
    setAiFull((s) => ({ ...s, phase: 'analyzing', busy: true, notice: '' }));
    try {
      let research = '';
      try {
        research = await askQorAiGrounded(buildProductResearchPrompt(p, lang, { quizAnswers: answers }), {
          language: lang,
          maxOutputTokens: 2048,
        });
      } catch {
        research = '';
      }
      const prompt = buildFullPrompt(p, lang, aiUserProfile(user), {
        quizAnswers: answers,
        research,
        similarProducts: similar,
        offers,
      });
      let txt = await askQorAiRaw({
        system: `You are Qor AI. Return only valid JSON in language code ${lang}. Use current research and Qor catalog context over stale model memory. Every user-facing text field must be in the requested language; keep only brand/product names and technical terms as-is.`,
        user: prompt,
        maxOutputTokens: 8192,
        temperature: 0.45,
        jsonMode: true,
      });
      let data = parseAiJson(txt);
      if (!data || typeof data !== 'object') throw new Error('parse');
      if (hasStaleAvailabilityClaims(txt)) {
        const retry = await askQorAiRaw({
          system: `You are Qor AI. Return only valid JSON in language code ${lang}. This is a freshness-critical retry; remove stale launch/availability assumptions. Every user-facing text field must be in the requested language.`,
          user: withFreshnessRetryInstruction(prompt, [localizedProductName(p, lang)]),
          maxOutputTokens: 8192,
          temperature: 0.25,
          jsonMode: true,
        });
        const retryData = parseAiJson(retry);
        if (!retryData || typeof retryData !== 'object' || hasStaleAvailabilityClaims(retry)) {
          throw new Error('stale-report');
        }
        txt = retry;
        data = retryData;
      }
      setAiFull({ phase: 'result', busy: false, notice: '', data, questions: [] });
      saveProductAnalysisHistory({ product: p, analysis: txt });
    } catch {
      setAiFull((s) => ({ ...s, phase: 'quiz', busy: false, notice: t('pd.aiError') }));
    }
  }, [p, lang, t, user, aiFull.data, similar, offers]);

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
  const bricks = mergeSpecBricks(p, t('pd.keySpecs'), t('pd.allSpecs'), lang);
  const specTr = buildSpecTranslator(p, lang);
  const displayName = localizedProductName(p, lang);

  // Hero key specs: show only real catalog specs, ranked by buyer importance.
  // Metadata such as category, brand, model name and Qor scores belongs outside
  // this grid.
  const heroSpecs = (() => {
    const candidates = [];
    const seen = new Set();
    const rankFor = (label, value, fallback = 999) => {
      const text = `${label} ${value}`;
      const hit = HERO_SPEC_PRIORITY.find((r) => r.re.test(text));
      return hit ? hit.rank : fallback;
    };
    const iconFor = (label, value, fallback = '•') => {
      const text = `${label} ${value}`;
      const hit = HERO_SPEC_PRIORITY.find((r) => r.re.test(text));
      return hit?.icon || fallback;
    };
    const push = (s, fallbackRank = 999) => {
      const label = String(s.label || '').trim();
      const value = String(s.value || '').trim();
      if (!label || !value) return;
      if (/sponsor|reklam|advert|affiliate/i.test(`${label} ${value}`)) return;
      if (/^(brand|marka|category|kategori|model|qor|tech score|teknik skor)$/i.test(label)) return;
      const sig = normHeroSpecText(label).replace(/[^a-z0-9]+/g, '_');
      if (seen.has(sig)) return;
      seen.add(sig);
      candidates.push({
        ...s,
        icon: s.icon && s.icon !== '•' ? s.icon : iconFor(label, value, sectionIcon(label)),
        label,
        value,
        rank: rankFor(label, value, fallbackRank),
      });
    };
    chips.forEach((c, i) => push({
      key: c.labelKey,
      icon: SPEC_EMOJI[c.labelKey] || '•',
      value: localizedSpecValue(c.value, lang),
      label: localizedSpecLabel(t(c.labelKey), lang),
    }, i * 5));
    bricks.flatMap((br) => br.rows || []).forEach(([k, v]) => {
      const value = localizedSpecValue(specTr(String(v).split(/\r?\n/)[0].trim()), lang);
      const label = localizedSpecLabel(specTr(k), lang).replace(/\s*:\s*$/, '');
      const compact = value.length <= 34 && label.length <= 34;
      const informative = /\d/.test(value) || !/^(yes|no|var|yok|evet|hayır|hayir|true|false)$/i.test(value) || candidates.length < 8;
      if (compact && informative) {
        push({ key: k, icon: sectionIcon(k), value, label });
      }
    });
    return candidates
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10)
      .map(({ rank, ...rest }) => rest);
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
            const FLAG = { TR: '🇹🇷', DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', NL: '🇳🇱', PL: '🇵🇱', SE: '🇸🇪', AT: '🇦🇹', CH: '🇨🇭', BE: '🇧🇪', CA: '🇨🇦' };
            // Every Amazon storefront the OneLink store earns from, plus the
            // detected geo and any country with a retailer offer.
            const countryOptions = [...new Set([
              String(geoCountry || '').toUpperCase(),
              ...AMAZON_ONELINK_COUNTRIES,
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
                          <option key={c} value={c}>{`${FLAG[c] || '🌍'} ${countryDisplayName(c, lang)}`}</option>
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
            const diffKinds = pickVariantDiffKinds([p, ...variants]);
            return (
              <section className="pd-block">
                <h2 className="pd-block-title">{L('Variants', 'Varyantlar', 'Varianten')}</h2>
                <div className="pd-variants-list">
                  {variants.map((v) => {
                    const variantName = variantModelLabel(v, lang);
                    return (
                      <Link key={v.id} to={productPath(v)}
                        className={'pd-variant-card' + (v.id === p.id ? ' on' : '')}>
                        <div className="pd-variant-media">
                          <div className="pd-variant-img">
                            <ProductImg src={v.imageUrl || (v.images && v.images[0])} alt={variantName} size="card" />
                          </div>
                        </div>
                        <div className="pd-variant-body">
                          {v.brand && <span className="pd-variant-brand">{v.brand}</span>}
                          <span className="pd-variant-name">{variantName}</span>
                          {diffKinds.length > 0 && (
                            <div className="pd-variant-specs">
                              {diffKinds.map((kind) => {
                                const raw = variantSpecValue(v, kind);
                                return (
                                  <span className="pd-variant-spec" key={kind}>
                                    <b>{raw ? localizedSpecValue(raw, lang) : '—'}</b>
                                    <small>{variantKindLabel(kind, lang)}</small>
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
                  {aiFull.data ? (
                    <div className="pd-ai-report">
                      <AiAnalysisView kind="productFull" data={aiFull.data} lang={lang} />
                    </div>
                  ) : aiFull.phase === 'quiz' && aiFull.questions.length > 0 ? (
                    <QuizFlow
                      questions={aiFull.questions}
                      busy={aiFull.busy}
                      title={L('Tune the analysis', 'Analizi kişiselleştir', 'Analyse anpassen')}
                      subtitle={L(
                        'Answer these before the report so the match score reflects your real use.',
                        'Rapor öncesi cevapla; uyum puanı gerçek kullanımına göre hesaplansın.',
                        'Beantworte dies vor dem Bericht, damit der Match-Score zu deiner Nutzung passt.',
                      )}
                      onSubmit={runFullAnalysis}
                    />
                  ) : (
                    <div className="pd-ai-intro">
                      {aiFull.busy ? (
                        aiFull.phase === 'analyzing'
                          ? <AiLoadingSteps lang={lang} mode="product" />
                          : <AiLoadingSteps lang={lang} mode="quizProduct" />
                      ) : (
                        <button type="button" className="btn btn-grad btn-shine pd-ai-run" onClick={startFullAnalysisQuiz}>
                          {L('Start analysis', 'Analizi başlat', 'Analyse starten')}
                        </button>
                      )}
                      {aiFull.notice && <div className="pd-ai-notice">{aiFull.notice}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <Reviews productId={p.id} productName={displayName} lang={lang} />
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
      {edges.left && (
        <button type="button" className="pd-rail-arr pd-rail-prev" aria-label="‹" onClick={() => scroll(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
      )}
      <div className="rail" ref={ref}>{children}</div>
      {edges.right && (
        <button type="button" className="pd-rail-arr pd-rail-next" aria-label="›" onClick={() => scroll(1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </button>
      )}
    </div>
  );
}

function PriceHistoryChart({ points = [], loading = false, lang, country, L }) {
  const daily = (() => {
    const byDay = new Map();
    for (const item of points || []) {
      const ts = Date.parse(item.checkedAt || '');
      if (!Number.isFinite(ts) || !(Number(item.price) > 0)) continue;
      const day = new Date(ts).toISOString().slice(0, 10);
      const existing = byDay.get(day);
      if (!existing || Number(item.price) < existing.price) {
        byDay.set(day, {
          date: day,
          ts,
          price: Number(item.price),
          currency: item.currency || existing?.currency || 'USD',
          store: item.store || '',
        });
      }
    }
    return [...byDay.values()].sort((a, b) => a.ts - b.ts).slice(-60);
  })();

  const fmt = (value, currency) => {
    try {
      return new Intl.NumberFormat(lang, {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${currency || ''} ${Math.round(value).toLocaleString(lang)}`.trim();
    }
  };
  const fmtDate = (day) => {
    try {
      return new Intl.DateTimeFormat(lang, { day: '2-digit', month: 'short' }).format(new Date(`${day}T12:00:00Z`));
    } catch {
      return day;
    }
  };

  if (loading) {
    return (
      <div className="pd-price-history pd-price-history-loading">
        <div className="spinner" />
        <span>{L('Loading price history...', 'Fiyat geçmişi yükleniyor...', 'Preisverlauf wird geladen...')}</span>
      </div>
    );
  }

  if (daily.length < 2) {
    return (
      <div className="pd-price-history pd-price-history-empty">
        <b>{L('Price history', 'Fiyat geçmişi', 'Preisverlauf')}</b>
        <span>{L(
          'Not enough fresh snapshots yet for this delivery market. The chart appears automatically as tracked offers update.',
          'Bu teslimat pazarı için henüz yeterli güncel snapshot yok. Takip edilen teklifler güncellendikçe grafik otomatik oluşur.',
          'Für diesen Liefermarkt gibt es noch nicht genug aktuelle Snapshots. Der Verlauf erscheint automatisch, sobald Angebote aktualisiert werden.',
        )}</span>
      </div>
    );
  }

  const min = Math.min(...daily.map((x) => x.price));
  const max = Math.max(...daily.map((x) => x.price));
  const pad = max === min ? Math.max(1, max * 0.04) : (max - min) * 0.12;
  const low = min - pad;
  const high = max + pad;
  const width = 640;
  const height = 172;
  const left = 18;
  const right = width - 18;
  const top = 18;
  const bottom = height - 28;
  const xFor = (i) => daily.length === 1 ? (left + right) / 2 : left + ((right - left) * i) / (daily.length - 1);
  const yFor = (price) => bottom - ((price - low) / Math.max(1, high - low)) * (bottom - top);
  const coords = daily.map((pnt, i) => [xFor(i), yFor(pnt.price)]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${bottom} L${coords[0][0].toFixed(1)} ${bottom} Z`;
  const first = daily[0];
  const last = daily[daily.length - 1];
  const diff = last.price - first.price;
  const diffPct = first.price > 0 ? (diff / first.price) * 100 : 0;
  const trendClass = diff < 0 ? 'down' : diff > 0 ? 'up' : 'flat';

  return (
    <div className="pd-price-history">
      <div className="pd-price-history-head">
        <div>
          <b>{L('Price history', 'Fiyat geçmişi', 'Preisverlauf')}</b>
          <span>{country ? country.toUpperCase() : L('Selected market', 'Seçili pazar', 'Ausgewählter Markt')}</span>
        </div>
        <div className="pd-price-history-now">
          <strong>{fmt(last.price, last.currency)}</strong>
          <small className={trendClass}>
            {diff === 0 ? '0%' : `${diff > 0 ? '+' : ''}${diffPct.toFixed(1)}%`}
          </small>
        </div>
      </div>
      <svg className="pd-price-history-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={L('Price history chart', 'Fiyat geçmişi grafiği', 'Preisverlaufsdiagramm')}>
        <defs>
          <linearGradient id="pdPriceFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => {
          const y = top + (bottom - top) * t;
          return <line key={t} x1={left} x2={right} y1={y} y2={y} />;
        })}
        <path d={area} className="pd-price-history-area" />
        <path d={line} className="pd-price-history-line" />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 4 : 2.6} />
        ))}
      </svg>
      <div className="pd-price-history-foot">
        <span>{fmtDate(first.date)} · {fmt(first.price, first.currency)}</span>
        <span>{daily.length} {L('snapshots', 'snapshot', 'Snapshots')}</span>
        <span>{fmtDate(last.date)} · {last.store || L('latest', 'son', 'neueste')}</span>
      </div>
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
