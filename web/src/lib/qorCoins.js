import { currentUser, pb } from './pocketbase';
import { premiumStatus } from './premium';

export const AI_FEATURE_COSTS = {
  // Keep these in sync with lib/core/constants.dart.
  ai_question: 0.5,
  ai_chat: 0.5,
  compare_ai: 2,
  detail_ai: 1,
  detail_ai_full: 1,
  detail_match_ai: 1,
  detail_match: 1,
  link_paste: 2,
  link_analysis: 2,
  link_compare: 3,
  subscription_analysis: 2,
  product_scan: 3,
};

function err(code, extra = {}) {
  const e = new Error(code);
  e.code = code;
  Object.assign(e, extra);
  return e;
}

export function featureCost(feature) {
  return AI_FEATURE_COSTS[feature] ?? 1;
}

export function qCoinBalance(user) {
  const n = Number(user?.bonusQCoins);
  return Number.isFinite(n) ? n : 0;
}

export function formatQorCoins(amount, lang = 'en') {
  const n = Number(amount) || 0;
  const rounded = Math.round(n * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return String(lang).slice(0, 2).toLowerCase() === 'tr'
    ? text.replace('.', ',')
    : text;
}

// Some PocketBase deployments don't persist the `quizCompleted` flag on the
// users row (schema drift vs. the app), which made the website bounce the user
// back to the quiz right after they finished it. We mirror completion into
// localStorage (keyed per user) so the gate never loops on this browser, no
// matter what the server echoes back.
const QUIZ_DONE_KEY = 'qor.quizCompleted';
const QUIZ_ANSWERS_KEY = 'qor.quizAnswers';

export function markQuizCompletedLocal(userId) {
  try { localStorage.setItem(QUIZ_DONE_KEY, String(userId || '1')); } catch { /* storage blocked */ }
}

// PocketBase drops some onboarding columns (interestCategories, priorities…) on
// save, so the server can't always echo a full profile back. We mirror the exact
// submitted answers into localStorage (per user) so the quiz summary and the AI
// quiz personalization stay correct on this browser regardless of PB schema.
export function saveQuizAnswersLocal(userId, answers) {
  try {
    if (answers && typeof answers === 'object') {
      localStorage.setItem(`${QUIZ_ANSWERS_KEY}.${userId || '1'}`, JSON.stringify(answers));
    }
  } catch { /* storage blocked */ }
}

export function readQuizAnswersLocal(userId) {
  try {
    const raw = localStorage.getItem(`${QUIZ_ANSWERS_KEY}.${userId || '1'}`)
      || localStorage.getItem(`${QUIZ_ANSWERS_KEY}.1`);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

export function hasCompletedQuiz(user) {
  if (user?.quizCompleted === true) return true;
  // The mobile app fills the same `users` row. On some accounts the
  // `quizCompleted` bool didn't round-trip (older record / schema drift), but
  // the profile data did — so a user who already did the quiz in the app would
  // wrongly be asked again on web. Treat a populated profile as completed.
  if (Array.isArray(user?.quizHistory) && user.quizHistory.length > 0) return true;
  if (Array.isArray(user?.interestCategories) && user.interestCategories.length >= 3
    && (user.ecosystem || user.budgetRange)) return true;
  if (!user?.id) return false;
  try {
    const v = localStorage.getItem(QUIZ_DONE_KEY);
    return !!v && (v === '1' || v === String(user.id));
  } catch { return false; }
}

export function aiUserProfile(user) {
  if (!user) return {};
  const vector = user.profileVector && typeof user.profileVector === 'object' ? user.profileVector : {};
  // The onboarding signals (profession, hobbies, priorities, categories…) drive
  // how the AI quizzes are personalized. Some PocketBase deployments don't have
  // every column and silently drop those fields on save, so the dedicated field
  // comes back empty and the AI falls back to generic (often software-leaning)
  // questions even for, say, a teacher. The profileVector JSON *does* persist
  // and encodes every signal, so reconstruct any empty field from it.
  const vecVals = (prefix) => Object.keys(vector)
    .filter((k) => k.startsWith(prefix) && vector[k])
    .map((k) => k.slice(prefix.length))
    .filter(Boolean);
  // Locally-cached answers (this browser) are the most reliable source when PB
  // drops columns; fall back to the dedicated field, then the profileVector.
  const cached = readQuizAnswersLocal(user.id);
  const arrField = (val, key, prefix) => {
    if (Array.isArray(val) && val.length) return val;
    if (cached && Array.isArray(cached[key]) && cached[key].length) return cached[key].filter((x) => x !== 'none');
    return vecVals(prefix);
  };
  const strField = (val, key, prefix) => val || (cached && cached[key]) || vecVals(prefix)[0] || '';
  const hobbies = arrField(user.hobbies, 'hobbies', 'hobby_');
  // Question texts the user has already answered in earlier quizzes, so the
  // generator can skip what we already know instead of re-asking it.
  const pastQuizQuestions = [];
  if (Array.isArray(user.quizHistory)) {
    for (const entry of user.quizHistory.slice(0, 8)) {
      const ans = Array.isArray(entry?.answers) ? entry.answers : [];
      for (const a of ans) {
        const q = String(a?.question || '').trim();
        if (q && !pastQuizQuestions.includes(q)) pastQuizQuestions.push(q);
      }
    }
  }
  return {
    quizCompleted: hasCompletedQuiz(user),
    ageRange: user.ageRange || '',
    gender: user.gender || '',
    ecosystem: user.ecosystem || 'mixed',
    budgetRange: user.budgetRange || user.budgetPreference || '',
    priorities: arrField(user.priorities, 'priorities', 'priority_'),
    currentDevices: arrField(user.currentDevices, 'currentDevices', 'device_'),
    subscriptions: arrField(user.subscriptions, 'subscriptions', 'subscription_'),
    country: user.country || '',
    language: user.language || '',
    currency: user.currency || '',
    interestCategories: arrField(user.interestCategories, 'interestCategories', 'category_'),
    usageIntent: strField(user.usageIntent || user.usageReason, 'usageIntent', 'usage_'),
    profession: strField(user.profession, 'profession', 'profession_'),
    hobbies,
    pastQuizQuestions: pastQuizQuestions.slice(0, 24),
    primaryCategory: user.primaryCategory || '',
    profileVector: vector,
  };
}

export async function spendQorCoins(feature) {
  const authUser = currentUser();
  if (!authUser?.id) throw err('AUTH_REQUIRED');

  const cost = featureCost(feature);
  let latest;
  try {
    latest = await pb.collection('users').getOne(authUser.id);
  } catch {
    throw err('AUTH_REQUIRED');
  }

  if (premiumStatus(latest).isPremium) {
    pb.authStore.save(pb.authStore.token, latest);
    return { user: latest, cost: 0, balance: qCoinBalance(latest), premium: true };
  }

  const balance = qCoinBalance(latest);
  if (balance + 1e-9 < cost) {
    pb.authStore.save(pb.authStore.token, latest);
    throw err('INSUFFICIENT_QOR_COINS', { cost, balance });
  }

  const nextBalance = Math.max(0, Math.round((balance - cost) * 10) / 10);
  const updated = await pb.collection('users').update(authUser.id, { bonusQCoins: nextBalance });
  pb.authStore.save(pb.authStore.token, updated);
  return { user: updated, cost, balance: nextBalance, premium: false };
}
