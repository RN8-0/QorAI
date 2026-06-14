import { currentUser, pb } from './pocketbase';
import { premiumStatus } from './premium';

export const AI_FEATURE_COSTS = {
  // Chat: every Qor AI reply costs 1 Qor Coin.
  ai_question: 1,
  ai_chat: 1,
  // Analysis actions cost 2 Qor Coins each (product detail, compare, link, subs).
  compare_ai: 2,
  detail_ai: 2,
  detail_ai_full: 2,
  detail_match_ai: 2,
  detail_match: 2,
  link_paste: 2,
  link_analysis: 2,
  link_compare: 2,
  subscription_analysis: 2,
  product_scan: 2,
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
  // Hobbies feed quiz/AI personalization. Prefer the dedicated field; fall back
  // to the `hobby_*` keys captured in the onboarding profile vector so it still
  // works even if the PB column has not been provisioned yet.
  const hobbies = Array.isArray(user.hobbies) && user.hobbies.length
    ? user.hobbies
    : Object.keys(vector).filter((k) => k.startsWith('hobby_')).map((k) => k.slice(6));
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
    priorities: Array.isArray(user.priorities) ? user.priorities : [],
    currentDevices: Array.isArray(user.currentDevices) ? user.currentDevices : [],
    subscriptions: Array.isArray(user.subscriptions) ? user.subscriptions : [],
    country: user.country || '',
    language: user.language || '',
    currency: user.currency || '',
    interestCategories: Array.isArray(user.interestCategories) ? user.interestCategories : [],
    usageIntent: user.usageIntent || user.usageReason || '',
    profession: user.profession || '',
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
