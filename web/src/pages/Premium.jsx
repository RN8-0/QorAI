import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import { premiumStatus } from '../lib/premium';
import { formatQorCoins } from '../lib/qorCoins';
import PlayBadge, { PlayGlyph } from '../components/PlayBadge.jsx';
import Reveal from '../components/Reveal.jsx';
import './Premium.css';

const PACKAGE_ID = 'com.compair.app';
const PLAY_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_ID}`;
const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

const TRIAL_DAYS = 3;
const WELCOME_Q_COINS = 20;
const FREE_COMPARISON_LIMIT = 5;
const FREE_COLLECTION_LIMIT = 10;
const FREE_PRICE_HISTORY_DAYS = 7;
const PRO_PRICE_HISTORY_DAYS = 90;
const MONTHLY_PRICE = 3.99;
const YEARLY_PRICE = 19.99;
const MONTHLY_PRODUCT_ID = 'aylik_abonelik';
const YEARLY_PRODUCT_ID = 'yillik_abonelik';

const COSTS = {
  chat: 0.5,
  compareAi: 2,
  detailAi: 1,
  matchAi: 1,
  linkAnalysis: 2,
  linkCompare: 3,
  subscriptionAnalysis: 2,
  productScan: 3,
};

function price(value) {
  return `$${value.toFixed(2)}`;
}

function languageTag(lang) {
  if (lang === 'tr') return 'tr-TR';
  if (lang === 'de') return 'de-DE';
  return 'en-US';
}

function formatDate(value, lang) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(languageTag(lang), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function productPlan(productId) {
  const id = String(productId || '').toLowerCase();
  if (id.includes('year') || id.includes('yillik')) return 'yearly';
  if (id.includes('month') || id.includes('aylik')) return 'monthly';
  return 'premium';
}

function manageUrl(productId) {
  const url = new URL(PLAY_SUBSCRIPTIONS_URL);
  url.searchParams.set('package', PACKAGE_ID);
  const id = String(productId || '').trim();
  if (id) url.searchParams.set('sku', id);
  return url.toString();
}

function playUrl(planId) {
  const url = new URL(PLAY_URL);
  url.searchParams.set('utm_source', 'qorai_web');
  url.searchParams.set('utm_medium', 'premium_page');
  url.searchParams.set('selected_plan', planId);
  return url.toString();
}

function qAmount(value, lang) {
  return `${formatQorCoins(value, lang)} Q`;
}

function activePlanLabel(plan, L) {
  if (plan === 'yearly') return L('You are a yearly subscriber', 'Yıllık abonesiniz', 'Sie sind Jahresabonnent');
  if (plan === 'monthly') return L('You are a monthly subscriber', 'Aylık abonesiniz', 'Sie sind Monatsabonnent');
  return L('You are a premium subscriber', 'Premium abonesiniz', 'Sie sind Premium-Abonnent');
}

export default function Premium() {
  const { lang } = useI18n();
  const { user, openAuth, refresh } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [refreshing, setRefreshing] = useState(false);
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);

  const status = useMemo(() => premiumStatus(user), [user]);
  const activePlan = productPlan(status.productId);
  const premiumUntil = formatDate(status.expiresAt, lang);
  const monthlyEquivalent = YEARLY_PRICE / 12;
  const savingsPct = Math.round(((MONTHLY_PRICE * 12 - YEARLY_PRICE) / (MONTHLY_PRICE * 12)) * 100);
  const selected = selectedPlan === 'yearly'
    ? { id: 'yearly', productId: YEARLY_PRODUCT_ID, amount: YEARLY_PRICE, suffix: L('/yr', '/yıl', '/Jahr') }
    : { id: 'monthly', productId: MONTHLY_PRODUCT_ID, amount: MONTHLY_PRICE, suffix: L('/mo', '/ay', '/Monat') };
  const userCoins = user ? qAmount(user.bonusQCoins || 0, lang) : qAmount(WELCOME_Q_COINS, lang);

  useSeo({
    title: `${L('Premium', 'Premium', 'Premium')} - Qor AI`,
    description: L(
      'Unlock the full Qor AI experience with unlimited AI chat, visual scanner, link analysis and premium recommendations.',
      'Sınırsız Qor AI Chat, görsel tarayıcı, link analizi ve premium önerilerle tüm Qor AI deneyiminin kilidini aç.',
      'Schalte das volle Qor AI Erlebnis mit unbegrenztem KI-Chat, visuellem Scanner, Link-Analyse und Premium-Empfehlungen frei.',
    ),
    path: '/premium',
  });

  function startPremium(planId = selectedPlan) {
    if (!user) {
      openAuth();
      return;
    }
    window.open(playUrl(planId), '_blank', 'noopener,noreferrer');
  }

  async function refreshSubscription() {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const momentum = [
    {
      title: L('Decide faster', 'Daha hızlı karar ver', 'Schneller entscheiden'),
      body: L(
        'See the critical product insight in one flow instead of hopping between tabs.',
        'Tek tek sekmeler arasında kaybolmadan, tüm kritik içgörüleri tek akışta görün.',
        'Sieh die wichtigsten Produkt-Insights in einem Ablauf, ohne zwischen Tabs zu springen.',
      ),
    },
    {
      title: L('Feel speed, not limits', 'Sınır değil hız hissi', 'Tempo statt Limits'),
      body: status.isPremium
        ? L(
          'Premium is active, so every AI flow stays open and unlimited.',
          'Premium aktif olduğu için tüm AI akışları doğrudan açık ve limitsiz.',
          'Premium ist aktiv, daher bleiben alle KI-Abläufe offen und unbegrenzt.',
        )
        : L(
          'Premium removes Q limits so heavy usage never cuts you off mid-flow.',
          'Premium, Q limitlerini kaldırır ve yoğun kullanımda sizi yarıda bırakmaz.',
          'Premium entfernt Q-Limits, damit intensive Nutzung nicht mitten im Ablauf stoppt.',
        ),
    },
    {
      title: L('More tailored to you', 'Size göre daha isabetli', 'Passender für dich'),
      body: L(
        'Your profile, interests, and ecosystem shape stronger recommendations.',
        'Profiliniz, ilgi alanlarınız ve cihaz ekosisteminiz önerilere daha güçlü yansır.',
        'Profil, Interessen und Geräte-Ökosystem machen Empfehlungen genauer.',
      ),
    },
  ];

  const premiumModules = [
    L('Review Sentiment', 'Yorum Memnuniyeti', 'Bewertungsstimmung'),
    L('Technical Priorities', 'Teknik Öncelikler', 'Technische Prioritäten'),
    L('Buying Decision', 'Satın Alma Kararı', 'Kaufentscheidung'),
    L('Better Alternatives', 'Daha Mantıklı Alternatifler', 'Bessere Alternativen'),
    L('Price Timing', 'Fiyat Zamanlaması', 'Preis-Timing'),
    L('Personalized Match', 'Kişisel Eşleşme', 'Persönliche Übereinstimmung'),
  ];

  const rows = [
    {
      feature: L('Qor AI Chat', 'Qor AI Chat', 'Qor AI Chat'),
      free: L(`${userCoins} balance, ${qAmount(COSTS.chat, lang)} per question`, `${userCoins} bakiye, soru başı ${qAmount(COSTS.chat, lang)}`, `${userCoins} Guthaben, ${qAmount(COSTS.chat, lang)} pro Frage`),
      premium: L('Unlimited Q', 'Sınırsız Q', 'Unbegrenzt Q'),
    },
    {
      feature: L('Visual Scanner', 'Görsel Tarayıcı', 'Visueller Scanner'),
      free: L(`${qAmount(COSTS.productScan, lang)} per scan`, `Tarama başı ${qAmount(COSTS.productScan, lang)}`, `${qAmount(COSTS.productScan, lang)} pro Scan`),
      premium: L('Unlimited', 'Sınırsız', 'Unbegrenzt'),
    },
    {
      feature: L('Smart Link Analysis', 'Akıllı Link Analizi', 'Smarte Link-Analyse'),
      free: L(`${qAmount(COSTS.linkAnalysis, lang)} per product URL`, `Ürün linki başı ${qAmount(COSTS.linkAnalysis, lang)}`, `${qAmount(COSTS.linkAnalysis, lang)} pro Produkt-URL`),
      premium: L('Unlimited', 'Sınırsız', 'Unbegrenzt'),
    },
    {
      feature: L('Side-by-Side Compare', 'Karşılıklı Karşılaştırma', 'Direkter Vergleich'),
      free: L(`${qAmount(COSTS.linkCompare, lang)} per link compare`, `Link karşılaştırma başı ${qAmount(COSTS.linkCompare, lang)}`, `${qAmount(COSTS.linkCompare, lang)} pro Link-Vergleich`),
      premium: L('Unlimited', 'Sınırsız', 'Unbegrenzt'),
    },
    {
      feature: L('Premium Recommendations', 'Premium Öneriler', 'Premium-Empfehlungen'),
      free: L('Standard', 'Standart', 'Standard'),
      premium: L('Deeper personalization', 'Daha derin kişiselleştirme', 'Tiefere Personalisierung'),
    },
    {
      feature: L('Product Comparisons', 'Ürün Karşılaştırmaları', 'Produktvergleiche'),
      free: L(`${FREE_COMPARISON_LIMIT} per day`, `Günde ${FREE_COMPARISON_LIMIT}`, `${FREE_COMPARISON_LIMIT} pro Tag`),
      premium: L('Unlimited', 'Sınırsız', 'Unbegrenzt'),
    },
    {
      feature: L('Product Search', 'Ürün Arama', 'Produktsuche'),
      free: true,
      premium: true,
    },
    {
      feature: L('Categories', 'Kategoriler', 'Kategorien'),
      free: true,
      premium: true,
    },
    {
      feature: L('YouTube Reviews', 'YouTube İncelemeleri', 'YouTube-Bewertungen'),
      free: true,
      premium: true,
    },
    {
      feature: L('Price history', 'Fiyat geçmişi', 'Preisverlauf'),
      free: L(`${FREE_PRICE_HISTORY_DAYS} days`, `${FREE_PRICE_HISTORY_DAYS} gün`, `${FREE_PRICE_HISTORY_DAYS} Tage`),
      premium: L(`${PRO_PRICE_HISTORY_DAYS} days`, `${PRO_PRICE_HISTORY_DAYS} gün`, `${PRO_PRICE_HISTORY_DAYS} Tage`),
    },
    {
      feature: L('Saved products', 'Ürün Kaydetme', 'Gespeicherte Produkte'),
      free: L(`${FREE_COLLECTION_LIMIT} products`, `${FREE_COLLECTION_LIMIT} ürün`, `${FREE_COLLECTION_LIMIT} Produkte`),
      premium: L('Unlimited', 'Sınırsız', 'Unbegrenzt'),
    },
    {
      feature: L('Priority Support', 'Öncelikli Destek', 'Priorisierter Support'),
      free: false,
      premium: true,
    },
  ];

  return (
    <div className="premium-page">
      <section className="premium-hero">
        <div className="container premium-hero-inner fade-up">
          <div className="premium-hero-copy">
            <span className="premium-kicker">QOR AI PREMIUM</span>
            <h1>{L('Unlock the Full Experience', 'Tüm Deneyimin Kilidini Aç', 'Erleben Sie das Volle')}</h1>
            <p>
              {L(
                'Premium removes the cap across every AI flow so you can compare, scan, and ask without slowing down.',
                'Qor AI Premium ile tüm AI akışlarında sınır kalkar; daha hızlı karar verir, ürünleri daha net tarar ve her öneriyi kendi profilinize göre alırsınız.',
                'Premium hebt Limits in allen KI-Abläufen auf, damit du ohne Unterbrechung vergleichen, scannen und fragen kannst.',
              )}
            </p>
            <div className="premium-hero-pills" aria-label={L('Premium features', 'Premium özellikleri', 'Premium-Funktionen')}>
              <span>{L('Unlimited Qor AI Chat', 'Sınırsız Qor AI Chat', 'Unbegrenzter Qor AI Chat')}</span>
              <span>{L('Advanced visual scanner', 'Gelişmiş görsel tarayıcı', 'Erweiterter visueller Scanner')}</span>
              <span>{L('Smarter recommendations', 'Daha akıllı öneriler', 'Klügere Empfehlungen')}</span>
            </div>
          </div>
          <div className="premium-hero-visual" aria-hidden="true">
            <img src="/assets/qor_logo_512.png?v=20260605a" alt="" />
            <div>
              <strong>{L('AI Analysis', 'AI Analizi', 'KI-Analyse')}</strong>
              <span>{L('Reviews, specs, advice and price prediction', 'Yorumlar, teknik analiz, tavsiye ve fiyat tahmini', 'Reviews, Specs, Empfehlung und Preisprognose')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container premium-main" aria-label={L('Premium subscription', 'Premium abonelik', 'Premium-Abonnement')}>
        {status.isPremium ? (
          <Reveal>
            <article className="premium-active-panel">
              <span className="premium-kicker">{L('Active subscription', 'Aktif abonelik', 'Aktives Abonnement')}</span>
              <h2>{activePlanLabel(activePlan, L)}</h2>
              <p>
                {L(
                  'Qor AI Chat, visual scanner, link analysis, and premium recommendations are fully unlocked.',
                  'Qor AI Chat, görsel tarayıcı, link analizi ve premium öneriler artık tamamen açık.',
                  'Qor AI Chat, visueller Scanner, Link-Analyse und Premium-Empfehlungen sind vollständig freigeschaltet.',
                )}
              </p>
              <div className="premium-active-meta">
                <span>
                  <b>{L('Active plan', 'Aktif plan', 'Aktiver Plan')}</b>
                  {activePlanLabel(activePlan, L)}
                </span>
                {premiumUntil && (
                  <span>
                    <b>{L('Estimated renewal / end', 'Tahmini yenileme / bitiş', 'Voraussichtliche Verlängerung / Ende')}</b>
                    {premiumUntil}
                  </span>
                )}
                <span>
                  <b>Google Play</b>
                  {L(
                    'Your subscription is active. You can manage it from Google Play anytime.',
                    'Aboneliğiniz aktif. Google Play üzerinden istediğiniz zaman yönetebilirsiniz.',
                    'Dein Abonnement ist aktiv. Du kannst es jederzeit über Google Play verwalten.',
                  )}
                </span>
              </div>
              <div className="premium-actions">
                <a className="btn premium-btn primary" href={manageUrl(status.productId)} target="_blank" rel="noopener noreferrer">
                  <PlayGlyph size={19} />
                  {L('Manage on Google Play', 'Google Play üzerinden yönet', 'In Google Play verwalten')}
                </a>
                <button className="btn premium-btn secondary" type="button" onClick={refreshSubscription} disabled={refreshing}>
                  {refreshing
                    ? L('Refreshing...', 'Yenileniyor...', 'Wird aktualisiert...')
                    : L('Refresh subscription status', 'Abonelik durumunu yenile', 'Abonnementstatus aktualisieren')}
                </button>
              </div>
            </article>
          </Reveal>
        ) : (
          <>
            <Reveal>
              <div className="premium-trial">
                <strong>{L(`${TRIAL_DAYS}-day free trial`, `${TRIAL_DAYS} günlük ücretsiz deneme`, `${TRIAL_DAYS}-Tage-Gratisprobe`)}</strong>
                <span>
                  {L(
                    `No charge for ${TRIAL_DAYS} days, then your selected plan starts.`,
                    `${TRIAL_DAYS} gün ücretsiz, ardından seçtiğiniz plan devreye girer.`,
                    `${TRIAL_DAYS} Tage ohne Kosten, danach startet dein gewählter Plan.`,
                  )}
                </span>
              </div>
            </Reveal>

            <section className="premium-plans" aria-label={L('Choose a Premium plan', 'Premium plan seç', 'Premium-Plan wählen')}>
              <Reveal delay={80}>
                <button
                  type="button"
                  className={'premium-plan-card' + (selectedPlan === 'yearly' ? ' selected' : '')}
                  onClick={() => setSelectedPlan('yearly')}
                >
                  <span className="premium-plan-save">{L(`SAVE ${savingsPct}%`, `%${savingsPct} TASARRUF`, `${savingsPct}% SPAREN`)}</span>
                  <span className="premium-plan-name">{L('Yearly', 'Yıllık', 'Jährlich')}</span>
                  <strong>{price(YEARLY_PRICE)}</strong>
                  <em>{L(`${price(monthlyEquivalent)} / mo`, `Ayda ${price(monthlyEquivalent)}`, `${price(monthlyEquivalent)} / Monat`)}</em>
                  <small>{L('Best value for heavy AI use', 'Yoğun AI kullanımı için en avantajlı plan', 'Bester Wert für intensive KI-Nutzung')}</small>
                </button>
              </Reveal>
              <Reveal delay={140}>
                <button
                  type="button"
                  className={'premium-plan-card' + (selectedPlan === 'monthly' ? ' selected' : '')}
                  onClick={() => setSelectedPlan('monthly')}
                >
                  <span className="premium-plan-space" />
                  <span className="premium-plan-name">{L('Monthly', 'Aylık', 'Monatlich')}</span>
                  <strong>{price(MONTHLY_PRICE)}</strong>
                  <em>{L('billed monthly', 'aylık ödenir', 'monatlich abgerechnet')}</em>
                  <small>{L('Flexible Premium access', 'Esnek Premium erişimi', 'Flexibler Premium-Zugang')}</small>
                </button>
              </Reveal>
            </section>

            <Reveal delay={180}>
              <div className="premium-cta-panel">
                <button className="btn premium-btn primary" type="button" onClick={() => startPremium(selected.id)}>
                  <PlayGlyph size={20} />
                  {L(
                    `Start Free Trial - ${price(selected.amount)}${selected.suffix}`,
                    `Premium'u başlat - ${price(selected.amount)}${selected.suffix}`,
                    `Gratisprobe starten - ${price(selected.amount)}${selected.suffix}`,
                  )}
                </button>
                <PlayBadge className="premium-play" getItOn={L('GET IT ON', 'İNDİR', 'LADE BEI')}
                  label={L('Google Play', "Google Play'den indir", 'Google Play')} />
                <p>
                  {L(
                    'Purchase is completed in the Android app through Google Play. Auto-renews and can be cancelled anytime from Play Store settings.',
                    'Satın alma Android uygulamasında Google Play üzerinden tamamlanır. Otomatik yenilenir ve Play Store ayarlarından istediğiniz zaman iptal edebilirsiniz.',
                    'Der Kauf wird in der Android-App über Google Play abgeschlossen. Verlängert sich automatisch und ist jederzeit in den Play Store Einstellungen kündbar.',
                  )}
                </p>
              </div>
            </Reveal>
          </>
        )}

        <section className="premium-momentum" aria-label={L('Premium benefits', 'Premium avantajları', 'Premium-Vorteile')}>
          {momentum.map((item, index) => (
            <Reveal key={item.title} delay={index * 70}>
              <article>
                <span>{index + 1}</span>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </section>

        <section className="premium-ai-modules" aria-label={L('Premium AI analysis modules', 'Premium AI analiz modülleri', 'Premium KI-Analyse-Module')}>
          <div>
            <span className="premium-kicker">{L('AI Analysis', 'AI Analizi', 'KI-Analyse')}</span>
            <h2>{L('Reviews, specs, advice and price prediction', 'Yorumlar, teknik analiz, tavsiye ve fiyat tahmini', 'Reviews, Specs, Empfehlung und Preisprognose')}</h2>
          </div>
          <div className="premium-module-grid">
            {premiumModules.map((module) => (
              <span key={module}>{module}</span>
            ))}
          </div>
        </section>

        <section className="premium-table-wrap" aria-label={L('Free vs Premium comparison', 'Ücretsiz ve Premium karşılaştırması', 'Kostenlos vs Premium Vergleich')}>
          <div className="premium-table-head">
            <span>{L('Feature', 'Özellik', 'Funktion')}</span>
            <span>{L('Free', 'Ücretsiz', 'Kostenlos')}</span>
            <span>Premium</span>
          </div>
          {rows.map((row) => (
            <div className="premium-table-row" key={row.feature}>
              <strong>{row.feature}</strong>
              <PremiumCell value={row.free} />
              <PremiumCell value={row.premium} featured />
            </div>
          ))}
        </section>
      </section>
    </div>
  );
}

function PremiumCell({ value, featured = false }) {
  if (typeof value === 'boolean') {
    return <span className={'premium-check' + (value ? ' yes' : ' no')}>{value ? '✓' : '-'}</span>;
  }
  return <span className={featured ? 'premium-cell featured' : 'premium-cell'}>{value}</span>;
}
