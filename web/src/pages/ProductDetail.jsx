import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHref, useLocation, useParams, useSearchParams, Link } from 'react-router-dom';
import { getProduct, getSimilar, getVariants, resolveProduct } from '../lib/typesense';
import { askQorAiGrounded, askQorAiRaw } from '../lib/ai';
import { generateQuiz } from '../lib/linkAnalysis';
import { useCompare, COMPARE_MAX } from '../lib/compare';
import { useFavorites } from '../lib/favorites';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import {
  clearProductAnalysisJob, runProductAnalysisJob, startProductAnalysisJob, subscribeProductAnalysisJob,
} from '../lib/productAnalysisJobs';
import { pb } from '../lib/pocketbase';
import { getSavedProductAnalysis, saveProductAnalysisHistory } from '../lib/pbHistory';
import { getRecentProducts } from '../lib/recentViewed';
import { useI18n } from '../i18n/index.jsx';
import { amazonUrlForProduct, amazonGoPath, catMeta, categoryLabel, keySpecChips, priceForCountry } from '../lib/format';
import { useGeoCountry } from '../lib/geo';
import { bestOfferForLang, fetchProductOffers, formatOfferPrice, offerClickPath } from '../lib/offers';
import OfferList, { sortedOffers } from '../components/OfferList.jsx';
import ProductCard from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import AnalyzeButton, { analizeKaydir } from '../components/AnalyzeButton.jsx';
import AmazonLogo from '../components/AmazonLogo.jsx';
import { IconX, IconChevronLeft, IconChevronRight } from '../components/GlyphIcons.jsx';
import Gauge, { techColor, inkColor } from '../components/Gauge.jsx';
// AI ANALIZ AGACI TEMBEL. Bu dort bilesen yalnizca kullanici "Analiz" sekmesini
// acinca ciziliyor, ama STATIK import edildikleri icin urun sayfasi her
// aciliste hepsini indiriyordu: AiCharts 108 KB + AiAnalysis 42 KB + QuizFlow
// 17 KB + Reviews 11 KB JS ve ~46 KB CSS. Olculdu (2026-08-15, yavas 4G + 4x
// CPU): bu chunk'larin CSS'i 3196 ms'de KESFEDILIYOR ve React ancak 5076 ms'de
// boyuyordu — LCP gorseli 1782 ms'de hazir olmasina ragmen.
// AiAnalysis.jsx'ten BES isim aliniyordu ama dordu bu dosyada HIC kullanilmiyor
// (buildFullPrompt, buildProductResearchPrompt, hasStaleAvailabilityClaims,
// withFreshnessRetryInstruction); modul zaten import edildigi icin rollup
// bunlari eleyemiyordu. Kullanilan tek isim `parseAiJson` ve o da yalnizca
// GIRIS YAPMIS + kayitli analizi olan kullanicida calisiyor -> dinamik import.
const AiAnalysisView = lazy(() => import('../components/AiAnalysis.jsx'));
const AiWorkboard = lazy(() => import('../components/AiWorkboard.jsx'));
const QuizFlow = lazy(() => import('../components/QuizFlow.jsx'));
import AnalysisExitBar from '../components/AnalysisExitBar.jsx';
import { ensureSpecDictionary, trSpec, specDictCache } from '../lib/specDictionary';
// SPEC CEVIRISININ TEK KAYNAGI (admin paneliyle AYNI dosya) — bkz. lib/specI18n.js
import { localizeProduct } from '../lib/specI18n';
import {
  isDisplayableSpec, isHiddenSpec, isHighlightsTitle, localizedSpecLabel, localizedSpecValue,
  sourceLangOf, sourceSpecMaps,
} from '../lib/specDisplay';
import { useSeo, truncate, SITE_URL, DEFAULT_OG_IMAGE, hreflangAlternates } from '../lib/seo';
import { pushRecent } from '../lib/recentViewed';
import { productImageList } from '../lib/imageUrl';
import { categoryPath, parseProductToken, productPath } from '../lib/routes';
import { calculateProfileMatchScore, hasProfileMatch } from '../lib/profileMatch';
import { cleanProductName, displayProductName } from '../lib/productNames';
import { usePageContext } from '../lib/pageContext';
import { modeOn } from '../lib/siteMode';
import ScrollRail from '../components/ScrollRail.jsx';
const Reviews = lazy(() => import('../components/Reviews.jsx'));
import './ProductDetail.css';
// Ortak AI rapor govdesi (AiReportView) 'la-*' siniflarini kullanir. CSS'i
// PAYLASILAN bilesen degil SAYFA import eder: boylece stil bu sayfanin tembel
// parcasinda kalir, giris paketini (her sayfada indirilen CSS) sismez.
import './LinkAnalysis.css';

const YES_RE = /^(yes|var|evet|true|ja|oui|sí|si|sim|tak|有り|نعم)$/i;
const NO_RE = /^(no|yok|hayır|hayir|nein|non|não|nao|nie|false|無し|لا)$/i;

function bandLabel(s, L) {
  return s >= 90 ? L('Excellent', 'Mükemmel')
    : s >= 75 ? L('Good', 'İyi')
    : s >= 55 ? L('Average', 'Orta')
    : L('Weak', 'Zayıf');
}
function savedAtLabel(at, lang) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const loc = lang === 'tr' ? 'tr' : 'en';
  try { return d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d.toISOString().slice(0, 10); }
}
const SPEC_EMOJI = { 'spec.screen': '🖥️', 'spec.ram': '🧠', 'spec.storage': '💾', 'spec.battery': '🔋', 'spec.camera': '📷', 'spec.cpu': '⚙️', 'spec.gpu': '🎮' };
// SABİT ikon standardı: ikon önce spec'in KAVRAMINDAN (heroSpecConcept) gelir.
// Eskiden yalnızca HERO_SPEC_PRIORITY'nin ilk eşleşen kuralı kullanılıyordu ve
// tek kural birden çok speci yakalıyordu (ör. "processor|cpu|gpu|core" kuralı
// hem işlemciye hem ekran kartına 🧠 veriyordu; "\d+ GB" kuralı hem RAM'e hem
// depolamaya 💾). Kullanıcı "aynı emoji birkaç özellikte tekrar ediyor" dedi.
const CONCEPT_ICON = {
  screen: '🖥️', resolution: '🔳', ram: '🧠', storage: '💾', battery: '🔋',
  camera: '📷', cpu: '⚙️', gpu: '🎮', os: '🧩', network: '📡', weight: '⚖️',
};
// Aynı ikon iki kez düşerse ikinciye buradan sıradaki KULLANILMAMIŞ ikon verilir.
const SPARE_ICONS = ['🔷', '📐', '🔌', '🧬', '⚡', '⏱️', '🧊', '🛡️', '🎚️', '🔧', '📦'];
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

// Per-category ordering of the hero key-spec grid, expressed as a concept order
// (concepts come from heroSpecConcept). The grid shows ONE row per concept
// (deduped), laid out the way a buyer in that category ranks specs — e.g. a
// laptop leads with storage → RAM → CPU → GPU → screen. Concepts not listed for
// a category fall after these, ordered by the generic HERO_SPEC_PRIORITY.
const CATEGORY_SPEC_ORDER = {
  laptops:        ['storage', 'ram', 'cpu', 'gpu', 'screen', 'resolution', 'battery', 'weight', 'network', 'os'],
  desktops:       ['cpu', 'gpu', 'ram', 'storage', 'network', 'os'],
  smartphones:    ['screen', 'camera', 'storage', 'ram', 'battery', 'cpu', 'resolution', 'network', 'os'],
  feature_phones: ['screen', 'battery', 'camera', 'storage', 'network'],
  tablets:        ['screen', 'storage', 'ram', 'cpu', 'battery', 'camera', 'resolution', 'network', 'os'],
  e_readers:      ['screen', 'storage', 'battery', 'resolution', 'weight', 'network'],
  vr_headsets:    ['screen', 'resolution', 'cpu', 'storage', 'ram', 'network', 'weight'],
  tvs:            ['screen', 'resolution', 'cpu', 'os', 'network'],
  monitors:       ['screen', 'resolution', 'network'],
  projectors:     ['resolution', 'screen', 'network'],
  smartwatches:   ['screen', 'battery', 'storage', 'network', 'weight'],
  smart_rings:    ['battery', 'weight', 'network'],
  headphones:     ['battery', 'network', 'weight'],
  earbuds:        ['battery', 'network', 'weight'],
  earphones:      ['battery', 'network', 'weight'],
  speakers:       ['network', 'battery', 'weight'],
  soundbars:      ['network', 'weight'],
  powerbanks:     ['battery', 'network', 'weight'],
  cameras:        ['camera', 'resolution', 'screen', 'storage', 'battery', 'weight'],
  action_cameras: ['camera', 'resolution', 'battery', 'screen', 'weight'],
  graphics_cards: ['gpu', 'ram', 'cpu', 'network', 'weight'],
  gpus:           ['gpu', 'ram', 'cpu', 'network', 'weight'],
  cpus:           ['cpu', 'gpu', 'ram'],
  default:        ['cpu', 'gpu', 'ram', 'storage', 'screen', 'resolution', 'camera', 'battery', 'network', 'weight', 'os'],
};

// For a component product the category IS one concept, so its hero grid should
// show that concept's many FACETS (a RAM stick: capacity, speed, type, form),
// deduped only on identical values. For everything else a concept is a single
// headline attribute (a laptop shows one CPU row, not its clock/brand/cores/
// year as six rows), so it collapses by concept. This maps a category to the
// concept it "is" — when a spec matches it we dedup by concept+value, otherwise
// by concept alone.
const CATEGORY_SELF_CONCEPT = {
  ram: 'ram',
  ssd: 'storage', ssds: 'storage', storage: 'storage', flash_drives: 'storage',
  cpus: 'cpu',
  gpus: 'gpu', graphics_cards: 'gpu',
};

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

// Compact signature of a spec's VALUE, used so two specs collapse only when they
// state the same fact. Dedup keys combine concept + this signature: three
// "24 GB" RAM rows on a laptop all reduce to ram|24gb (collapse), while a RAM
// stick's distinct facets — 16 GB, 5600 MT/s, DDR5, SO DIMM — keep different
// signatures and all survive. "1×16 GB" reduces to 16gb so it merges with the
// "16 GB" capacity row instead of repeating it. Prefers a data-size figure,
// then the first number+unit, then the normalised text.
function heroValueSig(value) {
  const s = String(value || '').toLowerCase();
  const cap = s.match(/(\d+(?:[.,]\d+)?)\s*(tb|gb|mb)\b/);
  if (cap) return cap[1].replace(',', '.') + cap[2];
  const any = s.match(/(\d+(?:[.,]\d+)?)\s*([a-z%"″]+)/);
  if (any) return any[1].replace(',', '.') + any[2];
  return s.replace(/[^a-z0-9]+/g, '').slice(0, 24);
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

// buildSpecTranslator KALDIRILDI (2026-08-18). Urun-basi ceviri haritasi,
// trSpec yedegi ve localizedSpecLabel katlamasi ADMIN PANELINDEN AYRI bir
// ceviri zinciriydi; ayni kayit icin panelde "Slow-motion recording options",
// sitede "Agir Cekim Kayit Secenekleri" cikiyordu. Tek kaynak:
// admin/js/spec_i18n.js -> localizeProduct (bkz. lib/specI18n.js).

function mergeSpecBricks(product, keySpecsTitle, allSpecsTitle, lang, dict) {
  // ── SPEC METNI: TEK KAYNAK ───────────────────────────────────────────────
  // Etiket / deger / bolum basligi cevirisi artik admin/js/spec_i18n.js
  // icinde (localizeProduct). Bu sayfa kendi ceviri zincirini KOSTURMAZ;
  // admin panelinde gorulen metnin AYNISINI alir. Eski yol
  // (buildSpecTranslator + trSpec + localizedSpecLabel) cevrilemeyen Turkce
  // etiketi ASCII'ye katlayip sahte Ingilizce uretiyordu:
  //   site  "Agir Cekim Kayit Secenekleri"
  //   admin "Slow-motion recording options"
  //
  const code = String(lang || 'en').slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
  const pm = localizeProduct(product, code, { dict: dict || null });

  const bricks = [];
  const seen = new Set();
  const addRows = (title, icon, entries) => {
    const rows = [];
    (entries || []).forEach(([k, v]) => {
      const key = String(k || '').trim();
      const value = v == null ? '' : String(v).trim();
      if (!key || !value) return;
      if (isHiddenSpec(key, value)) return; // benchmark / TR-only availability rows
      if (!isDisplayableSpec(key, value)) return;
      const sig = key.toLowerCase();
      if (seen.has(sig)) return;
      rows.push([key, value]);
      seen.add(sig);
    });
    if (rows.length) bricks.push({ title, icon, rows });
  };

  const keySpecs = pm.keySpecs;
  if (keySpecs && typeof keySpecs === 'object' && Object.keys(keySpecs).length > 0) {
    addRows(keySpecsTitle, '⭐', Object.entries(keySpecs));
  }

  if (pm.sections) {
    for (const [section, specs] of Object.entries(pm.sections)) {
      // "One Cikanlar" zaten yildizli blokta basildi; basligi tekrar etme.
      if (pm.isHighlightsTitle(section) || isHighlightsTitle(section)) continue;
      if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
        addRows(section, sectionIcon(section), Object.entries(specs));
      }
    }
  }

  // Catch-all: bolum agacina girmemis duz spec'ler.
  const flat = pm.flat;
  if (flat && typeof flat === 'object') {
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
    if (isHiddenSpec(name, value)) return false;
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
  // BAŞLIK/AÇIKLAMA DİLE GÖRE. Bunlar SABİT TÜRKÇEYDİ ve ön-render'ı EZİYORDU:
  // seo.mjs ürün sayfasını İngilizce üretse bile Googlebot JS'i çalıştırınca
  // useSeo bu Türkçe metni basıyor ve indekse o giriyordu. Google'da İngilizce
  // arayan kullanıcıya "… özellikleri ve karşılaştırma" çıkmasının sebebi buydu
  // (ölçüldü 2026-08-06).
  const SEO_TX = {
    en: {
      title: (n) => `${n} — Specs & Comparison | Qor AI`,
      score: (s) => `Qor AI tech score ${s}/100. `,
      tail: 'Check the specs, compare and decide.',
    },
    tr: {
      title: (n) => `${n} özellikleri ve karşılaştırma — Qor AI`,
      score: (s) => `Qor AI teknik skoru ${s}/100. `,
      tail: 'Özellikleri incele, karşılaştır ve karar ver.',
    },
  };
  const tx = SEO_TX[lang] || SEO_TX.en;
  const title = truncate(tx.title(name), 68);
  const description = truncate(
    p.description
    || `${name}: ${p.brand ? `${p.brand}, ` : ''}${category}. `
       + `${score > 0 ? tx.score(score) : ''}`
       + `${keySpecs ? `${keySpecs}. ` : ''}`
       + tx.tail,
  );
  const images = seoImageUrls(p);
  const image = images[0] || DEFAULT_OG_IMAGE;
  const path = productPath(p);
  const url = `${SITE_URL}${path}`;
  const categoryUrl = `${SITE_URL}${categoryPath(p.category)}`;
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
  // A Product node is only valid for Google when it carries offers / review /
  // aggregateRating. We have no ratings/reviews and only a price when there's a
  // fresh offer, so emit the Product (and point mainEntity at it) ONLY then —
  // otherwise Search Console flags every price-less product as an invalid
  // Product snippet. Price-less products fall back to WebPage + Breadcrumb.
  const hasOffer = !!offer;
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
    ...(hasOffer ? { mainEntity: { '@id': `${url}#product` } } : {}),
  };
  return {
    title, description, image, imageAlt: name, path, type: 'product',
    // Ürün sayfası iki dilde ön-render ediliyor (kök=en, /tr/…). Bu küme
    // olmadan useSeo, ön-render'ın bastığı hreflang etiketlerini render sırasında
    // SİLİYORDU — Googlebot JS'i çalıştırdığında dil varyantları yok oluyordu.
    htmlLang: lang,
    alternates: hreflangAlternates(path),
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': hasOffer ? [webPage, product, breadcrumb] : [webPage, breadcrumb],
    },
  };
}

export default function ProductDetail() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const loc = useLocation();
  // Adres artik `/product/<slug>` (sondaki id kaldirildi, 2026-08-19). Jeton
  // slug, `slug-id` (eski bicim) ya da duz id olabilir; `id` degiskeni
  // effect'lerin bagimlilik anahtari olarak KALIYOR — adresteki jetonun
  // kendisi bu is icin yeterli ve kararli.
  const kok = useHref('/');
  const jeton = String(params.id || searchParams.get('id') || '').trim();
  const adres = parseProductToken(jeton);
  const id = adres.id || adres.slug;
  const { t, lang } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
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
  // ── ULKE SECICI KALDIRILDI (2026-09-02) ──────────────────────────────────
  // Fiyatin ulkesi ARTIK TEK KAYNAKTAN gelir: ziyaretcinin baglandigi ulke
  // (lib/geo.js -> useGeoCountry). Elle secim yoktu sayilir — okuyucunun
  // %99'u kendi pazarinin fiyatini ariyor — ama secici her sayfada yer
  // kapliyor ve "hangi fiyat benim icin gecerli" sorusunu doguruyordu.
  // Amazon linki de ayni ulkenin vitrinine gider (amazonGoPath).

  // One consolidated AI analysis: a single API call returns all five sections
  // (deep, alternatives, advisor, prediction, forum). The user is charged once
  // (detail_ai_full = 3 Qor Coins, free/unlimited on Premium).
  const [aiFull, setAiFull] = useState({ phase: 'idle', busy: false, notice: '', data: null, questions: [] });
  const aiUserKeyRef = useRef('');

  const [similar, setSimilar] = useState([]);
  const [variants, setVariants] = useState([]);
  // YAYINLANMIS ANALIZ. On-render'daki urun govdesi de bu linki tasiyor ama
  // React devralinca o govde SILINIYOR: link yalnizca JS calistirmayan
  // tarayiciya/crawler'a kaliyordu. Gercek okuyucunun gorebilmesi icin burada
  // da aranir. Sorgu urun degistiginde tekrar kosar.
  const [analizSlug, setAnalizSlug] = useState('');

  useEffect(() => {
    const s = p?.slug;
    if (!s) { setAnalizSlug(''); return undefined; }
    let live = true;
    pb.collection('analyses')
      .getFirstListItem(`productSlug="${String(s).replace(/"/g, '')}"`, { $autoCancel: false })
      .then((r) => { if (live) setAnalizSlug(r?.slug || ''); })
      // 404 = o urunun analizi yok; beklenen durum, sessizce gecilir.
      .catch(() => { if (live) setAnalizSlug(''); });
    return () => { live = false; };
  }, [p?.slug]);

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
    resolveProduct(adres)
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
    // `p` HENÜZ adresteki ürün olmayabilir: "Benzer ürünler"den başka bir ürüne
    // tıklandığında adres anında değişir ama yeni kayıt gelene kadar `p` önceki
    // üründür. O anda kanonik adresi yazmak, adres çubuğunu ESKİ ürüne geri
    // çeviriyordu (yenileme/geri tuşu yanlış ürüne gidiyordu).
    // Adres artik slug tasidigi icin karsilastirma "p.id === id" olamaz:
    // eslesme ya id ya da kanonik slug uzerinden kurulur. Bu kontrol
    // kaldirilirsa (ya da hep yanlis donerse) "Benzer urunler"den gecişte
    // adres cubugu ESKI urune geri doner — daha once tam olarak bu yasandi.
    const kanonik = productPath(p);
    const adresJetonu = adres.id || adres.slug;
    const eslesiyor = (adres.id && p.id === adres.id)
      || (adres.slug && kanonik === `/product/${adres.slug}`)
      || (adres.slugKisa && kanonik === `/product/${adres.slugKisa}`);
    if (!eslesiyor || !adresJetonu) return;
    const currentPath = `${loc.pathname}${loc.search}`;
    // DIL ONEKI: router `basename` ile kuruluyor (main.jsx: /tr, /de), yani
    // `loc.pathname` ZATEN oneksiz. Ham `history.replaceState`e mutlak bir yol
    // vermek onegi DUSURUR — olculdu: /tr/product/<slug>-<id> adresi
    // /product/<slug>'a donuyor ve canonical Ingilizceye kayiyordu.
    // `useHref('/')` router'in kok yolunu (yani onegi) dondurur; adres cubugu
    // icin dogru olan bu.
    const hedef = `${kok.replace(/\/$/, '')}${kanonik}`;
    if (hedef !== `${kok.replace(/\/$/, '')}${currentPath}` && /^\/product/.test(loc.pathname)) {
      window.history.replaceState(window.history.state, '', hedef);
    }
  }, [loc.pathname, loc.search, p, adres.id, adres.slug, adres.slugKisa, kok]);

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

  // Revisiting a product shows the previously saved analysis from the user's PB
  // account — no re-run, no second charge. Only fills an idle slot so it never
  // clobbers a running/fresh analysis. A "re-analyze" button refreshes it.
  useEffect(() => {
    let live = true;
    if (!p?.id || !user) return undefined;
    getSavedProductAnalysis(p.id).then(async (saved) => {
      if (!live || !saved?.analysis) return;
      // Ayristirici AI analiz chunk'inda; buraya ancak kayitli bir rapor VARSA
      // gelinir, yani chunk ilk boyamanin yolunda degil.
      const { parseAiJson } = await import('../components/AiAnalysis.jsx');
      if (!live) return;
      const parsed = parseAiJson(saved.analysis);
      if (!parsed || typeof parsed !== 'object') return;
      setAiFull((s) => (s.data || s.busy || s.phase !== 'idle'
        ? s
        : { phase: 'result', busy: false, notice: '', data: parsed, questions: [], savedAt: saved.at || '' }));
    });
    return () => { live = false; };
  }, [p?.id, user?.id]); // eslint-disable-line

  // Charge + gate UP FRONT (2 Qor Coins; unlimited on Premium). With no balance
  // we never even prepare the quiz (the quiz generator is an AI call too) and
  // send the user to Premium. The analysis run below is NOT charged again.
  const startFullAnalysisQuiz = useCallback(async (force = false) => {
    // `force` re-runs a fresh analysis even when a saved/cached report is shown.
    if (!p || aiFull.busy || aiFull.checking || (aiFull.data && !force)) return;
    // ÖNCE KONTROL, SONRA ANIMASYON (2026-08-07).
    // Eskiden burada `busy: true` yazılıyordu ve ekran anında "Quiz
    // hazırlanıyor" animasyonuna geçiyordu — bakiyesi 0 olan kullanıcı da
    // analiz başlıyor sanıyordu, oysa hiç başlamıyordu. `checking` ayrı bir
    // bayrak: yalnız çift tıklamayı engeller, animasyonu AÇMAZ.
    setAiFull((s) => ({ ...s, checking: true, notice: '', noticeCode: '' }));
    const access = await requireAiAccess('detail_ai_full', {
      onMessage: (message, code) => setAiFull((s) => ({ ...s, notice: message, noticeCode: code })),
    });
    if (!access.ok) {
      setAiFull((s) => ({ ...s, phase: 'idle', busy: false, checking: false }));
      return;
    }
    // Fresh run: drop the cached saved report so the quiz/workboard renders.
    // Is artik MODUL SEVIYESINDE kosuyor (lib/productAnalysisJobs): kullanici
    // baska sayfaya gecerse bilesen sokulur ama analiz devam eder, donunce
    // durumu abonelikten geri gelir.
    setAiFull((s) => ({ ...s, phase: 'quizLoading', busy: true, checking: false, notice: '', noticeCode: '', questions: [], data: null, savedAt: '' }));
    startProductAnalysisJob({
      product: p,
      lang,
      user,
      productTitle: localizedProductName(p, lang),
      productUrl: productPath(p),
      fallbackQuiz: fallbackProductQuiz(lang, localizedProductName(p, lang)),
    });
  }, [p, lang, user, aiFull.busy, aiFull.checking, aiFull.data, requireAiAccess]);

  // Quiz answers → one researched, consolidated report. Already paid for at
  // startFullAnalysisQuiz, so no second charge here (this is why answering the
  // quiz then continuing no longer bounces back to the quiz).
  const runFullAnalysis = useCallback((answers = []) => {
    if (!p || aiFull.data) return;
    // Ucret quiz adiminda alindi — burada TEKRAR ALINMAZ.
    runProductAnalysisJob({
      // `similar` GONDERILMEZ. Rapordaki alternatiflerin aday listesi
      // "Benzer Urunler" rayi DEGIL, ayni segmentten secilen ayri bir liste;
      // isi baslatan taraf onu kendisi cekiyor (bkz. getPeerAlternatives).
      // Sayfa acilisinda cekmek her urun sayfasina iki bosuna sorgu eklerdi.
      product: p, lang, user, answers, offers,
      productTitle: localizedProductName(p, lang),
    });
  }, [p, lang, user, aiFull.data, offers]);

  // ARKA PLANDAKI ISIN ANLIK GORUNTUSU -> bilesen state'i.
  // Akıştan çıkış: koşan işi bırak, panel baştaki "analizi başlat" hâline dönsün.
  function exitProductAnalysis() {
    clearProductAnalysisJob();
    setAiFull({ phase: 'idle', busy: false, notice: '', data: null, questions: [] });
  }

  useEffect(() => subscribeProductAnalysisJob((job) => {
    if (!p || !job || job.key !== p.id) return;
    setAiFull((s) => ({
      ...s,
      phase: job.phase === 'error' ? 'error' : job.phase,
      busy: job.phase === 'quizLoading' || job.phase === 'analyzing',
      checking: false,
      stage: job.stage || null,
      phaseStartedAt: job.phaseStartedAt || job.startedAt || null,
      questions: job.questions || [],
      answers: job.answers || [],
      data: job.data || s.data,
      notice: job.phase === 'error' ? t('pd.aiError') : s.notice,
    }));
  }), [p?.id, t]); // eslint-disable-line

  // Deep link from the blog "AI ile analiz et" buttons: /product/...?ai=1 opens
  // the AI tab and kicks off the full analysis as soon as the product loads.
  // "Analiz Et" (ust eylem satiri): sekmeyi AI'ya cevir → oraya kaydir →
  // analizi baslat. Sira ONEMLI: sekme once degismezse kaydirilacak panel
  // henuz DOM'da olmaz; kaydirma da bir sonraki kareye birakiliyor ki React
  // yeni sekmeyi basmis olsun ve hedefin konumu DOGRU olcusun.
  const aiSekmeRef = useRef(null);
  const analizeBaslat = useCallback(() => {
    setTab('premium');
    requestAnimationFrame(() => {
      analizeKaydir(aiSekmeRef.current);
      // Zaten kosan ya da hazir bir analiz varsa YENIDEN baslatma — kullanici
      // yalnizca sonuca gitmek istiyor olabilir; startFullAnalysisQuiz zaten
      // bu durumda erken cikiyor ama niyeti burada da acik tutuyoruz.
      if (!aiFull.busy && !aiFull.data) startFullAnalysisQuiz();
    });
  }, [aiFull.busy, aiFull.data, startFullAnalysisQuiz]);

  const aiAutoRef = useRef('');
  useEffect(() => {
    if (!p) return;
    // `?view=analysis`: KOŞAN ya da HAZIR analize götürür — yeni analiz
    // başlatmaz (Qor balonundaki bildirim bunu kullanır).
    if (searchParams.get('view') === 'analysis') setTab('premium');
    if (searchParams.get('ai') === '1' && aiAutoRef.current !== p.id) {
      aiAutoRef.current = p.id;
      setTab('premium');
      startFullAnalysisQuiz();
    }
  }, [p, searchParams, startFullAnalysisQuiz]);

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

  // Let the chat bubble read & comment on the product the user is viewing. The
  // structured meta drives the page-aware greeting + tells the chat to ground
  // answers on THIS product (its Qor specs/price) before anything else.
  usePageContext(
    p ? [
      `${lang === 'tr' ? 'Ürün' : 'Product'}: ${displayProductName(p, lang) || cleanProductName(p.name)}`,
      p.brand ? `${lang === 'tr' ? 'Marka' : 'Brand'}: ${p.brand}` : '',
      p.category ? `${lang === 'tr' ? 'Kategori' : 'Category'}: ${p.category}` : '',
      Number(p.techScore) ? `Qor AI techScore: ${Math.round(p.techScore)}/100` : '',
      p.keySpecsText || '',
    ].filter(Boolean).join('\n') : '',
    p ? {
      kind: 'product',
      title: displayProductName(p, lang) || cleanProductName(p.name),
      productIds: [p.id],
      category: p.category || '',
    } : null,
  );

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
  // dictReady degisince sozluk dolar ve bricks YENIDEN uretilir (render'i
  // tetikleyen state zaten dictReady).
  const bricks = mergeSpecBricks(p, t('pd.keySpecs'), t('pd.allSpecs'), lang, dictReady ? specDictCache() : null);
  const displayName = localizedProductName(p, lang);

  // Hero key specs: show only real catalog specs, ranked by buyer importance.
  // Metadata such as category, brand, model name and Qor scores belongs outside
  // this grid.
  const heroSpecs = (() => {
    const candidates = [];
    const seen = new Set();
    const selfConcept = CATEGORY_SELF_CONCEPT[String(p.category || '').toLowerCase()] || '';
    const rankFor = (label, value, fallback = 999) => {
      const text = `${label} ${value}`;
      const hit = HERO_SPEC_PRIORITY.find((r) => r.re.test(text));
      return hit ? hit.rank : fallback;
    };
    const iconFor = (label, value, fallback = '•') => {
      const concept = heroSpecConcept(label, value);
      if (CONCEPT_ICON[concept]) return CONCEPT_ICON[concept];
      const text = `${label} ${value}`;
      const hit = HERO_SPEC_PRIORITY.find((r) => r.re.test(text));
      return hit?.icon || fallback;
    };
    const push = (s, fallbackRank = 999) => {
      const label = String(s.label || '').trim();
      const value = String(s.value || '').trim();
      if (!label || !value) return;
      if (isHiddenSpec(label, value)) return;
      if (/sponsor|reklam|advert|affiliate/i.test(`${label} ${value}`)) return;
      if (/^(brand|marka|category|kategori|model|qor|tech score|teknik skor)$/i.test(label)) return;
      // Dedup strategy depends on whether the spec is the product's "self"
      // concept (see CATEGORY_SELF_CONCEPT). For a laptop, cpu/ram/gpu are single
      // headline attributes, so collapse by concept — one CPU row, not its
      // clock/brand/cores as six rows, and the triple "24 GB RAM / Bellek (RAM) /
      // Mevcut Bellek Düzeni" becomes one. For a RAM stick, 'ram' IS the product,
      // so keep its distinct facets (16 GB, 5600 MT/s, DDR5, SO DIMM) by deduping
      // on concept+value — only identical values merge (capacity "16 GB" and
      // count "1×16 GB" → one row). Unrecognised specs fall back to a label key.
      const baseConcept = heroSpecConcept(label, value)
        || `lbl:${normHeroSpecText(label).replace(/[^a-z0-9]+/g, '_')}`;
      const sig = baseConcept === selfConcept
        ? `${baseConcept}|${heroValueSig(value)}`
        : baseConcept;
      if (seen.has(sig)) return;
      seen.add(sig);
      candidates.push({
        ...s,
        // Kavram ikonu HER ZAMAN önce gelir. Katalog satırları `sectionIcon`
        // ile geliyordu: aynı bölümdeki tüm özellikler aynı ikonu alıyor,
        // ızgarada üç dört kez aynı emoji görünüyordu.
        icon: iconFor(label, value, s.icon && s.icon !== '•' ? s.icon : sectionIcon(label)),
        label,
        value,
        concept: baseConcept,
        order: candidates.length,
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
      // bricks satirlari ortak modulden ZATEN yerellestirilmis geliyor;
      // ikinci bir ceviri katmani metni bozardi.
      const value = String(v).split(/\r?\n/)[0].trim();
      const label = String(k).replace(/\s*:\s*$/, '');
      const compact = value.length <= 34 && label.length <= 34;
      const informative = /\d/.test(value) || !/^(yes|no|var|yok|evet|hayır|hayir|true|false)$/i.test(value) || candidates.length < 8;
      if (compact && informative) {
        push({ key: k, icon: sectionIcon(k), value, label });
      }
    });
    // Order by the category's concept sequence first (storage→ram→cpu→… for a
    // laptop), then by the generic priority, then by insertion order so the
    // curated chips win ties over raw catalog rows.
    const catOrder = CATEGORY_SPEC_ORDER[String(p.category || '').toLowerCase()] || CATEGORY_SPEC_ORDER.default;
    const conceptRank = (concept) => {
      const i = catOrder.indexOf(concept);
      return i >= 0 ? i : 100;
    };
    // Son adım: ızgarada AYNI ikon iki kez görünmesin. Kavram ikonu zaten
    // benzersiz; geriye kalan çakışmalar (jenerik kural ikonları) sırayla
    // kullanılmamış bir yedek ikona kaydırılır.
    const usedIcons = new Set();
    const uniqueIcon = (icon) => {
      if (icon && icon !== '•' && !usedIcons.has(icon)) { usedIcons.add(icon); return icon; }
      const spare = SPARE_ICONS.find((s) => !usedIcons.has(s));
      if (spare) { usedIcons.add(spare); return spare; }
      return icon || '•';
    };
    return candidates
      .sort((a, b) => (conceptRank(a.concept) - conceptRank(b.concept))
        || (a.rank - b.rank)
        || (a.order - b.order))
      .slice(0, 10)
      .map(({ rank, concept, order, ...rest }) => ({ ...rest, icon: uniqueIcon(rest.icon) }));
  })();

  const tech = Number(p.techScore) || 0;
  const showMatchScore = hasProfileMatch(user);
  const match = showMatchScore ? calculateProfileMatchScore(user, p) : 0;
  const offer = bestOfferForLang(offers, p, lang);
  const hasExactPrice = Boolean(offer?.hasExactPrice);
  const price = hasExactPrice ? Number(offer?.price) || 0 : 0;
  const displayPrice = hasExactPrice ? formatOfferPrice(offer, lang) : '';
  const offerUrl = offerClickPath(offer, geoCountry);
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
              onClick={() => (window.history.length > 1 ? window.history.back() : null)}>
              <IconChevronLeft size={16} />
            </button>
            <Link to="/">{L('Home', 'Ana Sayfa')}</Link>
            <span aria-hidden="true">›</span>
            <Link to={categoryPath(p.category)}>{categoryLabel(p.category, lang)}</Link>
            <span aria-hidden="true">›</span>
            <b title={displayName}>{displayName}</b>
          </div>
          <div className="pd-crumbs-actions">
            <a
              className="pd-act-btn pd-act-yt"
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${displayName} ${lang === 'tr' ? 'inceleme' : 'review'}`)}`}
              target="_blank" rel="noopener"
              title={L('Watch video reviews', 'Video incelemeleri izle')}
              aria-label="YouTube">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.1 5 12 5 12 5s-6.1 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.9 19 12 19 12 19s6.1 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3Z" />
              </svg>
            </a>
            <button type="button"
              className={'pd-act-btn pd-act-fav' + (isFavorite(p.id) ? ' on' : '')}
              onClick={() => toggleFavorite(p.id)}
              title={isFavorite(p.id) ? L('In favorites', 'Favorilerde') : L('Add to favorites', 'Favorilere ekle')}
              aria-label={L('Favorite', 'Favori')}>
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
              <span>{inCompare ? L('In compare', 'Karşılaştırmada') : L('Compare', 'Karşılaştır')}</span>
            </button>
            {/* AI analizini baslatmanin tek yolu sayfanin cok asagisindaki
                sekmeydi; burada ilk ekranda duruyor.
                Ziyaretciye donuk analiz kapaliyken dugme HIC cizilmez —
                `useAiAccess` zaten durduruyor ama tiklanip "bu ozellik kapali"
                mesaji almak, dugmeyi hic gostermemekten kotu bir deneyim. */}
            {modeOn('userAi') && <AnalyzeButton busy={aiFull.busy} onClick={analizeBaslat} />}
            {/* Yayinlanmis analiz VARSA okumaya git. AnalyzeButton kullaniciya
                ozel bir analiz URETIR (quiz + Q Coin); bu ise hazir, yayinlanmis
                yaziyi ACAR. Ikisi ayri islerdir, o yuzden ayri butonlar. */}
            {/* Adreste dil oneki EKLENMEZ: BrowserRouter `basename` ile
                kuruluyor (main.jsx), yani ic linkler zaten kendi dil agacinda
                kaliyor; elle `/tr` eklemek `/tr/tr/...` uretirdi. */}
            {analizSlug && (
              <Link
                to={`/analiz/${analizSlug}`}
                className="pd-cmp-btn pd-analiz-btn"
                title={L('Read the published AI analysis', 'Yayınlanmış yapay zekâ analizini oku')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2Z" />
                  <path d="M9 8h6M9 12h6" />
                </svg>
                <span>{L('Read analysis', 'Analizi oku')}</span>
              </Link>
            )}
          </div>
        </nav>

        <div className="prod-grid pd-product-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(360px,0.86fr) minmax(0,1.14fr)', gap: 32, alignItems: 'stretch' }}>
          {/* gallery */}
          <div className="prod-gallery">
            <div className="card pd-gallery-card">
              <button className="pd-photo" type="button"
                onClick={() => setLightbox(true)}
                aria-label={L('Open product image', 'Ürün görselini büyüt')}>
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
                  <b style={{ color: inkColor(techColor(tech)) }}>{bandLabel(tech, L)}</b>
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
                      <small>👤 {L('Your Match', 'Uyum Skorun')}</small>
                      <b style={{ color: inkColor('var(--score-average)') }}>{bandLabel(match, L)}</b>
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
            // Fiyatin ulkesi TEK KAYNAKTAN: ziyaretcinin baglandigi ulke.
            // Secici kaldirildi (2026-09-02) — Amazon linki de ayni ulkenin
            // vitrinine gider, dolayisiyla sayfada tek bir pazar konusuluyor.
            const sel = String(geoCountry || 'US').toUpperCase();
            const amazonUrl = amazonUrlForProduct(p, sel);
            // Liste mantigi + gorunumu PAYLASILAN bilesende (components/OfferList.jsx):
            // urun sayfasi ve karsilastirma sayfasi AYNI kodu kullanir.
            const priceRows = sortedOffers(offers, sel);
            if (!amazonUrl && priceRows.length === 0) return null;
            return (
              <section className="pd-block">
                <div className="pd-prices-head">
                  <h2 className="pd-block-title pd-block-title-inline">{L('Prices', 'Fiyatlar')}</h2>
                </div>
                <OfferList
                  offers={offers}
                  country={sel}
                  lang={lang}
                  geoCountry={geoCountry}
                  amazonHref={amazonUrl ? amazonGoPath(p, sel) : ''}
                />
              </section>
            );
          })()}

          {variants.length > 0 && (() => {
            const diffKinds = pickVariantDiffKinds([p, ...variants]);
            return (
              <section className="pd-block">
                <h2 className="pd-block-title">{L('Variants', 'Varyantlar')}</h2>
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

          <section className="pd-block" ref={aiSekmeRef}>
            {/* AI sekmesi ziyaretciye donuk analiz kapaliyken cizilmez. Tek
                sekme kalinca sekme cubugunun kendisi de anlamsizlasiyor —
                ozellikler dogrudan govdede gosteriliyor. */}
            {modeOn('userAi') && (
              <div className="pd-tabs2">
                <button className={tab === 'specs' ? 'on' : ''} onClick={() => setTab('specs')}>{t('pd.tabSpecs')}</button>
                {/* Analiz KOSARKEN etiketin sag ustunde donen halka — bkz.
                    Compare.jsx'teki ayni not. */}
                <button className={tab === 'premium' ? 'on' : ''} onClick={() => setTab('premium')}>
                  <span className="tab-lbl">
                    {t('pd.tabAi')}
                    {aiFull.busy && <i className="tab-spin" role="status" aria-live="polite"
                      aria-label={L('Analysis running', 'Analiz sürüyor')} />}
                  </span>
                </button>
              </div>
            )}
            <div className="pd-tab-body">
              {/* AI sekmesi yokken ozellikler KOSULSUZ cizilir: `tab` durumu
                  eski bir `?ai=` derin linkinden 'premium'da kalmis olabilir ve
                  o durumda govde bombos gorunurdu. */}
              {(tab === 'specs' || !modeOn('userAi')) && (
                <div className="fade-up">
                  {p.description && <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6, marginBottom: 16 }}>{p.description}</p>}
                  {bricks.length > 0 ? (
                    <div className="pd-bricks">
                      {bricks.map((b, i) => <SpecBrick key={i} brick={b} lang={lang} />)}
                    </div>
                  ) : (
                    !p.description && <div className="card pad muted">{t('pd.noSpecs')}</div>
                  )}
                </div>
              )}
              {tab === 'premium' && modeOn('userAi') && (
                /* KENDI Suspense siniri: tembel AI agaci yuklenirken App.jsx'teki
                   rota siniri devreye girseydi TUM urun sayfasi spinner'a
                   donerdi. Yer tutucu sekmenin kendi alani kadar. */
                <Suspense fallback={<div className="pd-ai-grid"><div className="pd-ai-intro"><div className="spinner" /></div></div>}>
                <div className="fade-up pd-ai-grid">
                  {/* Üst çıkış çubuğu — akıştan çıkmak için raporun en altına
                      inmek gerekmesin (diğer analiz akışlarıyla aynı). */}
                  {(aiFull.data || aiFull.busy || aiFull.phase === 'quiz' || aiFull.phase === 'error') && (
                    <AnalysisExitBar
                      lang={lang}
                      onExit={exitProductAnalysis}
                      busy={aiFull.busy}
                      context={displayName}
                      label={aiFull.data
                        ? L('New analysis', 'Yeni analiz')
                        : L('Cancel analysis', 'Analizden çık')}
                    />
                  )}
                  {aiFull.data ? (
                    <div className="pd-ai-report">
                      {aiFull.savedAt && (
                        <div className="pd-ai-cached">
                          <span>
                            {L('Saved analysis', 'Kayıtlı analiz')}
                            {savedAtLabel(aiFull.savedAt, lang) ? ` · ${savedAtLabel(aiFull.savedAt, lang)}` : ''}
                          </span>
                          <button type="button" className="btn btn-ghost" onClick={() => startFullAnalysisQuiz(true)} disabled={aiFull.busy}>
                            {L('Re-analyze', 'Yeniden analiz et')}
                          </button>
                        </div>
                      )}
                      <AiAnalysisView kind="productFull" data={aiFull.data} lang={lang}
                        priceInfo={priceForCountry(p, geoCountry)} />
                    </div>
                  ) : aiFull.phase === 'quiz' && aiFull.questions.length > 0 ? (
                    <QuizFlow
                      questions={aiFull.questions}
                      busy={aiFull.busy}
                      title={L('Tune the analysis', 'Analizi kişiselleştir')}
                      subtitle={L(
                        'Answer these before the report so the match score reflects your real use.',
                        'Rapor öncesi cevapla; uyum puanı gerçek kullanımına göre hesaplansın.',
                      )}
                      onSubmit={runFullAnalysis}
                    />
                  ) : aiFull.phase === 'error' ? (
                    <div className="pd-ai-intro">
                      <button type="button" className="btn btn-grad btn-shine pd-ai-run"
                        onClick={() => runFullAnalysis(aiFull.answers || [])} disabled={aiFull.busy}>
                        {L('Retry analysis', 'Analizi tekrar dene')}
                      </button>
                      {aiFull.notice && <div className="pd-ai-notice">{aiFull.notice}</div>}
                    </div>
                  ) : (
                    <div className="pd-ai-intro">
                      {aiFull.busy ? (
                        aiFull.phase === 'analyzing'
                          ? <AiWorkboard lang={lang} mode="product" stage={aiFull.stage} startedAt={aiFull.phaseStartedAt} />
                          : <AiWorkboard lang={lang} mode="quizProduct" startedAt={aiFull.phaseStartedAt} />
                      ) : (
                        <button type="button" className="btn btn-grad btn-shine pd-ai-run"
                          onClick={() => startFullAnalysisQuiz()} disabled={aiFull.checking}>
                          {aiFull.checking
                            ? L('Checking balance…', 'Bakiye kontrol ediliyor…')
                            : L('Start analysis', 'Analizi başlat')}
                        </button>
                      )}
                      {aiFull.notice && (
                        <div className="pd-ai-notice">
                          {aiFull.notice}
                          {aiFull.noticeCode === 'INSUFFICIENT_QOR_COINS' && (
                            <>
                              {' '}
                              <Link to="/premium" className="pd-ai-notice-link">
                                {L('See Premium', 'Premium’a bak')}
                              </Link>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </Suspense>
              )}
            </div>
          </section>

          {/* Yorumlar ekranin ALTINDA: yer tutucu yuksekligi olan bos bir kutu,
              boylece gec gelmesi bir kayma uretmez. */}
          <Suspense fallback={<div style={{ minHeight: 220 }} />}>
            <Reviews productId={p.id} productName={displayName} lang={lang} />
          </Suspense>
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
                <span>{L('Product images', 'Ürün görselleri')} · {activeImg + 1}/{images.length}</span>
              </div>
              <button className="pd-lightbox-close" type="button"
                aria-label={L('Close image', 'Görseli kapat')}
                onClick={() => setLightbox(false)}>
                <IconX size={16} width={2.4} />
              </button>
            </header>
            <div className="pd-lightbox-body">
              {images.length > 1 && (
                <button className="pd-lightbox-nav pd-lightbox-prev" type="button"
                  aria-label={L('Previous image', 'Önceki görsel')}
                  onClick={() => stepImage(-1)}>
                  <IconChevronLeft size={22} width={2.4} />
                </button>
              )}
              <div className="pd-lightbox-img">
                <ProductImg src={images[activeImg]} alt={displayName} size="full" eager />
              </div>
              {images.length > 1 && (
                <button className="pd-lightbox-nav pd-lightbox-next" type="button"
                  aria-label={L('Next image', 'Sonraki görsel')}
                  onClick={() => stepImage(1)}>
                  <IconChevronRight size={22} width={2.4} />
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
        <span>{L('Loading price history...', 'Fiyat geçmişi yükleniyor...')}</span>
      </div>
    );
  }

  if (daily.length < 2) {
    return (
      <div className="pd-price-history pd-price-history-empty">
        <b>{L('Price history', 'Fiyat geçmişi')}</b>
        <span>{L(
          'Not enough fresh snapshots yet for this delivery market. The chart appears automatically as tracked offers update.',
          'Bu teslimat pazarı için henüz yeterli güncel snapshot yok. Takip edilen teklifler güncellendikçe grafik otomatik oluşur.',
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
          <b>{L('Price history', 'Fiyat geçmişi')}</b>
          <span>{country ? country.toUpperCase() : L('Selected market', 'Seçili pazar')}</span>
        </div>
        <div className="pd-price-history-now">
          <strong>{fmt(last.price, last.currency)}</strong>
          <small className={trendClass}>
            {diff === 0 ? '0%' : `${diff > 0 ? '+' : ''}${diffPct.toFixed(1)}%`}
          </small>
        </div>
      </div>
      <svg className="pd-price-history-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={L('Price history chart', 'Fiyat geçmişi grafiği')}>
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
        <span>{daily.length} {L('snapshots', 'snapshot')}</span>
        <span>{fmtDate(last.date)} · {last.store || L('latest', 'son')}</span>
      </div>
    </div>
  );
}

// MOBILDE KATLAMA DENENDI VE GERI ALINDI (2026-08-17, kullanici karari).
// Bloklar mobilde `<details>` ile kapali basliyordu (sayfa 16.842 -> 6.434 px);
// kullanici bunu ISTEMEDI, ozellikler acik gorunmeli. Tekrar onerme.
function SpecBrick({ brick, lang }) {
  const rows = brick.rows.filter(([, v]) => v != null && String(v).trim() !== '');
  if (!rows.length) return null;
  return (
    <div className="pd-brick">
      {/* Baslik + satirlar ortak modulden yerellestirilmis geliyor. */}
      <div className="pd-brick-head"><span>{brick.icon}</span> {brick.title}</div>
      <div className="pd-brick-body">
        {rows.map(([k, v]) => {
          const s = String(v).trim();
          const label = String(k);
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
