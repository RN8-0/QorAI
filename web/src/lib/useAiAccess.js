import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import {
  featureCost, formatQorCoins, hasCompletedQuiz, spendQorCoins,
} from './qorCoins';

function messageFor(code, { feature, cost, balance, lang }) {
  const l = String(lang || 'en').slice(0, 2).toLowerCase();
  const amount = formatQorCoins(cost ?? featureCost(feature), l);
  const bal = formatQorCoins(balance ?? 0, l);
  if (l === 'tr') {
    if (code === 'AUTH_REQUIRED') {
      return `Bu AI özelliği için giriş yapmalısın. İşlem ücreti: ${amount} Qor Coin.`;
    }
    if (code === 'QUIZ_REQUIRED') {
      return 'AI özellikleri için önce profil quizini tamamlamalısın. Seni quiz sayfasına yönlendiriyorum.';
    }
    if (code === 'INSUFFICIENT_QOR_COINS') {
      return `Yetersiz Qor Coin. Bu işlem ${amount} Qor Coin, bakiyen ${bal}. Sınırsız AI için Premium'a geç.`;
    }
    return 'AI erişimi hazırlanamadı. Lütfen tekrar dene.';
  }
  if (l === 'de') {
    if (code === 'AUTH_REQUIRED') return `Sign in to use this AI feature. Cost: ${amount} Qor Coin.`;
    if (code === 'QUIZ_REQUIRED') return 'Complete the profile quiz first. Sending you to the quiz page.';
    if (code === 'INSUFFICIENT_QOR_COINS') return `Not enough Qor Coin. This costs ${amount}, your balance is ${bal}. Go Premium for unlimited AI.`;
    return 'AI access could not be prepared. Please try again.';
  }
  if (code === 'AUTH_REQUIRED') return `Sign in to use this AI feature. Cost: ${amount} Qor Coin.`;
  if (code === 'QUIZ_REQUIRED') return 'Complete the profile quiz first. Sending you to the quiz page.';
  if (code === 'INSUFFICIENT_QOR_COINS') return `Not enough Qor Coin. This costs ${amount}, your balance is ${bal}. Go Premium for unlimited AI.`;
  return 'AI access could not be prepared. Please try again.';
}

export function useAiAccess(lang = 'en') {
  const { user, openAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(async (feature, opts = {}) => {
    const requireQuiz = opts.requireQuiz !== false;
    const sendMessage = (code, extra = {}) => {
      const message = messageFor(code, {
        feature,
        lang,
        cost: extra.cost,
        balance: extra.balance,
      });
      opts.onMessage?.(message, code);
      return message;
    };

    if (!user) {
      const message = sendMessage('AUTH_REQUIRED');
      openAuth();
      return { ok: false, reason: 'AUTH_REQUIRED', message };
    }

    if (requireQuiz && !hasCompletedQuiz(user)) {
      const message = sendMessage('QUIZ_REQUIRED');
      const next = `${location.pathname}${location.search}${location.hash}`;
      navigate(`/quiz?required=1&next=${encodeURIComponent(next)}`);
      return { ok: false, reason: 'QUIZ_REQUIRED', message };
    }

    try {
      const receipt = await spendQorCoins(feature);
      return { ok: true, ...receipt };
    } catch (e) {
      const code = e?.code || 'AI_ACCESS_ERROR';
      const message = sendMessage(code, e);
      if (code === 'AUTH_REQUIRED') openAuth();
      return { ok: false, reason: code, message };
    }
  }, [lang, location.hash, location.pathname, location.search, navigate, openAuth, user]);
}
