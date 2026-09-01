import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import {
  featureCost, formatQorCoins, hasCompletedQuiz, spendQorCoins,
} from './qorCoins';
import { modeOn } from './siteMode';

function messageFor(code, { feature, cost, balance, lang }) {
  const l = String(lang || 'en').slice(0, 2).toLowerCase();
  const amount = formatQorCoins(cost ?? featureCost(feature), l);
  const bal = formatQorCoins(balance ?? 0, l);
  if (l === 'tr') {
    if (code === 'FEATURE_DISABLED') {
      return 'Bu özellik şu anda kapalı. Hazır analizleri Analizler bölümünden okuyabilirsin.';
    }
    if (code === 'AUTH_REQUIRED') {
      return `Bu AI özelliği için giriş yapmalısın. İşlem ücreti: ${amount} Qor Coin.`;
    }
    if (code === 'QUIZ_REQUIRED') {
      return 'AI özellikleri için önce profil quizini tamamlamalısın. Seni quiz sayfasına yönlendiriyorum.';
    }
    if (code === 'INSUFFICIENT_QOR_COINS') {
      return `Qor Coin bakiyen yetersiz — analiz başlatılmadı. Bu işlem ${amount} Qor Coin, bakiyen ${bal}. Sınırsız AI için Premium'a geçebilirsin.`;
    }
    return 'AI erişimi hazırlanamadı. Lütfen tekrar dene.';
  }
  
  if (code === 'FEATURE_DISABLED') return 'This feature is currently turned off. You can read the published analyses in the Analyses section.';
  if (code === 'AUTH_REQUIRED') return `Sign in to use this AI feature. Cost: ${amount} Qor Coin.`;
  if (code === 'QUIZ_REQUIRED') return 'Complete the profile quiz first. Sending you to the quiz page.';
  if (code === 'INSUFFICIENT_QOR_COINS') return `Not enough Qor Coin — the analysis was not started. This costs ${amount} and your balance is ${bal}. You can go Premium for unlimited AI.`;
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

    // EMNİYET KİLİDİ — ziyaretçinin başlattığı HER AI işi buradan geçer
    // (ürün, karşılaştırma, link, abonelik, sohbet). Arayüzde gözden kaçan
    // bir düğme kalsa bile burada durur: ne Qor Coin harcanır ne AI çağrısı
    // yapılır. Gizlemeyi yalnız görsel katmana bırakmamanın sebebi bu.
    if (!modeOn('userAi')) {
      const message = sendMessage('FEATURE_DISABLED');
      return { ok: false, reason: 'FEATURE_DISABLED', message };
    }

    if (!user) {
      const message = sendMessage('AUTH_REQUIRED');
      openAuth();
      return { ok: false, reason: 'AUTH_REQUIRED', message };
    }

    // Quiz modu kapalıyken AI kapısı quiz şartı ARAMAZ: `/quiz` rotası
    // `/`'a gidiyor, şart bırakılsaydı kullanıcı hiç geçemeyeceği bir
    // kapıya yönlendirilirdi.
    if (modeOn('quiz') && requireQuiz && !hasCompletedQuiz(user)) {
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
      // BAKİYE BİTTİĞİNDE ARTIK OTOMATİK YÖNLENDİRME YOK (2026-08-07).
      // Eskiden 900 ms sonra /premium'a atıyorduk: kullanıcı ekranda beliren
      // "yetersiz bakiye" yazısını okuyamadan sayfa değişiyordu, dolayısıyla
      // analizin neden başlamadığını hiç öğrenemiyordu. Artık mesajı yerinde
      // gösteriyoruz; Premium'a gitmek kullanıcının kendi kararı (çağıran ekran
      // mesajın yanında bir Premium bağlantısı çiziyor).
      return { ok: false, reason: code, message, cost: e?.cost, balance: e?.balance };
    }
  }, [lang, location.hash, location.pathname, location.search, navigate, openAuth, user]);
}
