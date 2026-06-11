import { currentUser, pb } from './pocketbase';
import { premiumStatus } from './premium';

export const AI_FEATURE_COSTS = {
  ai_question: 0.5,
  ai_chat: 0.5,
  compare_ai: 2,
  detail_ai: 1,
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

export function markQuizCompletedLocal(userId) {
  try { localStorage.setItem(QUIZ_DONE_KEY, String(userId || '1')); } catch { /* storage blocked */ }
}

export function hasCompletedQuiz(user) {
  if (user?.quizCompleted === true) return true;
  if (!user?.id) return false;
  try {
    const v = localStorage.getItem(QUIZ_DONE_KEY);
    return !!v && (v === '1' || v === String(user.id));
  } catch { return false; }
}

export function aiUserProfile(user) {
  if (!user) return {};
  return {
    quizCompleted: user.quizCompleted === true,
    ageRange: user.ageRange || '',
    gender: user.gender || '',
    ecosystem: user.ecosystem || 'mixed',
    budgetRange: user.budgetRange || user.budgetPreference || '',
    priorities: Array.isArray(user.priorities) ? user.priorities : [],
    currentDevices: Array.isArray(user.currentDevices) ? user.currentDevices : [],
    subscriptions: Array.isArray(user.subscriptions) ? user.subscriptions : [],
    country: user.country || '',
    language: user.language || '',
    currency: user.currency || '',
    interestCategories: Array.isArray(user.interestCategories) ? user.interestCategories : [],
    usageIntent: user.usageIntent || user.usageReason || '',
    profession: user.profession || '',
    primaryCategory: user.primaryCategory || '',
    profileVector: user.profileVector && typeof user.profileVector === 'object'
      ? user.profileVector
      : {},
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
