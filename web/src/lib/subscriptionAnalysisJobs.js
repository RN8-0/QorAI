import {
  awaitResearch,
  generateSubscriptionQuiz,
  researchSubscriptionsCommunity,
  subscriptionAnalysis,
} from './linkAnalysis';
import { saveSubscriptionHistory } from './pbHistory';

const STORAGE_KEY = 'qor.subscriptionAnalysis.activeJob';
const listeners = new Set();
let activeJob = null;

// Yorum taraması quiz sırasında arka planda koşar (link akışıyla aynı desen).
const researchByJob = new Map();
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

// İş zaten localStorage'a YAZILIYORDU ama hiçbir yerde GERİ OKUNMUYORDU:
// sayfa yenilenince biten abonelik raporu kayboluyordu (link analizinde
// böyle değil). Link akışıyla aynı kural: yalnız kullanıcı girdisi bekleyen
// ya da bitmiş işler geri yüklenir; yarım kalan AI çağrısı geri gelmez.
const RESTORABLE_PHASES = new Set(['quiz', 'result']);
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

function newJob({ services, language, userProfile }) {
  activeJob = {
    id: `subscription_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'subscription',
    services,
    language,
    userProfile,
    phase: 'quizLoading',
    stage: null,
    researched: false,
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
  setJob({ phase: 'analyzing', stage: 'research', error: '' });
  const research = await awaitResearch(takeResearch(job.id));
  if (!activeJob || activeJob.id !== job.id) return;
  setJob({ stage: 'report', researched: Boolean(research) });
  try {
    const data = await subscriptionAnalysis({
      subscriptionNames: job.services,
      answers,
      language: job.language,
      userProfile: job.userProfile,
      research,
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
  hydrateFromStorage();
  listeners.add(cb);
  cb(cloneJob());
  return () => listeners.delete(cb);
}

export function getActiveSubscriptionAnalysisJob() {
  hydrateFromStorage();
  return cloneJob();
}

export function clearSubscriptionAnalysisJob(id) {
  if (!activeJob) return;
  if (id && activeJob.id !== id) return;
  takeResearch(activeJob.id);
  activeJob = null;
  emit();
}

export function startSubscriptionAnalysisJob({ services, language, userProfile }) {
  const job = newJob({ services, language, userProfile });
  // Servisler belli → yorum taraması quiz hazırlığıyla AYNI anda başlar.
  researchByJob.set(job.id, researchSubscriptionsCommunity({ names: services, language }));
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
