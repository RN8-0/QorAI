import {
  analyzeLink,
  awaitResearch,
  compareAnalysis,
  enhancedAnalysis,
  generateCompareQuiz,
  generateQuiz,
  researchProductCommunity,
  researchProductsCommunity,
} from './linkAnalysis';
import { saveLinkAnalysisHistory } from './pbHistory';

const STORAGE_KEY = 'qor.linkAnalysis.activeJob';
const listeners = new Set();
let activeJob = null;
const RESTORABLE_PHASES = new Set(['quiz', 'result']);

// GROUNDED YORUM ARAŞTIRMASI, kullanıcı quizi çözerken arka planda koşar —
// böylece rapor çok daha derin olur ama BEKLEME SÜRESİ ARTMAZ. Promise'i
// job nesnesinde tutamayız (job localStorage'a serileştiriliyor), o yüzden
// id → promise haritası.
const researchByJob = new Map();
function startResearch(id, promise) {
  researchByJob.set(id, promise);
}
function takeResearch(id) {
  const p = researchByJob.get(id);
  researchByJob.delete(id);
  return p;
}

function cloneJob(job = activeJob) {
  if (!job) return null;
  const { promise, ...rest } = job;
  return {
    ...rest,
    urls: [...(rest.urls || [])],
    questions: [...(rest.questions || [])],
    bases: [...(rest.bases || [])],
  };
}

function persist() {
  try {
    if (!activeJob) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(cloneJob()));
  } catch {
    // Storage is only for UI restore; the running promise lives in memory.
  }
}

function hydrateFromStorage() {
  if (activeJob || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const job = JSON.parse(raw);
    if (!job?.id || !RESTORABLE_PHASES.has(job.phase)) return;
    activeJob = { ...job, promise: null };
  } catch {
    // Ignore corrupt persisted UI state; a fresh analysis can overwrite it.
  }
}

function emit() {
  persist();
  const snapshot = cloneJob();
  listeners.forEach((cb) => {
    try { cb(snapshot); } catch { /* listener UI must not break the job */ }
  });
}

function setJob(patch) {
  if (!activeJob) return;
  activeJob = { ...activeJob, ...patch, updatedAt: new Date().toISOString() };
  emit();
}

function newJob({ type, urls, language, userProfile }) {
  activeJob = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    urls,
    language,
    userProfile,
    phase: 'identifying',
    stage: null,
    researched: false,
    bases: [],
    base: null,
    questions: [],
    enhanced: null,
    compareResult: null,
    compareText: '',
    error: '',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    savedAt: '',
  };
  emit();
  return activeJob;
}

function fallbackEnhancedResult(base) {
  return {
    base,
    enhancedScore: Number(base?.score) || 60,
    factors: [],
    verdict: String(base?.analysis || ''),
    prosForUser: [],
    consForUser: [],
    alternatives: [],
    personaScore: null,
    personaAnalysis: '',
    communityScore: null,
    communityAnalysis: '',
    overallVerdict: '',
  };
}

async function completeSingle(job, answers = []) {
  if (!activeJob || activeJob.id !== job.id) return;
  setJob({ phase: 'analyzing', stage: 'research', error: '' });
  const base = activeJob.base;
  // Quiz sırasında başlatılan tarama genelde çoktan bitmiştir; bitmediyse
  // burada (üst sınırla) beklenir ve tahta "yorumlar taranıyor"da durur.
  const research = await awaitResearch(takeResearch(job.id));
  if (!activeJob || activeJob.id !== job.id) return;
  setJob({ stage: 'report', researched: Boolean(research) });
  let data;
  try {
    data = await enhancedAnalysis({
      base,
      answers,
      language: job.language,
      userProfile: job.userProfile,
      research,
    });
  } catch {
    data = fallbackEnhancedResult(base);
  }
  const saved = await saveLinkAnalysisHistory({
    urls: [base.url],
    analysis: data.verdict,
    type: 'single',
    result: data,
  });
  setJob({
    phase: 'result',
    enhanced: data,
    compareText: '',
    savedAt: new Date().toISOString(),
    savedId: saved?.id || '',
  });
}

async function completeCompare(job, answers = []) {
  if (!activeJob || activeJob.id !== job.id) return;
  setJob({ phase: 'analyzing', stage: 'research', error: '' });
  const bases = activeJob.bases || [];
  const research = await awaitResearch(takeResearch(job.id));
  if (!activeJob || activeJob.id !== job.id) return;
  setJob({ stage: 'report', researched: Boolean(research) });
  try {
    const text = await compareAnalysis({
      bases,
      answers,
      language: job.language,
      userProfile: job.userProfile,
      research,
    });
    const comparisonSummary = text.recommendation
      || text?.winner?.reason
      || text?.products?.map((p) => p.name).filter(Boolean).join(' vs ')
      || 'Qor AI comparison';
    const saved = await saveLinkAnalysisHistory({
      urls: job.urls,
      analysis: comparisonSummary,
      type: 'compare',
      result: text,
    });
    setJob({
      phase: 'result',
      enhanced: null,
      compareResult: text,
      compareText: '',
      savedAt: new Date().toISOString(),
      savedId: saved?.id || '',
    });
  } catch (e) {
    setJob({ phase: 'input', error: 'COMPARE_FAILED' });
  }
}

export function subscribeLinkAnalysisJob(cb) {
  hydrateFromStorage();
  listeners.add(cb);
  cb(cloneJob());
  return () => listeners.delete(cb);
}

export function getActiveLinkAnalysisJob() {
  hydrateFromStorage();
  return cloneJob();
}

export function clearLinkAnalysisJob(id) {
  if (!activeJob) return;
  if (id && activeJob.id !== id) return;
  takeResearch(activeJob.id); // askıdaki taramanın referansını bırak
  activeJob = null;
  emit();
}

export function startSingleLinkAnalysisJob({ url, language, userProfile }) {
  const job = newJob({ type: 'single', urls: [url], language, userProfile });
  job.promise = (async () => {
    try {
      const result = await analyzeLink(url, language, userProfile);
      if (!activeJob || activeJob.id !== job.id) return;
      if (result.isProduct === false) {
        setJob({ phase: 'input', error: 'NOT_PRODUCT' });
        return;
      }
      // Ürün belli oldu → yorum taraması ŞİMDİ başlar ve quiz boyunca koşar.
      startResearch(job.id, researchProductCommunity({
        title: result.title,
        category: result.category,
        url: result.url,
        siteName: result.siteName,
        language,
      }));
      setJob({ phase: 'quizLoading', base: result, bases: [result] });
      let questions = [];
      try {
        questions = await generateQuiz({
          category: result.category,
          productTitle: result.title,
          url,
          language,
          userProfile,
        });
      } catch {
        questions = [];
      }
      if (!activeJob || activeJob.id !== job.id) return;
      if (questions.length) {
        setJob({ phase: 'quiz', questions });
      } else {
        await completeSingle(job, []);
      }
    } catch (e) {
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ phase: 'input', error: 'ANALYSIS_FAILED' });
    }
  })();
  return cloneJob(job);
}

export function startCompareLinkAnalysisJob({ urls, language, userProfile }) {
  const job = newJob({ type: 'compare', urls, language, userProfile });
  job.promise = (async () => {
    try {
      const bases = [];
      for (const url of urls) {
        const result = await analyzeLink(url, language, userProfile);
        if (!activeJob || activeJob.id !== job.id) return;
        if (result.isProduct === false) {
          setJob({ phase: 'input', error: 'NOT_PRODUCT' });
          return;
        }
        bases.push(result);
        setJob({ bases: [...bases] });
      }
      if (!activeJob || activeJob.id !== job.id) return;
      // Tüm ürünler tanındı → karşılaştırmalı yorum taraması quizle paralel.
      startResearch(job.id, researchProductsCommunity({ bases, language }));
      setJob({ phase: 'quizLoading', bases });
      let questions = [];
      try {
        questions = await generateCompareQuiz({
          products: bases,
          language,
          userProfile,
        });
      } catch {
        questions = [];
      }
      if (!activeJob || activeJob.id !== job.id) return;
      if (questions.length) {
        setJob({ phase: 'quiz', questions });
      } else {
        await completeCompare(job, []);
      }
    } catch {
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ phase: 'input', error: 'ANALYSIS_FAILED' });
    }
  })();
  return cloneJob(job);
}

export async function submitLinkAnalysisJobAnswers(id, answers = [], userProfile = null) {
  if (!activeJob || activeJob.id !== id) return;
  if (userProfile) setJob({ userProfile });
  const job = activeJob;
  if (job.type === 'compare') await completeCompare(job, answers);
  else await completeSingle(job, answers);
}
