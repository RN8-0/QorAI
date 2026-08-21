import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconX } from '../components/GlyphIcons.jsx';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getProduct, popularProducts, productMatchesRequestedCategory, resolveProduct, searchProducts } from '../lib/typesense';
import { useCompare, COMPARE_MAX, setCompareList } from '../lib/compare';
import OfferList from '../components/OfferList.jsx';
import { fetchProductOffers } from '../lib/offers';
import { getSavedComparisonAnalysis, saveComparisonAnalysisHistory, saveComparisonHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { catMeta, categoryLabel, priceForCountry, formatPriceAmount, amazonUrlForProduct, amazonGoPath, scoreClass, scoreLabel } from '../lib/format';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import AnalyzeButton, { analizeKaydir } from '../components/AnalyzeButton.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import { useSeo, hreflangAlternates } from '../lib/seo';
import { canonicalSpecKey } from '../lib/specCanonical';
// SPEC CEVIRISININ TEK KAYNAGI (admin paneliyle AYNI dosya) — bkz. lib/specI18n.js
import { localizeProduct } from '../lib/specI18n';
import { ensureSpecDictionary, specDictCache } from '../lib/specDictionary';
import { rowWinners } from '../lib/specDirection';
import { productPath, parseComparePair } from '../lib/routes';
import { askQorAiGrounded, askQorAiRaw } from '../lib/ai';
import { generateCompareQuiz } from '../lib/linkAnalysis';
import { getRecentProducts } from '../lib/recentViewed';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import {
  clearCompareAnalysisJob, compareJobKey, runCompareAnalysisJob, startCompareAnalysisJob,
  subscribeCompareAnalysisJob,
} from '../lib/compareAnalysisJobs';
import { useGeoCountry } from '../lib/geo';
import AiAnalysisView, {
  buildCompareProductPrompt,
  buildCompareResearchPrompt,
  buildCompareVerdictPrompt,
  parseAiJson,
} from '../components/AiAnalysis.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import AiWorkboard from '../components/AiWorkboard.jsx';
import AnalysisExitBar from '../components/AnalysisExitBar.jsx';
import AmazonLogo from '../components/AmazonLogo.jsx';
import { calculateProfileMatchScore, hasProfileMatch } from '../lib/profileMatch';
import {
  isDisplayableSpec, isHiddenSpec, localizedSpecLabel, localizedSpecValue, sourceSpecMaps,
} from '../lib/specDisplay';
import { displayProductName } from '../lib/productNames';
import { usePageContext } from '../lib/pageContext';
import CompareReviews from '../components/CompareReviews.jsx';
import './Compare.css';
// Ortak AI rapor govdesi (AiReportView) 'la-*' siniflarini kullanir. CSS'i
// PAYLASILAN bilesen degil SAYFA import eder: boylece stil bu sayfanin tembel
// parcasinda kalir, giris paketini (her sayfada indirilen CSS) sismez.
import './LinkAnalysis.css';

// Source-aware spec flattening for the compare table. The old path ran every
// product through canonicalizeSpecMaps, which overlaid BOTH the Turkish `specs`
// AND the English `specsEn` into one map — so every niche row appeared TWICE (once
// per language) — and it read the post-processed `specSections`, whose labels are
// half-translated at scrape time ("Bluetooth Specificationsi", "Body Malzemesi",
// "Sanal Core"). Instead we pick ONE clean, complete source per UI language:
//   • Turkish view → the AUTHENTIC source maps of a Turkish product (mirrors the
//     detail page's mergeSpecBricks) — clean Turkish labels.
//   • English view → the pre-translated `specsEn` map — already clean, complete
//     English (the detail page can lean on multiLangSpecs for this; compare's
//     lighter localizedSpecLabel would otherwise leak folded Turkish like
//     "Islemci Modeli", so read the ready-made English directly).
// Either way a single language source removes the leaked words AND the duplication.
function pickSpecMaps(p, lang, dict) {
  // ── TEK KAYNAK ──────────────────────────────────────────────────────────
  // Eskiden EN gorunumu `specsEn` okuyordu; o alan kayitlarin yalnizca
  // %19'unda dolu (olculdu: scripts/_spec_alan_kapsam.mjs). Kalan %81 ham
  // haritaya dusuyor ve localizedSpecLabel Turkce etiketi ASCII'ye katlayip
  // "Agir Cekim Kayit Secenekleri" basiyordu. Artik admin paneliyle AYNI
  // fonksiyon (localizeProduct) kullaniliyor: etiket + deger + bolum basligi
  // panelde ne ise sitede de o.
  const code = String(lang || 'en').slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
  const pm = localizeProduct(p, code, { dict: dict || null });
  return {
    keySpecs: pm.keySpecs || {},
    sections: pm.sections || {},
    flat: pm.flat || {},
    isHighlightsTitle: pm.isHighlightsTitle,
  };
}
function cleanMultiline(v) {
  return String(v == null ? '' : v)
    .replace(/\r/g, '\n')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function flatSpecs(p, lang, dict) {
  const { keySpecs, sections, flat } = pickSpecMaps(p, lang, dict);
  const out = {};
  const seen = new Set();
  const put = (k, v) => {
    const key = String(k || '').trim();
    if (!key) return;
    const val = cleanMultiline(v);
    if (!val) return;
    if (isHiddenSpec(key, val) || !isDisplayableSpec(key, val)) return;
    const sig = key.toLowerCase();
    if (seen.has(sig)) return; // same raw label seen already (e.g. a Highlights echo)
    seen.add(sig);
    // ── SATIR KIMLIGI = YERELLESTIRILMIS ETIKET (2026-08-18) ──────────────
    // ONCE `canonicalSpecKey(key, val)` satir kimligiydi. O anahtar FARKLI
    // etiketleri AYNI kovaya katliyor ("Yenileme Hizi (Gercek)" +
    // "Yenileme Hizi (Yazilim)" -> "Refresh rate") ve `if (!(ck in out))`
    // ilk yazani tutup GERISINI ATIYORDU. Sonuc: karsilastirma tablosu urun
    // sayfasindan AZ satir gosteriyordu — OLCULDU (scripts/_cmp_eksik.mjs):
    //   akilli telefon admin 125 satir -> tabloda 93  (33 satir kayip)
    //   dizustu        admin  54 satir -> tabloda 44  (11 satir kayip)
    //
    // Kanonik anahtar HIZALAMA icin gerekliydi: iki urunun ayni spec'i farkli
    // etiketle gelebiliyordu. Artik gelmiyor — iki urun de AYNI sozlukten
    // (admin/js/spec_i18n.js) geciyor, dolayisiyla ayni spec ayni etiketi
    // aliyor. Hizalama etikete gore yapilabilir ve HICBIR SATIR KAYBOLMAZ.
    // Kanonik anahtar hala tasiniyor: KAZANAN YONU (rowWinners) dile bagli
    // olmayan o anahtardan okunuyor.
    if (!(sig in out)) out[sig] = { label: key, value: val, ck: canonicalSpecKey(key, val) };
  };
  Object.entries(keySpecs).forEach(([k, v]) => put(k, v));
  Object.values(sections).forEach((body) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      Object.entries(body).forEach(([k, v]) => put(k, v));
    }
  });
  Object.entries(flat).forEach(([k, v]) => put(k, v));
  return out;
}


function formatOffer(offer, lang) {
  if (!offer || !Number(offer.price)) return '';
  try {
    return new Intl.NumberFormat(lang, {
      style: 'currency',
      currency: offer.currency || 'USD',
      maximumFractionDigits: 0,
    }).format(offer.price);
  } catch {
    return `${offer.currency || 'USD'} ${Number(offer.price).toLocaleString(lang, { maximumFractionDigits: 0 })}`;
  }
}

function splitSpecValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—') return [];
  let lines = raw
    .split(/\r?\n|[•·]\s*|;\s*/g)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (lines.length <= 1 && raw.length > 100 && /(camera|kamera|lens|zoom|ois|hdr|video|mp|optical|optik|digital|dijital|telephoto|telefoto|wide|geniş|f\/|f\d)/i.test(raw)) {
    lines = raw
      .replace(/\s+(?=(?:Yes|No|Var|Yok|OIS|HDR|LED|Laser|Lazer|Video|Optical|Optik|Digital|Dijital|Automatic|Otomatik|Hybrid|Hibrit|Phase|Faz|Telephoto|Telefoto|Periscope|Periskop|Ultra Wide|Ultra Geniş|Extra Wide|Ekstra Geniş|Wide Angle|Geniş Açı|Zoom|f\/\d|F\d|[0-9]+(?:\.[0-9]+)?\s*MP)\b)/g, '\n')
      .split(/\r?\n/g)
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }
  return lines.length ? lines : [raw];
}

function SpecValue({ value, lang }) {
  // Deger ortak modulden yerellestirilmis geliyor; ikinci ceviri katmani yok.
  const lines = splitSpecValue(value);
  if (!lines.length) return <span>—</span>;
  if (lines.length === 1) return <span>{lines[0]}</span>;
  return (
    <ul className="cmp-spec-list">
      {lines.map((line, i) => <li key={`${line}-${i}`}>{line}</li>)}
    </ul>
  );
}

function PlainAiText({ text }) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, i) => <p key={i}>{part}</p>);
}

function fallbackCompareQuiz(lang) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const rows = code === 'tr'
    ? [
        ['Bu ürünler arasında ana kullanım senaryon hangisi?', ['Günlük ve uzun ömürlü kullanım', 'Yoğun iş/üretkenlik', 'Performans odaklı kullanım', 'En risksiz seçim']],
        ['Karar verirken hangi fark daha önemli?', ['Ham performans farkı', 'Uyumluluk ve stabilite', 'Fiyat/performans dengesi', 'Marka/servis güveni']],
        ['Eksik veya zayıf bir özellik seni ne kadar etkiler?', ['Çok etkiler, sorun istemem', 'Kullanımıma bağlı', 'Güçlü taraflar telafi eder', 'Fark etmem muhtemel değil']],
        ['Topluluk yorumları seçiminde nasıl rol oynasın?', ['Belirleyici olsun', 'Dengeli değerlendirilsin', 'Teknik specs daha önemli', 'Az etkilesin']],
        ['Satın alma zamanında ne kadar esneksin?', ['Hemen almalıyım', 'İndirim beklerim', 'Yeni model beklerim', 'Fiyat sabitse alırım']],
        ['Uzun vadede en çok neyi önemserdin?', ['Performansın eskimemesi', 'Garanti/servis rahatlığı', 'Düşük sorun riski', 'Yükseltme/uyumluluk']],
        ['İki ürün yakın çıkarsa hangisi kazansın?', ['Daha güçlü olan', 'Daha güvenilir olan', 'Daha iyi fiyatlı olan', 'Daha yeni/gelecek odaklı olan']],
        ['Yanlış seçim yaparsan en büyük problem ne olur?', ['Para boşa gider', 'Cihazıma/sisteme uymaz', 'Beklediğim performansı vermez', 'İade/değişim uğraştırır']],
      ]
    : [
        ['What is your main use case between these products?', ['Everyday long-term use', 'Heavy work/productivity', 'Performance-focused use', 'Lowest-risk choice']],
        ['Which difference matters most?', ['Raw performance', 'Compatibility and stability', 'Value for money', 'Brand/service trust']],
        ['How much would a weak feature affect you?', ['A lot, I want no issues', 'Depends on the feature', 'Strengths can compensate', 'Probably not much']],
        ['How should community feedback influence the choice?', ['It should be decisive', 'Balanced with specs', 'Specs matter more', 'Only a little']],
        ['How flexible is your purchase timing?', ['I need it now', 'I can wait for a discount', 'I can wait for a successor', 'I buy if price is stable']],
        ['What matters most long term?', ['Performance aging well', 'Warranty/service comfort', 'Low issue risk', 'Upgrade/compatibility']],
        ['If the products are close, what wins?', ['More power', 'More reliability', 'Better price', 'Newer/future-proof design']],
        ['If you choose wrong, what is the biggest problem?', ['Wasted money', 'It will not fit my device/system', 'It will underperform', 'Returns will be annoying']],
      ];
  return rows.map(([text, options], i) => ({ id: `compare-fallback-${i}`, text, options }));
}


function formatSavedAt(at, lang) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const loc = lang === 'tr' ? 'tr' : 'en';
  try { return d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d.toISOString().slice(0, 10); }
}

// Run an async mapper over items with a bounded number of in-flight calls, so a
// many-product comparison doesn't fire dozens of AI requests at the proxy at
// once. Preserves input order in the results array.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export default function Compare() {
  const { t, lang } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const [tab, setTab] = useState('specs');
  // Qor balonundaki bildirim `?view=analysis` ile gelir: karşılaştırma sayfası
  // açılır açılmaz ANALİZ sekmesi seçilir (kullanıcı sekme aramaz).
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('view') === 'analysis') setTab('ai');
  }, [searchParams]);
  const { user } = useAuth();
  const guardAiAccess = useAiAccess(lang);
  // Deep links / crawlers can land on /compare/<a>-vs-<b>. Recover the two ids
  // from the URL and seed the (otherwise localStorage-driven) compare pool so the
  // comparison renders for a fresh visitor instead of bouncing to home.
  const routeParams = useParams();
  // parseComparePair artik ID degil JETON dondurur ({id, slug, slugKisa}) —
  // adresten id'ler kaldirildigi icin (2026-08-22) slug'i urune cozmek gerekiyor.
  // Cozum resolveProduct ile yapilir: once tam slug denenir, sonra id, sonra
  // kisa slug. "Sondaki 15 karakter id'dir" varsayimi TEK BASINA YANLIS.
  const pairTokens = useMemo(() => parseComparePair(routeParams.pair), [routeParams.pair]);
  const [resolvedPairIds, setResolvedPairIds] = useState([]);
  const pairKey = routeParams.pair || '';
  useEffect(() => {
    let live = true;
    if (pairTokens.length !== 2) { setResolvedPairIds([]); return undefined; }
    // Jeton zaten id tasiyorsa (eski bicimli adres) ag istegi YOK.
    if (pairTokens.every((t) => t.id && !t.slug)) {
      setResolvedPairIds(pairTokens.map((t) => t.id));
      return undefined;
    }
    Promise.all(pairTokens.map((t) => resolveProduct(t).catch(() => null)))
      .then((list) => {
        if (!live) return;
        const ids = list.map((p, i) => (p && p.id) || pairTokens[i].id || '').filter(Boolean);
        setResolvedPairIds(ids.length === 2 && ids[0] !== ids[1] ? ids : []);
      });
    return () => { live = false; };
  }, [pairKey]); // eslint-disable-line
  const pairIds = resolvedPairIds;
  // Qor balonundaki "analiz hazır" bildirimi `/compare?ids=a,b&view=analysis`
  // ile gelir. Havuz o sırada boşaltılmış olabilir — id'ler adreste taşındığı
  // için sayfa yine de AÇILIR (eskiden ana sayfaya atıyordu, ölçüldü).
  const queryIds = useMemo(() => {
    const raw = searchParams.get('ids') || '';
    return raw.split(',').map((x) => x.trim()).filter(Boolean).slice(0, COMPARE_MAX);
  }, [searchParams]);
  const urlPairIds = pairIds.length === 2 ? pairIds : queryIds;
  useEffect(() => {
    if (urlPairIds.length >= 2) setCompareList(urlPairIds);
  }, [urlPairIds.join(',')]); // eslint-disable-line
  const comparePathname = routeParams.pair ? `/compare/${routeParams.pair}` : '/compare';
  useSeo({
    title: `${t('cmp.title')} — Qor AI`,
    description: L('Compare products side by side — add as many as you like.', 'Ürünleri yan yana karşılaştır — istediğin kadar ekle.'),
    path: comparePathname,
    htmlLang: lang,
    alternates: hreflangAlternates(comparePathname),
  });
  const { ids: poolIds, remove, clear, add } = useCompare();
  // Derin linkte URL TEK DOĞRULUK KAYNAĞIDIR. Havuz (localStorage) seeding
  // effect'iyle dolar ama o effect bir tick sonra etki eder; ilk render'da
  // URL'deki çifti doğrudan kullanmak, sayfanın localStorage'a hiç bağlı
  // olmadan ilk karede doğru ürünleri çekmesini garantiler.
  const ids = useMemo(
    () => (urlPairIds.length >= 2 && poolIds.length === 0 ? urlPairIds : poolIds),
    [urlPairIds.join(','), poolIds.join(',')], // eslint-disable-line
  );
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [picking, setPicking] = useState(false);
  const [popular, setPopular] = useState([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [popularLimit, setPopularLimit] = useState(6);
  const [pickError, setPickError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiNotice, setAiNotice] = useState('');
  const [aiNoticeCode, setAiNoticeCode] = useState('');
  const [aiChecking, setAiChecking] = useState(false);
  const [aiPhase, setAiPhase] = useState('idle');
  const [aiStage, setAiStage] = useState(null);
  const [aiPhaseStartedAt, setAiPhaseStartedAt] = useState(null);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [aiAnswers, setAiAnswers] = useState([]);
  const [aiSavedAt, setAiSavedAt] = useState('');
  const geoCountry = useGeoCountry();
  const boxRef = useRef(null);
  const cmpRef = useRef(null);
  const fheadRef = useRef(null);
  const compareCategory = products[0]?.category || '';
  const showMatchScore = hasProfileMatch(user);
  const ytQuery = products.map((p) => displayProductName(p, lang)).filter(Boolean).join(' vs ');
  const ytUrl = ytQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ytQuery} ${lang === 'tr' ? 'karşılaştırma' : 'comparison'}`)}`
    : '';

  // Let the chat bubble read & comment on the comparison.
  usePageContext(
    ytQuery
      ? `${lang === 'tr' ? 'Karşılaştırma' : 'Comparison'}: ${products.map((p) => `${displayProductName(p, lang) || p.name}${Number(p.techScore) ? ` (${Math.round(p.techScore)}/100)` : ''}`).join(' vs ')}`
      : (lang === 'tr' ? 'Karşılaştırma sayfası' : 'Compare page'),
    products.length
      ? { kind: 'compare', title: ytQuery, productIds: products.map((p) => p.id).filter(Boolean) }
      : { kind: 'compare', title: '' },
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all(ids.map((id) => getProduct(id).catch(() => null)))
      .then((list) => {
        if (!live) return;
        const clean = list.filter(Boolean);
        const baseCategory = clean[0]?.category || '';
        const valid = baseCategory
          ? clean.filter((p) => String(p.category || '') === String(baseCategory)
            && productMatchesRequestedCategory(p, baseCategory))
          : clean;
        clean.filter((p) => !valid.some((v) => v.id === p.id)).forEach((p) => remove(p.id));
        setProducts(valid);
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [ids.join(',')]); // eslint-disable-line

  useEffect(() => {
    let live = true;
    setPopularLoading(true);
    const targetScore = products.length
      ? products.reduce((sum, p) => sum + (Number(p.techScore) || 0), 0) / products.length
      : 0;
    const poolLimit = Math.max(popularLimit + ids.length + 24, 24);
    popularProducts(poolLimit, { category: compareCategory })
      .then((list) => {
        if (!live) return;
        const ordered = targetScore > 0
          ? [...list].sort((a, b) => {
            const da = Math.abs((Number(a.techScore) || 0) - targetScore);
            const db = Math.abs((Number(b.techScore) || 0) - targetScore);
            return da - db || (Number(b.techScore) || 0) - (Number(a.techScore) || 0);
          })
          : list;
        setPopular(ordered);
      })
      .catch(() => {})
      .finally(() => { if (live) setPopularLoading(false); });
    return () => { live = false; };
  }, [popularLimit, compareCategory, ids.join(','), products.map((p) => p.techScore).join(',')]);

  useEffect(() => {
    if (products.length < 2) return;
    const tm = setTimeout(() => saveComparisonHistory(ids, products), 600);
    return () => clearTimeout(tm);
  }, [ids.join(','), products.length]); // eslint-disable-line

  // MAGAZA TEKLIFLERI — urun sayfasiyla AYNI kaynak (`fetchProductOffers`).
  // Karsilastirma sayfasi eskiden yalnizca katalog rollup fiyatini gosteriyordu
  // (tek kutuda "Bolgende fiyat yok" + Amazon arama linki); magaza listesi
  // burada HIC yoktu. Artik iki sayfa ayni veriyi ve ayni bileseni kullaniyor.
  const [offersById, setOffersById] = useState({});
  useEffect(() => {
    let live = true;
    if (!ids.length) { setOffersById({}); return undefined; }
    Promise.all(ids.map((id) => fetchProductOffers(id).then((o) => [id, o]).catch(() => [id, []])))
      .then((pairs) => { if (live) setOffersById(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [ids.join(',')]); // eslint-disable-line

  // Keep the product header cards, price cards and spec table scrolling together
  // horizontally so column N always lines up across all three rows — otherwise
  // the 4th+ product gets cut off in one row but not the others.
  useEffect(() => {
    const root = cmpRef.current;
    if (!root) return undefined;
    const scrollers = [...root.querySelectorAll('.cmp-hscroll')];
    if (scrollers.length < 2) return undefined;
    // Active-lock sync: whichever row the user is actually scrolling owns the
    // position; the scroll events the FOLLOWERS fire when we set their
    // scrollLeft are ignored for a short window. That's what stops the
    // "scroll it, it springs back" bug — previously a follower that couldn't
    // reach the same offset bounced its clamped value back onto the leader.
    let activeEl = null;
    let releaseTimer = 0;
    const onScroll = (e) => {
      const el = e.currentTarget;
      if (activeEl && activeEl !== el) return;
      activeEl = el;
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => { activeEl = null; }, 150);
      const x = el.scrollLeft;
      for (const s of scrollers) if (s !== el && s.scrollLeft !== x) s.scrollLeft = x;
    };
    scrollers.forEach((s) => s.addEventListener('scroll', onScroll, { passive: true }));
    return () => {
      clearTimeout(releaseTimer);
      scrollers.forEach((s) => s.removeEventListener('scroll', onScroll));
    };
  }, [products.length, tab, aiPhase]);

  // Floating product-name header: a compact bar that pins below the navbar once
  // the spec table's own header scrolls out of view, so you always know which
  // column is which. No inner scrollbox — the page scrolls normally; the bar
  // just mirrors the table's horizontal position (it shares cmp-hscroll sync).
  useEffect(() => {
    if (tab !== 'specs') return undefined;
    const fhead = fheadRef.current;
    const root = cmpRef.current;
    const wrap = root && root.querySelector('.cmp-table-wrap');
    if (!fhead || !wrap) return undefined;
    const onScroll = () => {
      const appbar = document.querySelector('.appbar');
      const top = appbar ? Math.max(0, Math.round(appbar.getBoundingClientRect().bottom)) : 56;
      const r = wrap.getBoundingClientRect();
      const show = r.top < top && r.bottom > top + 52;
      // Overlay the table box exactly (same left/width) so columns line up in
      // both the centered (few products) and scrolled (many) cases.
      fhead.style.top = `${top}px`;
      fhead.style.left = `${Math.round(r.left)}px`;
      fhead.style.width = `${Math.round(r.width)}px`;
      fhead.classList.toggle('show', show);
      if (show) fhead.scrollLeft = wrap.scrollLeft;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      fhead.classList.remove('show');
    };
  }, [tab, products.length]);

  // Size the comparison columns to the product count: with 2 products they fill
  // the width (wide cards, no big empty gap); as more are added they shrink to a
  // readable minimum and then scroll horizontally. One source of truth (CSS vars)
  // keeps the header cards, price cards and spec table all the same width.
  // Sütun genişliği kabın GERÇEK genişliğinden hesaplanır. Bu ölçüm TEK SEFERLİK
  // yapılamaz:
  //   • `useLayoutEffect` SPA içi gezinmede (karşılaştırmaya ikinci kez girmek,
  //     geçmişten açmak) düzen daha oturmadan koşuyordu; o anki `clientWidth`
  //     nihai değerden GENİŞ ölçülüyor, `--cmp-col` fazla büyük çıkıyor ve
  //     kartlar ekranı taşırıyordu (soldaki kart kesik, sağda boşluk).
  //   • Bağımlılık yalnız `products.length` idi; aynı sayıda ürünle tekrar
  //     girildiğinde effect HİÇ yeniden koşmuyor, bozuk değer kalıyordu.
  //   • Analiz bölümü sonradan yüklenince sayfa uzuyor, dikey kaydırma çubuğu
  //     çıkıyor ve kullanılabilir genişlik ~15px daralıyor — eski ölçüm bayat.
  // ResizeObserver kabın kutusu her değiştiğinde yeniden hesaplar; zamanlama
  // varsayımı kalmaz.
  useLayoutEffect(() => {
    const root = cmpRef.current;
    if (!root || products.length < 1) return undefined;
    const apply = () => {
      const scroller = root.querySelector('.cmp-product-scroll');
      const availW = (scroller ? scroller.clientWidth : root.clientWidth) || 0;
      if (!availW) return;
      const n = products.length;
      // TELEFONDA IKI URUN EKRANA SIGMALI. Eski esikler (labelW 116 + minCol
       // 200) 390 px'lik ekranda 116 + 2x200 = 516 px veriyordu, kap ise 358 px:
      // satir yatay kaydiriliyor ve SOLDAKI KART EKRANIN DISINDA kaliyordu
      // (kullanicinin ekran goruntusunde "msung Galaxy S23" diye kesik gorunen
      // kart tam olarak bu). Iki urun karsilastirmak en sik durum; ikisi de
      // gorunmeden karsilastirma zaten ise yaramiyor.
      //   390 px -> kap 358: label 88 + 2x135 = 358  ✓
      // Uc ve fazlasi hala kayar (kacinilmaz), ama iki urunde kaymaz.
      const dar = availW < 480;
      const labelW = dar ? 88 : availW < 680 ? 116 : 184;
      const minCol = dar ? 116 : availW < 680 ? 200 : 230;
      const col = Math.max(minCol, Math.floor((availW - labelW) / n));
      root.style.setProperty('--cmp-label', `${labelW}px`);
      root.style.setProperty('--cmp-col', `${col}px`);
    };
    apply();

    let ro = null;
    const scroller = root.querySelector('.cmp-product-scroll');
    if (typeof ResizeObserver !== 'undefined' && scroller) {
      ro = new ResizeObserver(() => apply());
      ro.observe(scroller);
    }
    // İlk boyanmadan sonra bir kez daha: ResizeObserver yoksa (eski tarayıcı)
    // ve düzen effect'ten sonra oturuyorsa yakalar.
    const raf = requestAnimationFrame(apply);
    window.addEventListener('resize', apply);
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [products.length, lang]);

  // ARKA PLANDA KOSAN IS -> BILESEN STATE'I (2026-08-08).
  // Eskiden burada her sey KOSULSUZ sifirlaniyordu; kullanici analiz koserken
  // baska sayfaya gecip dondugunde ilerleme tamamen kayboluyordu. Artik analiz
  // modul seviyesinde kosuyor (lib/compareAnalysisJobs) ve bilesen yalnizca
  // onun anlik goruntusunu ciziyor. Sifirlama SADECE karsilastirilan urun
  // kumesi degistiginde ve o kumeye ait koşan bir is YOKKEN yapilir.
  const myJobKey = compareJobKey(ids);
  // Akıştan çıkış: koşan işi bırak, panel baştaki "analizi başlat" hâline dönsün.
  function exitCompareAnalysis() {
    clearCompareAnalysisJob();
    setAiBusy(false);
    setAiText('');
    setAiNotice('');
    setAiPhase('idle');
    setAiQuestions([]);
    setAiAnswers([]);
    setAiSavedAt('');
  }
  useEffect(() => subscribeCompareAnalysisJob((job) => {
    if (job && job.key === myJobKey) {
      setAiPhase(job.phase === 'analyzing' || job.phase === 'quizLoading' ? job.phase : job.phase);
      setAiBusy(job.phase === 'quizLoading' || job.phase === 'analyzing');
      setAiStage(job.stage || null);
      setAiPhaseStartedAt(job.phaseStartedAt || job.startedAt || null);
      setAiQuestions(job.questions || []);
      setAiAnswers(job.answers || []);
      if (job.text) setAiText(job.text);
      if (job.phase === 'error') {
        // Yarıda kalan iş (sayfa yenilendi / süre doldu) başarısızlıktan
        // farklıdır: kullanıcı ne olduğunu bilmeli, ücret tekrar alınmaz.
        const interrupted = job.error === 'ANALYSIS_INTERRUPTED' || job.error === 'ANALYSIS_TIMEOUT';
        setAiNotice(interrupted
          ? L('The analysis was interrupted. Start it again — this run is free.',
            'Analiz yarıda kaldı. Tekrar başlat — bu deneme ücretsiz.')
          : L('AI analysis failed. Please try again.', 'AI analizi başarısız oldu. Tekrar dene.'));
      }
      return;
    }
    // Bu karsilastirmaya ait bir is yok: temiz baslangic.
    setAiBusy(false);
    setAiText('');
    setAiNotice('');
    setAiPhase('idle');
    setAiQuestions([]);
    setAiAnswers([]);
    setAiSavedAt('');
  }), [myJobKey]); // eslint-disable-line

  // Revisiting the same comparison shows the previously saved analysis from the
  // user's PB account — no re-run, no second charge. A "re-analyze" button still
  // lets them refresh it. Only fills an idle slot so it never clobbers a run.
  useEffect(() => {
    let live = true;
    if (products.length < 2) return undefined;
    getSavedComparisonAnalysis(products.map((p) => p.id)).then((saved) => {
      if (!live || !saved?.analysis) return;
      setAiPhase((cur) => (cur === 'idle' ? 'result' : cur));
      setAiText((cur) => cur || saved.analysis);
      setAiSavedAt((cur) => cur || saved.at || '');
    });
    return () => { live = false; };
  }, [products.map((p) => p.id).join(','), products.length]); // eslint-disable-line

  useEffect(() => {
    const q = term.trim();
    if (!q) { setResults([]); return; }
    const tm = setTimeout(async () => {
      try {
        const found = await searchProducts(q, 12);
        setResults(compareCategory
          ? found.filter((p) => String(p.category || '') === String(compareCategory)
            && productMatchesRequestedCategory(p, compareCategory)).slice(0, 8)
          : found.slice(0, 8));
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(tm);
  }, [term, compareCategory]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setPicking(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Karşılaştırma tablosu artık ÜRÜN SAYFASINDAKİ GİBİ BÖLÜMLÜ.
  //
  // Eskiden ~60 satır düz bir liste hâlinde alt alta geliyordu ve aradığın
  // özelliği bulmak zordu (kullanıcı: "hepsi boşluk olmadan alt alta gelince
  // specs bulmak zor oluyor"). Ürünün kendi `specSections` yapısı zaten
  // "EKRAN / TASARIM / KAMERA / TEMEL BİLGİLER" gibi bölümler taşıyor —
  // ürün sayfası onu kullanıyordu, karşılaştırma kullanmıyordu. Artık aynı
  // yapıyı burada da kuruyoruz. Aynı kategorideki ürünlerin bölüm başlıkları
  // zaten aynıdır, bu yüzden ilk eşleşen ürünün bölümü satırı sahiplenir.
  // Ortak spec sozlugu (PocketBase) yalnizca TR DISI gorunumde gerekiyor;
  // dolunca specGroups yeniden hesaplanir.
  const [dict, setDict] = useState(null);
  useEffect(() => {
    let live = true;
    if (String(lang || '').slice(0, 2).toLowerCase() === 'tr') { setDict(null); return () => { live = false; }; }
    ensureSpecDictionary().then(() => { if (live) setDict(specDictCache()); });
    return () => { live = false; };
  }, [lang]);

  const specGroups = useMemo(() => {
    if (products.length < 1) return [];
    const flats = products.map((p) => flatSpecs(p, lang, dict));

    // canonical key -> bölüm adı (ürünlerin KENDİ specSections yapısından)
    const sectionByKey = new Map();
    const sectionOrder = [];
    for (const p of products) {
      // Bölüm başlıkları da bozulmamış kaynaktan gelmeli (aynı `sourceLang`
      // kapısı burada da hiç açılmıyordu → "General BİLGİLER" gibi başlıklar).
      const sections = pickSpecMaps(p, lang, dict).sections;
      if (!sections) continue;
      for (const [section, specs] of Object.entries(sections)) {
        if (!specs || typeof specs !== 'object' || Array.isArray(specs)) continue;
        if (!sectionOrder.includes(section)) sectionOrder.push(section);
        for (const k of Object.keys(specs)) {
          const sig = String(k || '').trim().toLowerCase();
          if (sig && !sectionByKey.has(sig)) sectionByKey.set(sig, section);
        }
      }
    }

    const keys = [];
    const seen = new Set();
    flats.forEach((f) => Object.keys(f).forEach((k) => {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }));

    const OTHER = '__other__';
    const buckets = new Map();
    for (const k of keys) {
      const values = flats.map((f) => f[k]?.value || '—');
      const ilk = flats.find((f) => f[k]) || {};
      const label = ilk[k]?.label || k;
      // Kazanan yonu (buyuk mu iyi, kucuk mu) DILE BAGLI OLMAYAN kanonik
      // anahtardan okunur; satir kimligi ise yerellestirilmis etiket.
      const ck = ilk[k]?.ck || k;
      const row = { key: k, label, values, win: rowWinners(ck, values) };
      const sec = sectionByKey.get(k) || OTHER;
      if (!buckets.has(sec)) buckets.set(sec, []);
      buckets.get(sec).push(row);
    }

    const ordered = [];
    for (const sec of sectionOrder) {
      const rows = buckets.get(sec);
      if (rows && rows.length) ordered.push({ section: sec, rows });
    }
    const rest = buckets.get(OTHER);
    if (rest && rest.length) ordered.push({ section: OTHER, rows: rest });
    return ordered;
  }, [products, lang, dict]);

  // Boş tablo kontrolü için düz satır sayısı.
  const specRowCount = useMemo(
    () => specGroups.reduce((n, g) => n + g.rows.length, 0),
    [specGroups],
  );

  const matchScores = useMemo(() => {
    if (!showMatchScore) return {};
    return Object.fromEntries(products.map((p) => [p.id, calculateProfileMatchScore(user, p)]));
  }, [products, showMatchScore, user]);

  const bestScore = useMemo(() => {
    if (products.length < 2) return null;
    return Math.max(...products.map((p) => Number(p.techScore) || 0));
  }, [products]);

  function pick(p) {
    setPickError('');
    if (compareCategory && (String(p.category || '') !== String(compareCategory)
      || !productMatchesRequestedCategory(p, compareCategory))) {
      setPickError(t('cmp.sameCategoryOnly', { cat: categoryLabel(compareCategory, lang) }));
      setPicking(false);
      return;
    }
    if (!add(p.id)) alert(t('pd.maxAlert', { max: COMPARE_MAX }));
    setTerm(''); setResults([]); setPicking(false);
  }

  // "Analiz Et" (ust eylem satiri): sekmeyi AI'ya cevir → oraya kaydir →
  // analizi baslat. Sira ONEMLI: sekme once degismezse kaydirilacak panel
  // henuz DOM'da olmaz; kaydirma bir sonraki kareye birakiliyor ki React yeni
  // sekmeyi basmis olsun ve hedefin konumu DOGRU olcusun.
  const aiSekmeRef = useRef(null);
  function analizeBaslat() {
    setTab('ai');
    requestAnimationFrame(() => {
      analizeKaydir(aiSekmeRef.current);
      // Kosan ya da hazir analiz varsa yeniden baslatma — kullanici yalnizca
      // sonuca gitmek istiyor olabilir.
      if (!aiBusy && !aiText && aiPhase === 'idle') startAiCompareQuiz();
    });
  }

  async function startAiCompareQuiz() {
    setAiNotice('');
    if (products.length < 2) {
      setAiNotice(L('Add at least two products first.', 'Önce en az iki ürün ekle.'));
      return;
    }
    // ÖNCE KONTROL, SONRA ANIMASYON (2026-08-07): `setAiBusy(true)` kontrolden
    // önce çalışınca bakiyesi 0 olan kullanıcı da animasyonu görüp analiz
    // başladı sanıyordu. `aiChecking` yalnız çift tıklamayı engeller.
    setAiChecking(true);
    setAiNotice(''); setAiNoticeCode('');
    const access = await guardAiAccess('compare_ai', {
      onMessage: (m, code) => { setAiNotice(m); setAiNoticeCode(code); },
    });
    setAiChecking(false);
    if (!access.ok) { setAiBusy(false); setAiPhase('idle'); return; }
    setAiBusy(true);
    // Fresh run: drop the cached saved report so the quiz/workboard renders.
    setAiText('');
    setAiSavedAt('');
    // Is artik MODUL SEVIYESINDE kosuyor: bilesen soksek bile devam eder,
    // durumu abonelik uzerinden geri gelir (bkz lib/compareAnalysisJobs).
    startCompareAnalysisJob({
      products, lang, user, fallbackQuiz: fallbackCompareQuiz(lang),
    });
  }

  // Already paid for at startAiCompareQuiz — no second charge here.
  //
  // Chunked generation: one report per product (run with capped concurrency) +
  // a small final verdict call, then assembled into the compare_full_report
  // shape. A single combined call truncated at the provider's ~8k output cap and
  // failed for 3+ products; per-product calls each finish comfortably and run in
  // parallel, so this is both more reliable AND faster than the old one big call.
  function runAiCompare(answers = []) {
    setAiNotice('');
    if (products.length < 2) {
      setAiNotice(L('Add at least two products first.', 'Önce en az iki ürün ekle.'));
      return;
    }
    // Ucret quiz adiminda alindi — burada TEKRAR ALINMAZ.
    runCompareAnalysisJob({ products, lang, user, answers });
  }

  const slots = [...products];
  const canAdd = slots.length < COMPARE_MAX;
  const popularCandidates = popular.filter((p) => !ids.includes(p.id));
  const visiblePopular = popularCandidates.slice(0, popularLimit);
  const showMorePopular = !popularLoading && popularCandidates.length > 0;

  // BURADA `<Navigate to="/" replace />` VARDI — havuz boşsa ziyaretçi ana
  // sayfaya atılıyordu. İki ayrı zarar veriyordu:
  //  1) Ölçülen CLS 1.251 (!) — yönlendirme aynı belge içinde olduğu için tüm
  //     düzen değişimi Core Web Vitals'a /compare'in hanesine yazılıyordu.
  //  2) Aşağıdaki `cmp-empty` + "popüler ürünler" bölümü, yani sayfanın TASARLANMIŞ
  //     boş durumu, hiçbir zaman görünmüyordu — yer imi, paylaşılan link veya
  //     Google'dan gelen kullanıcı karşılaştırma sayfasını hiç göremiyordu.
  // Boş havuz artık normal bir açılış ekranı: ürün ekleme kutusu + popüler
  // seçkiler. Yönlendirme yok, kayma yok.

  return (
    <div className="cmp" ref={cmpRef}>
      <div className="cmp-hero">
        <div className="container">
          <h1>{t('cmp.title')}</h1>
          <p>{L('Compare products side by side — add as many as you like.', 'Ürünleri yan yana karşılaştır — istediğin kadar ekle.')}</p>
        </div>
      </div>

      <div className="container">
        <div className="cmp-addbar" ref={boxRef}>
          <div className="cmp-addbar-row">
            <div className="cmp-add-input">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={term}
                onChange={(e) => { setTerm(e.target.value); setPicking(true); }}
                onFocus={() => setPicking(true)}
                placeholder={canAdd ? t('cmp.addPlaceholder') : t('cmp.addFull', { max: COMPARE_MAX })}
                disabled={!canAdd}
              />
              {products.length > 0 && (
                <button className="cmp-clear" onClick={clear}>{t('cmp.clearAll')}</button>
              )}
            </div>
            {/* AI analizini baslatmanin tek yolu sayfanin cok asagisindaki
                sekmeydi; burada ust eylem satirinda duruyor. En az iki urun
                gerekiyor — tek urunle karsilastirma analizi anlamsiz. */}
            {products.length >= 2 && (
              <AnalyzeButton busy={aiBusy} onClick={analizeBaslat} />
            )}
            {ytUrl && products.length >= 2 && (
              <a className="cmp-yt-icon" href={ytUrl} target="_blank" rel="noopener"
                aria-label="YouTube"
                title={L('Watch this comparison on YouTube', 'Bu karşılaştırmayı YouTube\'da izle')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.1 5 12 5 12 5s-6.1 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.9 19 12 19 12 19s6.1 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3Z" />
                </svg>
              </a>
            )}
          </div>
          {picking && results.length > 0 && (
            <div className="cmp-results">
              {results.map((r) => (
                <button key={r.id} className="cmp-result" onClick={() => pick(r)}
                  disabled={ids.includes(r.id)}>
                  <ProductImg src={r.imageUrl} alt="" size="thumb" />
                  <span className="cmp-result-name">{displayProductName(r, lang)}</span>
                  <span className={`score ${scoreClass(r.techScore)}`}>⚡ {scoreLabel(r.techScore)}</span>
                  {ids.includes(r.id) && <span className="cmp-result-in">{t('cmp.added')}</span>}
                </button>
              ))}
            </div>
          )}
          {pickError && <div className="cmp-pick-error">{pickError}</div>}
        </div>

        {loading && ids.length > 0 ? (
          <div className="cmp-loading"><div className="spinner" /> {t('cmp.loading')}</div>
        ) : products.length === 0 ? (
          <>
            <div className="cmp-empty">
              <div className="cmp-empty-icon">⚖️</div>
              <h3>{t('cmp.emptyTitle')}</h3>
              <p>{t('cmp.emptyDesc')}</p>
            </div>
            <section className="cmp-picks">
              <div className="cmp-picks-head">
                <h2>{t('cmp.popularTitle')}</h2>
                <span>{t('cmp.popularDesc')}</span>
              </div>
              <div className="card-grid">
                {popularLoading
                  ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
                  : visiblePopular.map((p) => (
                    <ProductCard key={p.id} product={p}
                      onClick={(e) => { e.preventDefault(); pick(p); }} />
                  ))}
              </div>
              {showMorePopular && (
                <button className="btn btn-ghost cmp-more" onClick={() => setPopularLimit((n) => n + 6)}>
                  {t('cmp.loadMore')}
                </button>
              )}
            </section>
          </>
        ) : (
          <>
            {/* product header cards with dual rings — app parity */}
            <div className="cmp-product-scroll cmp-hscroll">
              <div className="cmp-product-row">
              <div className="cmp-scroll-spacer" aria-hidden="true" />
              <div className="cmp-cards">
                {slots.map((p) => {
                  const m = catMeta(p.category);
                  const tech = Number(p.techScore) || 0;
                  const match = matchScores[p.id] || 0;
                  const isBest = bestScore != null && tech === bestScore;
                  const name = displayProductName(p, lang);
                  return (
                    <div className={'cmp-card' + (isBest && products.length > 1 ? ' best' : '')} key={p.id}>
                      <button className="cmp-remove" onClick={() => remove(p.id)} aria-label="✕"><IconX size={14} width={2.4} /></button>
                      {isBest && products.length > 1 && (
                        /* Metin `.cmp-best-tag-txt` icinde: telefonda sutun
                           ~135 px'e dustugu icin rozet gorselin ustune binip
                           kirpiliyordu ("★ Eni…"). Dar ekranda yalniz yildiz
                           kaliyor — anlam kaybolmuyor, cunku rozet zaten tek
                           bir kartta ve kartin cercevesi de yesil. */
                        <span className="cmp-best-tag">★<span className="cmp-best-tag-txt"> {L('Best', 'En İyi')}</span></span>
                      )}
                      <Link to={productPath(p)} className="img-tile cmp-card-img">
                        <ProductImg src={p.imageUrl} alt={name} size="card" />
                      </Link>
                      {p.brand && <div className="cmp-card-brand">{p.brand}</div>}
                      <Link to={productPath(p)} className="cmp-card-name">{name}</Link>
                      <div className="cmp-card-cat">{m.icon} {categoryLabel(p.category, lang)}</div>
                      <div className="cmp-rings">
                        {showMatchScore && match > 0 && (
                          <span className="cmp-ring">
                            <Gauge value={match} size={46} stroke={4} color="var(--score-average)" fontSize={14} />
                            <small>{L('Match', 'Uyum')}</small>
                          </span>
                        )}
                        {tech > 0 && (
                          <span className="cmp-ring">
                            <Gauge value={tech} size={46} stroke={4} color={techColor(tech)} fontSize={14} />
                            <small>{L('Tech', 'Tech')}</small>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>

            {/* Prices — independent block ABOVE the tabs, one card per product
                column, country-aware (visitor's detected market). */}
            <section className="cmp-prices-block">
              <h2 className="cmp-block-title">{L('Prices', 'Fiyatlar')}</h2>
              <div className="cmp-product-scroll cmp-hscroll">
                <div className="cmp-product-row">
                <div className="cmp-scroll-spacer" aria-hidden="true" />
                <div className="cmp-prices">
                  {slots.map((p) => {
                    const amz = amazonUrlForProduct(p, (geoCountry || 'US'));
                    const name = displayProductName(p, lang);
                    return (
                      <div className="cmp-price-card" key={p.id}>
                        <Link to={productPath(p)} className="cmp-price-name">{name}</Link>
                        {/* Urun sayfasindaki listenin AYNISI: magazalar alt alta,
                            ucuzdan pahaliya. Yeni fiyat eklendiginde kendi
                            sirasina girer — ayrica bir sey yapmak gerekmez. */}
                        <OfferList
                          offers={offersById[p.id] || []}
                          country={(geoCountry || 'US').toUpperCase()}
                          lang={lang}
                          geoCountry={geoCountry}
                          amazonHref={amz ? amazonGoPath(p, (geoCountry || 'US')) : ''}
                          compact
                          emptyText={L('No price in your region', 'Bölgende fiyat yok')}
                        />
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>
            </section>

            {/* tabs — Specs · AI (centered) */}
            <div className="cmp-tabs2" ref={aiSekmeRef}>
              <button className={tab === 'specs' ? 'on' : ''} onClick={() => setTab('specs')}>
                {L('Specs', 'Özellikler')}
              </button>
              {/* Analiz KOSARKEN sekme etiketinin sag ustunde donen halka.
                  Kullanici sekmeler arasi gecebiliyor ve baska sayfaya gidip
                  donebiliyor; isin hala surdugunu gosteren tek isaret panelin
                  ICINDEYDI, yani "Ozellikler" sekmesindeyken islem bitmis mi
                  suruyor mu anlasilmiyordu. */}
              <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
                <span className="tab-lbl">
                  {L('AI Analysis', 'AI Analizi')}
                  {aiBusy && <i className="tab-spin" role="status" aria-live="polite"
                    aria-label={L('Analysis running', 'Analiz sürüyor')} />}
                </span>
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              {tab === 'specs' && (
                <>
                <div className="cmp-fhead cmp-hscroll" ref={fheadRef} aria-hidden="true">
                  <div className="cmp-fhead-row">
                    <div className="cmp-scroll-spacer" />
                    {slots.map((p) => (
                      <div className="cmp-fhead-cell" key={p.id}>{displayProductName(p, lang)}</div>
                    ))}
                  </div>
                </div>
                <div className="cmp-table-wrap cmp-hscroll fade-up">
                  <table className="cmp-table">
                    <thead>
                      <tr>
                        <th className="cmp-th-spec">{t('cmp.specCol')}</th>
                        {slots.map((p) => (
                          <th key={p.id} className="cmp-th-prod cmp-th-compact">
                            <Link to={productPath(p)} className="cmp-th-name">{displayProductName(p, lang)}</Link>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="cmp-row-score">
                        <td className="cmp-td-spec">{t('cmp.scoreRow')}</td>
                        {slots.map((p) => {
                          const isBest = bestScore != null && (Number(p.techScore) || 0) === bestScore;
                          return (
                            <td key={p.id} className={isBest ? 'cmp-td-win' : ''}>
                              <span className={`score ${scoreClass(p.techScore)}`}>{scoreLabel(p.techScore)}</span>
                            </td>
                          );
                        })}
                      </tr>
                      {specGroups.map((group) => (
                        <Fragment key={group.section}>
                          <tr className="cmp-section-row">
                            <th className="cmp-section-head" colSpan={1 + slots.length} scope="colgroup">
                              {group.section === '__other__'
                                ? L('Other', 'Diğer')
                                : group.section}
                            </th>
                          </tr>
                          {group.rows.map((row) => (
                            <tr key={row.key}>
                              <td className="cmp-td-spec">{row.label}</td>
                              {row.values.map((v, i) => (
                                <td key={i}
                                  className={v === '—' ? 'cmp-td-empty' : row.win[i] ? 'cmp-td-win' : ''}>
                                  {v === '—' ? (
                                    <span className="cmp-na" title={L('No data', 'Veri yok')}>?</span>
                                  ) : (
                                    <>
                                      {row.win[i] && <span className="cmp-win-dot" aria-hidden="true">✓</span>}
                                      <SpecValue value={v} lang={lang} />
                                    </>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                      {specRowCount === 0 && (
                        <tr>
                          <td className="cmp-td-spec">—</td>
                          {slots.map((p) => (
                            <td key={p.id} className="cmp-td-empty">{t('cmp.noSpecData')}</td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                </>
              )}

              {tab === 'ai' && (
                <div className="cmp-ai-layout fade-up">
                  {/* Üst çıkış çubuğu — diğer analiz akışlarıyla aynı. */}
                  {aiPhase !== 'idle' && (
                    <AnalysisExitBar
                      lang={lang}
                      onExit={exitCompareAnalysis}
                      busy={aiBusy}
                      context={products.map((x) => displayProductName(x, lang)).join(' vs ')}
                      label={aiText
                        ? L('New analysis', 'Yeni analiz')
                        : L('Cancel analysis', 'Analizden çık')}
                    />
                  )}
                  <div className="card pad-lg cmp-ai">
                    {!aiText && aiPhase === 'idle' && (
                      <button className="btn btn-grad btn-lg" onClick={startAiCompareQuiz} disabled={aiBusy || aiChecking}>
                        {L('Start analysis', 'Analizi başlat')}
                      </button>
                    )}
                    {!aiText && aiPhase === 'quizLoading' && (
                      <AiWorkboard lang={lang} mode="quizCompare" startedAt={aiPhaseStartedAt} />
                    )}
                    {!aiText && aiPhase === 'quiz' && aiQuestions.length > 0 && (
                      <QuizFlow
                        questions={aiQuestions}
                        busy={aiBusy}
                        title={L('Tune the comparison', 'Karşılaştırmayı kişiselleştir')}
                        subtitle={L(
                          'Answer these before the report so each product is scored for your real use.',
                          'Rapor öncesi cevapla; her ürün gerçek kullanımına göre puanlansın.',
                        )}
                        onSubmit={runAiCompare}
                      />
                    )}
                    {!aiText && aiPhase === 'analyzing' && (
                      <AiWorkboard lang={lang} mode="compare" stage={aiStage} startedAt={aiPhaseStartedAt} />
                    )}
                    {/* Cevaplar duruyorsa raporu ÜCRETSİZ yeniden üret; quiz
                        aşamasında kesildiyse cevap yoktur → quizi baştan aç.
                        Eskiden ikinci durumda buton DEVRE DIŞI kalıyor ve
                        kullanıcı çıkmaz sokakta kalıyordu. */}
                    {!aiText && aiPhase === 'error' && (
                      aiAnswers.length ? (
                        <button className="btn btn-grad btn-lg" onClick={() => runAiCompare(aiAnswers)} disabled={aiBusy}>
                          {L('Retry analysis', 'Analizi tekrar dene')}
                        </button>
                      ) : (
                        <button className="btn btn-grad btn-lg" onClick={startAiCompareQuiz} disabled={aiBusy || aiChecking}>
                          {L('Start analysis', 'Analizi başlat')}
                        </button>
                      )
                    )}
                    {aiNotice && (
                      <div className="cmp-ai-notice">
                        {aiNotice}
                        {aiNoticeCode === 'INSUFFICIENT_QOR_COINS' && (
                          <> <Link to="/premium">{L('See Premium', 'Premium’a bak')}</Link></>
                        )}
                      </div>
                    )}
                    {aiText && aiSavedAt && (
                      <div className="cmp-ai-cached">
                        <span>
                          {L('Saved analysis', 'Kayıtlı analiz')}
                          {formatSavedAt(aiSavedAt, lang) ? ` · ${formatSavedAt(aiSavedAt, lang)}` : ''}
                        </span>
                        <button type="button" className="btn btn-ghost" onClick={startAiCompareQuiz} disabled={aiBusy || aiChecking}>
                          {L('Re-analyze', 'Yeniden analiz et')}
                        </button>
                      </div>
                    )}
                    {aiText && (
                      parseAiJson(aiText)
                        ? <div className="cmp-ai-result"><AiAnalysisView kind="compareFull" raw={aiText} lang={lang} products={products} /></div>
                        : <div className="cmp-ai-result"><PlainAiText text={aiText} /></div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <CompareReviews
              productIds={slots.map((p) => p.id)}
              productNames={slots.map((p) => displayProductName(p, lang)).join(' vs ')}
            />

            <section className="cmp-picks cmp-picks-after">
              <div className="cmp-picks-head">
                <h2>{t('cmp.popularTitle')}</h2>
                <span>{compareCategory
                  ? t('cmp.sameCategoryHint', { cat: categoryLabel(compareCategory, lang) })
                  : t('cmp.popularDesc')}</span>
              </div>
              <div className="card-grid">
                {popularLoading
                  ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
                  : visiblePopular.map((p) => (
                    <ProductCard key={p.id} product={p}
                      onClick={(e) => { e.preventDefault(); pick(p); }} />
                  ))}
              </div>
              {showMorePopular && (
                <button className="btn btn-ghost cmp-more" onClick={() => setPopularLimit((n) => n + 6)}>
                  {t('cmp.loadMore')}
                </button>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
