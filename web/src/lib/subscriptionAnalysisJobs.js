import {
  generateSubscriptionQuiz,
  subscriptionAnalysis,
} from './linkAnalysis';
import { saveSubscriptionHistory } from './pbHistory';

const STORAGE_KEY = 'qor.subscriptionAnalysis.activeJob';
const listeners = new Set();
let activeJob = null;

function cloneJob(job = activeJob) {
  if (!job) return null;
  const { promise, ...rest } = job;
  return {
    ...rest,
    services: [...(rest.services || [])],
    questions: [...(rest.questions || [])],
  };
}

function persist() {
  try {
    if (!activeJob) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(cloneJob()));
  } catch {
    // Storage restores UI state; the active promise lives in this module.
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

function newJob({ services, language, userProfile }) {
  activeJob = {
    id: `subscription_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'subscription',
    services,
    language,
    userProfile,
    phase: 'quizLoading',
    questions: [],
    result: null,
    error: '',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    savedAt: '',
    savedId: '',
  };
  emit();
  return activeJob;
}

async function completeSubscription(job, answers = []) {
  if (!activeJob || activeJob.id !== job.id) return;
  setJob({ phase: 'analyzing', error: '' });
  try {
    const data = await subscriptionAnalysis({
      subscriptionNames: job.services,
      answers,
      language: job.language,
      userProfile: job.userProfile,
    });
    if (!data.services.length) throw new Error('empty analysis');
    const analysis = data.recommendation
      || data?.winner?.recommendation
      || data?.winner?.reason
      || data?.services?.map((s) => s.name).filter(Boolean).join(' vs ')
      || 'Qor AI subscription analysis';
    const saved = await saveSubscriptionHistory({
      services: job.services,
      quiz: answers,
      analysis,
      scores: data.scores,
      result: data,
    });
    setJob({
      phase: 'result',
      result: data,
      savedAt: new Date().toISOString(),
      savedId: saved?.id || '',
    });
  } catch {
    setJob({ phase: 'select', error: 'ANALYSIS_FAILED' });
  }
}

export function subscribeSubscriptionAnalysisJob(cb) {
  listeners.add(cb);
  cb(cloneJob());
  return () => listeners.delete(cb);
}

export function getActiveSubscriptionAnalysisJob() {
  return cloneJob();
}

export function clearSubscriptionAnalysisJob(id) {
  if (!activeJob) return;
  if (id && activeJob.id !== id) return;
  activeJob = null;
  emit();
}

export function startSubscriptionAnalysisJob({ services, language, userProfile }) {
  const job = newJob({ services, language, userProfile });
  job.promise = (async () => {
    try {
      let questions = [];
      try {
        questions = await generateSubscriptionQuiz({
          subscriptionNames: services,
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
        await completeSubscription(job, []);
      }
    } catch {
      if (!activeJob || activeJob.id !== job.id) return;
      setJob({ phase: 'select', error: 'QUIZ_FAILED' });
    }
  })();
  return cloneJob(job);
}

export async function submitSubscriptionAnalysisJobAnswers(id, answers = [], userProfile = null) {
  if (!activeJob || activeJob.id !== id) return;
  if (userProfile) setJob({ userProfile });
  await completeSubscription(activeJob, answers);
}
