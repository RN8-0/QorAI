import {
  analyzeLink,
  compareAnalysis,
  enhancedAnalysis,
  generateCompareQuiz,
  generateQuiz,
} from './linkAnalysis';
import { saveLinkAnalysisHistory } from './pbHistory';

const STORAGE_KEY = 'qor.linkAnalysis.activeJob';
const listeners = new Set();
let activeJob = null;

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
    bases: [],
    base: null,
    questions: [],
    enhanced: null,
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
  setJob({ phase: 'analyzing', error: '' });
  const base = activeJob.base;
  let data;
  try {
    data = await enhancedAnalysis({
      base,
      answers,
      language: job.language,
      userProfile: job.userProfile,
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
  setJob({ phase: 'analyzing', error: '' });
  const bases = activeJob.bases || [];
  try {
    const text = await compareAnalysis({
      bases,
      answers,
      language: job.language,
      userProfile: job.userProfile,
    });
    const saved = await saveLinkAnalysisHistory({
      urls: job.urls,
      analysis: text,
      type: 'compare',
      result: {
        type: 'compare',
        bases,
        answers,
        text,
      },
    });
    setJob({
      phase: 'result',
      enhanced: null,
      compareText: text,
      savedAt: new Date().toISOString(),
      savedId: saved?.id || '',
    });
  } catch (e) {
    setJob({ phase: 'input', error: 'COMPARE_FAILED' });
  }
}

export function subscribeLinkAnalysisJob(cb) {
  listeners.add(cb);
  cb(cloneJob());
  return () => listeners.delete(cb);
}

export function getActiveLinkAnalysisJob() {
  return cloneJob();
}

export function clearLinkAnalysisJob(id) {
  if (!activeJob) return;
  if (id && activeJob.id !== id) return;
  activeJob = null;
  emit();
}

export function startSingleLinkAnalysisJob({ url, language, userProfile }) {
  const job = newJob({ type: 'single', urls: [url], language, userProfile });
  job.promise = (async () => {
    try {
      const result = await analyzeLink(url, language, userProfile);
      if (!activeJob || activeJob.id !== job.id) return;
      if (result.isProduct === false && !result.title) {
        setJob({ phase: 'input', error: 'NOT_PRODUCT' });
        return;
      }
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
        bases.push(result);
        if (!activeJob || activeJob.id !== job.id) return;
        setJob({ bases: [...bases] });
      }
      if (!activeJob || activeJob.id !== job.id) return;
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
