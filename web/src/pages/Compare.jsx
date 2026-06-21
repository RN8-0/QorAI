import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getProduct, popularProducts, productMatchesRequestedCategory, searchProducts } from '../lib/typesense';
import { useCompare, COMPARE_MAX, setCompareList } from '../lib/compare';
import { getSavedComparisonAnalysis, saveComparisonAnalysisHistory, saveComparisonHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { catMeta, categoryLabel, priceForCountry, formatPriceAmount, amazonUrlForProduct, amazonGoPath, scoreClass, scoreLabel } from '../lib/format';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import { useSeo } from '../lib/seo';
import { canonicalizeSpecMaps } from '../lib/specCanonical';
import { rowWinners } from '../lib/specDirection';
import { productPath, parseComparePair } from '../lib/routes';
import { askQorAiGrounded, askQorAiRaw } from '../lib/ai';
import { generateCompareQuiz } from '../lib/linkAnalysis';
import { getRecentProducts } from '../lib/recentViewed';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import { useGeoCountry } from '../lib/geo';
import AiAnalysisView, {
  buildCompareProductPrompt,
  buildCompareResearchPrompt,
  buildCompareVerdictPrompt,
  parseAiJson,
} from '../components/AiAnalysis.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import AiWorkboard from '../components/AiWorkboard.jsx';
import AmazonLogo from '../components/AmazonLogo.jsx';
import { calculateProfileMatchScore, hasProfileMatch } from '../lib/profileMatch';
import { isDisplayableSpec, localizedSpecLabel, localizedSpecValue } from '../lib/specDisplay';
import { displayProductName } from '../lib/productNames';
import { usePageContext } from '../lib/pageContext';
import CompareReviews from '../components/CompareReviews.jsx';
import './Compare.css';

function flatSpecs(p) {
  const flat = {};
  const put = (obj) => {
    if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== '' && isDisplayableSpec(k, v)) flat[k] = String(v);
      });
    }
  };
  const canonical = canonicalizeSpecMaps(p);
  put(canonical.keySpecs);
  put(canonical.specs);
  if (canonical.specSections && typeof canonical.specSections === 'object') {
    Object.values(canonical.specSections).forEach(put);
  }
  return flat;
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
  const lines = splitSpecValue(localizedSpecValue(value, lang));
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
  const loc = lang === 'tr' ? 'tr' : lang === 'de' ? 'de' : 'en';
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
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [tab, setTab] = useState('specs');
  const { user } = useAuth();
  const guardAiAccess = useAiAccess(lang);
  // Deep links / crawlers can land on /compare/<a>-vs-<b>. Recover the two ids
  // from the URL and seed the (otherwise localStorage-driven) compare pool so the
  // comparison renders for a fresh visitor instead of bouncing to home.
  const routeParams = useParams();
  const urlPairIds = useMemo(() => parseComparePair(routeParams.pair), [routeParams.pair]);
  useEffect(() => {
    if (urlPairIds.length === 2) setCompareList(urlPairIds);
  }, [urlPairIds.join(',')]); // eslint-disable-line
  useSeo({
    title: `${t('cmp.title')} — Qor AI`,
    description: L('Compare products side by side — add as many as you like.', 'Ürünleri yan yana karşılaştır — istediğin kadar ekle.', 'Produkte nebeneinander vergleichen — füge beliebig viele hinzu.'),
    path: routeParams.pair ? `/compare/${routeParams.pair}` : '/compare',
  });
  const { ids, remove, clear, add } = useCompare();
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
  const [aiPhase, setAiPhase] = useState('idle');
  const [aiStage, setAiStage] = useState(null);
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
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ytQuery} ${lang === 'tr' ? 'karşılaştırma' : lang === 'de' ? 'Vergleich' : 'comparison'}`)}`
    : '';

  // Let the chat bubble read & comment on the comparison.
  usePageContext(ytQuery
    ? `${lang === 'tr' ? 'Karşılaştırma' : lang === 'de' ? 'Vergleich' : 'Comparison'}: ${products.map((p) => `${displayProductName(p, lang) || p.name}${Number(p.techScore) ? ` (${Math.round(p.techScore)}/100)` : ''}`).join(' vs ')}`
    : (lang === 'tr' ? 'Karşılaştırma sayfası' : lang === 'de' ? 'Vergleichsseite' : 'Compare page'));

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
  useLayoutEffect(() => {
    const root = cmpRef.current;
    if (!root || products.length < 1) return undefined;
    const apply = () => {
      const scroller = root.querySelector('.cmp-product-scroll');
      const availW = (scroller ? scroller.clientWidth : root.clientWidth) || 0;
      if (!availW) return;
      const n = products.length;
      const labelW = availW < 680 ? 116 : 184;
      const minCol = availW < 680 ? 200 : 230;
      const col = Math.max(minCol, Math.floor((availW - labelW) / n));
      root.style.setProperty('--cmp-label', `${labelW}px`);
      root.style.setProperty('--cmp-col', `${col}px`);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [products.length]);

  useEffect(() => {
    setAiBusy(false);
    setAiText('');
    setAiNotice('');
    setAiPhase('idle');
    setAiQuestions([]);
    setAiAnswers([]);
    setAiSavedAt('');
  }, [ids.join(',')]); // eslint-disable-line

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

  const specRows = useMemo(() => {
    if (products.length < 1) return [];
    const flats = products.map(flatSpecs);
    const keys = [];
    const seen = new Set();
    flats.forEach((f) => Object.keys(f).forEach((k) => {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }));
    return keys.map((k) => {
      const values = flats.map((f) => f[k] || '—');
      return { key: k, values, win: rowWinners(k, values) };
    });
  }, [products]);

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

  async function startAiCompareQuiz() {
    setAiNotice('');
    if (products.length < 2) {
      setAiNotice(L('Add at least two products first.', 'Önce en az iki ürün ekle.', 'Füge zuerst mindestens zwei Produkte hinzu.'));
      return;
    }
    // Charge + gate UP FRONT (2 Qor Coins; unlimited on Premium). No balance →
    // Premium redirect; we never even prepare the quiz. Not charged again on run.
    setAiBusy(true);
    const access = await guardAiAccess('compare_ai', { onMessage: setAiNotice });
    if (!access.ok) { setAiBusy(false); setAiPhase('idle'); return; }
    // Fresh run: drop the cached saved report so the quiz/workboard renders.
    setAiText('');
    setAiSavedAt('');
    setAiPhase('quizLoading');
    try {
      let questions = await generateCompareQuiz({
        products: products.map((p) => ({
          title: displayProductName(p, lang),
          url: productPath(p),
          category: p.category,
          score: p.techScore,
          analysis: p.description || '',
        })),
        language: lang,
        userProfile: {
          ...aiUserProfile(user),
          recentlyViewed: getRecentProducts().slice(0, 8)
            .map((rp) => ({ name: rp.name, category: rp.category, brand: rp.brand }))
            .filter((x) => x.name),
        },
      });
      if (!questions.length) questions = fallbackCompareQuiz(lang);
      setAiQuestions(questions);
      setAiPhase('quiz');
    } catch {
      setAiQuestions(fallbackCompareQuiz(lang));
      setAiPhase('quiz');
    } finally {
      setAiBusy(false);
    }
  }

  // Already paid for at startAiCompareQuiz — no second charge here.
  //
  // Chunked generation: one report per product (run with capped concurrency) +
  // a small final verdict call, then assembled into the compare_full_report
  // shape. A single combined call truncated at the provider's ~8k output cap and
  // failed for 3+ products; per-product calls each finish comfortably and run in
  // parallel, so this is both more reliable AND faster than the old one big call.
  async function runAiCompare(answers = []) {
    setAiNotice('');
    setAiAnswers(Array.isArray(answers) ? answers : []);
    if (products.length < 2) {
      setAiNotice(L('Add at least two products first.', 'Önce en az iki ürün ekle.', 'Füge zuerst mindestens zwei Produkte hinzu.'));
      return;
    }
    setAiBusy(true);
    setAiPhase('analyzing');
    setAiStage('prep');
    try {
      let research = '';
      try {
        setAiStage('research');
        research = await askQorAiGrounded(buildCompareResearchPrompt(products, lang, { quizAnswers: answers }), {
          language: lang,
          maxOutputTokens: 2048,
        });
      } catch {
        research = '';
      }
      setAiStage('report');
      const profile = aiUserProfile(user);
      const peerNames = products.map((p) => displayProductName(p, lang));
      const askJson = (userPrompt, maxTokens, temperature = 0.42) => askQorAiRaw({
        system: `You are Qor AI. Return only valid JSON in language code ${lang}. Use current research and Qor catalog context over stale model memory. Every user-facing text field must be in the requested language; keep only brand/product names and technical terms as-is.`,
        user: userPrompt,
        maxOutputTokens: maxTokens,
        temperature,
        jsonMode: true,
      });

      const reports = await mapWithConcurrency(products, 5, async (p) => {
        const prompt = buildCompareProductPrompt(p, lang, profile, { quizAnswers: answers, research, peerNames });
        let parsed = null;
        try { parsed = parseAiJson(await askJson(prompt, 8192)); } catch { parsed = null; }
        if (!parsed || typeof parsed !== 'object') return null;
        return {
          ...parsed,
          name: parsed.name || displayProductName(p, lang),
          imageUrl: p.imageUrl || parsed.imageUrl || '',
          url: productPath(p),
        };
      });
      const okReports = reports.filter(Boolean);
      // Need at least two products to call it a comparison; bail to the retry UI
      // if the provider failed on too many of them.
      if (okReports.length < 2) throw new Error('reports-failed');

      let verdict = {};
      try {
        const vText = await askJson(
          buildCompareVerdictPrompt(products, okReports, lang, profile, { quizAnswers: answers, research }),
          6144,
          0.4,
        );
        verdict = parseAiJson(vText) || {};
      } catch { verdict = {}; }

      const text = JSON.stringify({ type: 'compare_full_report', products: okReports, comparison: verdict });
      setAiText(text);
      setAiPhase('result');
      await saveComparisonAnalysisHistory({ products, analysis: text });
    } catch (e) {
      setAiNotice(L('AI analysis failed. Please try again.', 'AI analizi başarısız oldu. Tekrar dene.', 'KI-Analyse fehlgeschlagen. Bitte erneut versuchen.'));
      setAiPhase('error');
    } finally {
      setAiBusy(false);
    }
  }

  const slots = [...products];
  const canAdd = slots.length < COMPARE_MAX;
  const popularCandidates = popular.filter((p) => !ids.includes(p.id));
  const visiblePopular = popularCandidates.slice(0, popularLimit);
  const showMorePopular = !popularLoading && popularCandidates.length > 0;

  // The standalone Compare page was removed from navigation — it's only reached
  // via the compare tray once products are queued. With nothing queued there is
  // no landing page to show, so send visitors home. But never redirect a
  // /compare/<a>-vs-<b> deep link: the seeding effect fills ids on the next tick.
  if (!ids.length && urlPairIds.length < 2) return <Navigate to="/" replace />;

  return (
    <div className="cmp" ref={cmpRef}>
      <div className="cmp-hero">
        <div className="container">
          <h1>{t('cmp.title')}</h1>
          <p>{L('Compare products side by side — add as many as you like.', 'Ürünleri yan yana karşılaştır — istediğin kadar ekle.', 'Produkte nebeneinander vergleichen — füge beliebig viele hinzu.')}</p>
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
            {ytUrl && products.length >= 2 && (
              <a className="cmp-yt-icon" href={ytUrl} target="_blank" rel="noopener"
                aria-label="YouTube"
                title={L('Watch this comparison on YouTube', 'Bu karşılaştırmayı YouTube\'da izle', 'Diesen Vergleich auf YouTube ansehen')}>
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
                      <button className="cmp-remove" onClick={() => remove(p.id)} aria-label="✕">✕</button>
                      {isBest && products.length > 1 && (
                        <span className="cmp-best-tag">★ {L('Best', 'En İyi', 'Top')}</span>
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
                            <small>{L('Match', 'Uyum', 'Match')}</small>
                          </span>
                        )}
                        {tech > 0 && (
                          <span className="cmp-ring">
                            <Gauge value={tech} size={46} stroke={4} color={techColor(tech)} fontSize={14} />
                            <small>{L('Tech', 'Tech', 'Tech')}</small>
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
              <h2 className="cmp-block-title">{L('Prices', 'Fiyatlar', 'Preise')}</h2>
              <div className="cmp-product-scroll cmp-hscroll">
                <div className="cmp-product-row">
                <div className="cmp-scroll-spacer" aria-hidden="true" />
                <div className="cmp-prices">
                  {slots.map((p) => {
                    const cp = priceForCountry(p, geoCountry);
                    const amz = amazonUrlForProduct(p, (geoCountry || 'US'));
                    const amzGo = amazonGoPath(p, (geoCountry || 'US'));
                    const name = displayProductName(p, lang);
                    return (
                      <div className="cmp-price-card" key={p.id}>
                        <Link to={productPath(p)} className="cmp-price-name">{name}</Link>
                        {cp ? <div className="cmp-price-amt">{formatPriceAmount(cp.price, cp.currency, lang)}</div>
                          : <div className="cmp-price-none">{L('No price in your region', 'Bölgende fiyat yok', 'Kein Preis in deiner Region')}</div>}
                        {amz && (
                          <a className="cmp-price-row-link" href={amzGo} target="_blank" rel="sponsored noopener nofollow">
                            <AmazonLogo height={20} /><span>{L('See price', 'Fiyata bak', 'Preis ansehen')}</span>
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>
            </section>

            {/* tabs — Specs · AI (centered) */}
            <div className="cmp-tabs2">
              <button className={tab === 'specs' ? 'on' : ''} onClick={() => setTab('specs')}>
                {L('Specs', 'Özellikler', 'Eigenschaften')}
              </button>
              <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
                {L('AI Analysis', 'AI Analizi', 'KI-Analyse')}
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
                      {specRows.map((row) => (
                        <tr key={row.key}>
                          <td className="cmp-td-spec">{localizedSpecLabel(row.key, lang)}</td>
                          {row.values.map((v, i) => (
                            <td key={i}
                              className={v === '—' ? 'cmp-td-empty' : row.win[i] ? 'cmp-td-win' : ''}>
                              {v === '—' ? (
                                <span className="cmp-na" title={L('No data', 'Veri yok', 'Keine Daten')}>?</span>
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
                      {specRows.length === 0 && (
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
                  <div className="card pad-lg cmp-ai">
                    {!aiText && aiPhase === 'idle' && (
                      <button className="btn btn-grad btn-lg" onClick={startAiCompareQuiz} disabled={aiBusy}>
                        {L('Start analysis', 'Analizi başlat', 'Analyse starten')}
                      </button>
                    )}
                    {!aiText && aiPhase === 'quizLoading' && (
                      <AiWorkboard lang={lang} mode="quizCompare" />
                    )}
                    {!aiText && aiPhase === 'quiz' && aiQuestions.length > 0 && (
                      <QuizFlow
                        questions={aiQuestions}
                        busy={aiBusy}
                        title={L('Tune the comparison', 'Karşılaştırmayı kişiselleştir', 'Vergleich anpassen')}
                        subtitle={L(
                          'Answer these before the report so each product is scored for your real use.',
                          'Rapor öncesi cevapla; her ürün gerçek kullanımına göre puanlansın.',
                          'Beantworte dies vor dem Bericht, damit jedes Produkt passend bewertet wird.',
                        )}
                        onSubmit={runAiCompare}
                      />
                    )}
                    {!aiText && aiPhase === 'analyzing' && (
                      <AiWorkboard lang={lang} mode="compare" stage={aiStage} />
                    )}
                    {!aiText && aiPhase === 'error' && (
                      <button className="btn btn-grad btn-lg" onClick={() => runAiCompare(aiAnswers)} disabled={aiBusy || !aiAnswers.length}>
                        {L('Retry analysis', 'Analizi tekrar dene', 'Analyse erneut versuchen')}
                      </button>
                    )}
                    {aiNotice && <div className="cmp-ai-notice">{aiNotice}</div>}
                    {aiText && aiSavedAt && (
                      <div className="cmp-ai-cached">
                        <span>
                          {L('Saved analysis', 'Kayıtlı analiz', 'Gespeicherte Analyse')}
                          {formatSavedAt(aiSavedAt, lang) ? ` · ${formatSavedAt(aiSavedAt, lang)}` : ''}
                        </span>
                        <button type="button" className="btn btn-ghost" onClick={startAiCompareQuiz} disabled={aiBusy}>
                          {L('Re-analyze', 'Yeniden analiz et', 'Neu analysieren')}
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
