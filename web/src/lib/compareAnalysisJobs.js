// Karşılaştırma analizi için MODÜL SEVİYESİ iş deposu.
//
// NEDEN: Analiz akışı `Compare.jsx` içinde bileşen state'inde tutuluyordu.
// Kullanıcı analiz koşarken başka bir sayfaya geçtiğinde bileşen sökülüyor,
// state siliniyor ve dönüşte her şey sıfırlanıyordu — üstelik sayfada
// `useEffect(..., [ids])` ile açıkça temizleniyordu. Link ve abonelik
// analizleri zaten bu desende (modül seviyesinde) koşuyordu; karşılaştırma
// ve ürün analizi eksikti. Kullanıcı isteği: "farklı sayfalarda gezinebilecek,
// analiz arkaplanda devam edecek, hazır olunca Qor chat'te ünlem çıkacak."
//
// Depo bileşenden BAĞIMSIZ yaşar: iş bir Promise olarak burada koşar,
// dinleyiciler yalnızca anlık görüntüyü çizer. Bileşen sökülse bile iş devam
// eder; geri dönüldüğünde `phase`/`text` neredeyse anında yerine oturur.
import { askQorAiGrounded, askQorAiRaw } from './ai';
import { generateCompareQuiz } from './linkAnalysis';
import { saveComparisonAnalysisHistory } from './pbHistory';
import { getRecentProducts } from './recentViewed';
import { aiUserProfile } from './qorCoins';
import { displayProductName } from './productNames';
import { productPath } from './routes';
import {
  buildCompareProductPrompt,
  buildCompareResearchPrompt,
  buildCompareVerdictPrompt,
  parseAiJson,
} from '../components/AiAnalysis.jsx';

const STORAGE_KEY = 'qor.compareAnalysis.activeJob';
const listeners = new Set();
let activeJob = null;

// Yalnız bu aşamalar sayfa yenilendikten sonra geri yüklenir: koşan bir Promise
// yeniden yükleme sonrası YOK, dolayısıyla 'quizLoading'/'analyzing' bir daha
// asla ilerlemez ve kullanıcı sonsuz animasyonda kalırdı.
const RESTORABLE_PHASES = new Set(['quiz', 'result']);

/** Ürün kimlik kümesi — iş, hangi karşılaştırmaya ait olduğunu bilmeli. */
export function compareJobKey(ids) {
  return [...(ids || [])].filter(Boolean).sort().join(',');
}

function cloneJob(job = activeJob) {
  if (!job) return null;
  const { promise, ...rest } = job;
  return { ...rest, questions: [...(rest.questions || [])], answers: [...(rest.answers || [])] };
}

function persist() {
  try {
    if (!activeJob || !RESTORABLE_PHASES.has(activeJob.phase)) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(cloneJob()));
  } catch { /* depolama yalnız UI geri yüklemesi için */ }
}

function emit() {
  persist();
  const snap = cloneJob();
  listeners.forEach((cb) => { try { cb(snap); } catch { /* dinleyici işi bozmasın */ } });
}

function setJob(patch) {
  if (!activeJob) return;
  const phaseChanged = patch.phase && patch.phase !== activeJob.phase;
  activeJob = {
    ...activeJob,
    ...patch,
    ...(phaseChanged ? { phaseStartedAt: new Date().toISOString() } : {}),
    updatedAt: new Date().toISOString(),
  };
  emit();
}

function hydrate() {
  if (activeJob || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const job = JSON.parse(raw);
    if (!job?.id || !RESTORABLE_PHASES.has(job.phase)) return;
    activeJob = { ...job, promise: null };
  } catch { /* bozuk kayıt: yeni analiz üzerine yazar */ }
}

export function subscribeCompareAnalysisJob(cb) {
  hydrate();
  listeners.add(cb);
  cb(cloneJob());
  return () => listeners.delete(cb);
}

export function getActiveCompareAnalysisJob() {
  hydrate();
  return cloneJob();
}

export function clearCompareAnalysisJob(id) {
  if (!activeJob) return;
  if (id && activeJob.id !== id) return;
  activeJob = null;
  emit();
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Quiz üretimi — erişim/ödeme kontrolü ÇAĞIRAN tarafta yapılır (sayfa, useAiAccess ile). */
export function startCompareAnalysisJob({ products, lang, user, fallbackQuiz }) {
  const key = compareJobKey(products.map((p) => p.id));
  const job = {
    id: `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    lang,
    phase: 'quizLoading',
    phaseStartedAt: new Date().toISOString(),
    stage: null,
    questions: [],
    answers: [],
    text: '',
    savedAt: '',
    error: '',
    startedAt: new Date().toISOString(),
  };
  activeJob = job;
  emit();

  job.promise = (async () => {
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
      if (!questions.length) questions = fallbackQuiz;
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ questions, phase: 'quiz' });
    } catch {
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ questions: fallbackQuiz, phase: 'quiz' });
    }
  })();
  return cloneJob(job);
}

/** Quiz cevaplandı → raporu üret. Ücret quiz adımında alındı, burada TEKRAR ALINMAZ. */
export function runCompareAnalysisJob({ products, lang, user, answers = [] }) {
  if (!activeJob) return null;
  const job = activeJob;
  setJob({ answers, phase: 'analyzing', stage: 'prep', error: '' });

  job.promise = (async () => {
    try {
      let research = '';
      try {
        if (activeJob && activeJob.id === job.id) setJob({ stage: 'research' });
        research = await askQorAiGrounded(
          buildCompareResearchPrompt(products, lang, { quizAnswers: answers }),
          { language: lang, maxOutputTokens: 2048 },
        );
      } catch { research = ''; }
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ stage: 'report' });

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
      if (okReports.length < 2) throw new Error('reports-failed');

      let verdict = {};
      try {
        verdict = parseAiJson(await askJson(
          buildCompareVerdictPrompt(products, okReports, lang, profile, { quizAnswers: answers, research }),
          6144, 0.4,
        )) || {};
      } catch { verdict = {}; }

      const text = JSON.stringify({ type: 'compare_full_report', products: okReports, comparison: verdict });
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ stage: 'composing' });
      setJob({ text, phase: 'result', stage: null });
      try { await saveComparisonAnalysisHistory({ products, analysis: text }); } catch { /* geçmiş yazımı analizi bozmasın */ }
    } catch {
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ phase: 'error', stage: null, error: 'ANALYSIS_FAILED' });
    }
  })();
  return cloneJob(job);
}
