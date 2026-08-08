// Ürün analizi için MODÜL SEVİYESİ iş deposu — karşılaştırmadakiyle aynı
// gerekçe (bkz lib/compareAnalysisJobs.js): analiz bileşen state'inde
// tutulduğu sürece kullanıcı başka sayfaya geçtiğinde iş kayboluyordu.
// Artık iş burada koşar; sayfa yalnızca anlık görüntüyü çizer.
import { askQorAiGrounded, askQorAiRaw } from './ai';
import { generateQuiz } from './linkAnalysis';
import { saveProductAnalysisHistory } from './pbHistory';
import { getRecentProducts } from './recentViewed';
import { aiUserProfile } from './qorCoins';
import {
  buildFullPrompt,
  buildProductResearchPrompt,
  hasStaleAvailabilityClaims,
  parseAiJson,
  withFreshnessRetryInstruction,
} from '../components/AiAnalysis.jsx';

const STORAGE_KEY = 'qor.productAnalysis.activeJob';
const listeners = new Set();
let activeJob = null;
// Koşan bir Promise sayfa yenilenince YOKTUR; ara aşamalar geri yüklenirse
// kullanıcı sonsuz animasyonda kalır.
const RESTORABLE_PHASES = new Set(['quiz', 'result']);

function cloneJob(job = activeJob) {
  if (!job) return null;
  const { promise, ...rest } = job;
  return { ...rest, questions: [...(rest.questions || [])], answers: [...(rest.answers || [])] };
}

function persist() {
  try {
    if (!activeJob || !RESTORABLE_PHASES.has(activeJob.phase)) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(cloneJob()));
  } catch { /* yalnız UI geri yüklemesi */ }
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
  } catch { /* bozuk kayıt */ }
}

export function subscribeProductAnalysisJob(cb) {
  hydrate();
  listeners.add(cb);
  cb(cloneJob());
  return () => listeners.delete(cb);
}

export function getActiveProductAnalysisJob() {
  hydrate();
  return cloneJob();
}

export function clearProductAnalysisJob(id) {
  if (!activeJob) return;
  if (id && activeJob.id !== id) return;
  activeJob = null;
  emit();
}

/** Quiz üretimi. Ödeme/erişim kontrolü ÇAĞIRAN sayfada yapılır. */
export function startProductAnalysisJob({ product, lang, user, productTitle, productUrl, fallbackQuiz }) {
  const job = {
    id: `pd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key: product.id,
    productName: productTitle,
    productPath: productUrl,
    lang,
    phase: 'quizLoading',
    phaseStartedAt: new Date().toISOString(),
    stage: null,
    questions: [],
    answers: [],
    data: null,
    error: '',
    startedAt: new Date().toISOString(),
  };
  activeJob = job;
  emit();

  job.promise = (async () => {
    try {
      let questions = await generateQuiz({
        category: product.category,
        productTitle,
        url: productUrl,
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

/** Rapor üretimi. Ücret quiz adımında alındı — burada TEKRAR ALINMAZ. */
export function runProductAnalysisJob({ product, lang, user, answers = [], similar = [], offers = [], productTitle }) {
  if (!activeJob) return null;
  const job = activeJob;
  setJob({ answers, phase: 'analyzing', stage: 'prep', error: '' });
  const startedAt = Date.now();

  job.promise = (async () => {
    try {
      let research = '';
      try {
        if (activeJob && activeJob.id === job.id) setJob({ stage: 'research' });
        research = await askQorAiGrounded(
          buildProductResearchPrompt(product, lang, { quizAnswers: answers }),
          { language: lang, maxOutputTokens: 2048 },
        );
      } catch { research = ''; }
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ stage: 'report' });

      const prompt = buildFullPrompt(product, lang, aiUserProfile(user), {
        quizAnswers: answers, research, similarProducts: similar, offers,
      });
      let txt = await askQorAiRaw({
        system: `You are Qor AI. Return only valid JSON in language code ${lang}. Use current research and Qor catalog context over stale model memory. Every user-facing text field must be in the requested language; keep only brand/product names and technical terms as-is.`,
        user: prompt,
        maxOutputTokens: 8192,
        temperature: 0.45,
        jsonMode: true,
      });
      let data = parseAiJson(txt);
      // Tazelik onarım denemesi — süre kaldıysa. Ayrıştırılabilir (biraz bayat
      // olsa da) bir rapor, hata ekranından iyidir.
      if ((!data || typeof data !== 'object' || hasStaleAvailabilityClaims(txt)) && Date.now() - startedAt < 95000) {
        const retry = await askQorAiRaw({
          system: `You are Qor AI. Return only valid JSON in language code ${lang}. This is a freshness-critical retry; remove stale launch/availability assumptions. Every user-facing text field must be in the requested language.`,
          user: withFreshnessRetryInstruction(prompt, [productTitle]),
          maxOutputTokens: 8192,
          temperature: 0.25,
          jsonMode: true,
        });
        const retryData = parseAiJson(retry);
        if (retryData && typeof retryData === 'object' && !hasStaleAvailabilityClaims(retry)) {
          txt = retry;
          data = retryData;
        }
      }
      if (!data || typeof data !== 'object') throw new Error('parse');
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ stage: 'composing' });
      setJob({ data, phase: 'result', stage: null });
      try { await saveProductAnalysisHistory({ product, analysis: txt }); } catch { /* geçmiş yazımı analizi bozmasın */ }
    } catch {
      if (!activeJob || activeJob.id !== job.id) return;
      // Hata quiz'e GERİ DÖNDÜRMEZ (eski "quiz tekrar geliyor" hatası):
      // aynı cevaplarla tekrar denenebilsin diye error aşamasında kalır.
      setJob({ phase: 'error', stage: null, error: 'ANALYSIS_FAILED' });
    }
  })();
  return cloneJob(job);
}
