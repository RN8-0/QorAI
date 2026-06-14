import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import { premiumStatus } from '../lib/premium';
import Reveal from '../components/Reveal.jsx';
import './Premium.css';

const CONTACT_EMAIL = 'contact@arain.digital';
const TRIAL_DAYS = 3;
const MONTHLY_PRICE = 3.99;
const YEARLY_PRICE = 19.99;

const CHECKOUT_URLS = {
  monthly: import.meta.env.VITE_PADDLE_MONTHLY_CHECKOUT_URL || '',
  yearly: import.meta.env.VITE_PADDLE_YEARLY_CHECKOUT_URL || '',
  fallback: import.meta.env.VITE_PADDLE_CHECKOUT_URL || '',
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

function planCheckoutUrl(planId) {
  const raw = CHECKOUT_URLS[planId] || CHECKOUT_URLS.fallback;
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!CHECKOUT_URLS[planId]) url.searchParams.set('plan', planId);
    return url.toString();
  } catch {
    return raw;
  }
}

function activePlanLabel(plan, L) {
  if (plan === 'yearly') return L('Yearly Premium', 'Yıllık Premium', 'Premium jährlich');
  if (plan === 'monthly') return L('Monthly Premium', 'Aylık Premium', 'Premium monatlich');
  return L('Premium', 'Premium', 'Premium');
}

export default function Premium() {
  const { lang } = useI18n();
  const { user, openAuth, refresh } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);

  const status = useMemo(() => premiumStatus(user), [user]);
  const activePlan = productPlan(status.productId);
  const premiumUntil = formatDate(status.expiresAt, lang);
  const monthlyEquivalent = YEARLY_PRICE / 12;
  const savingsPct = Math.round(((MONTHLY_PRICE * 12 - YEARLY_PRICE) / (MONTHLY_PRICE * 12)) * 100);
  const selected = selectedPlan === 'yearly'
    ? { id: 'yearly', name: L('Yearly', 'Yıllık', 'Jährlich'), amount: YEARLY_PRICE, suffix: L('/year', '/yıl', '/Jahr') }
    : { id: 'monthly', name: L('Monthly', 'Aylık', 'Monatlich'), amount: MONTHLY_PRICE, suffix: L('/month', '/ay', '/Monat') };
  const checkoutReady = Boolean(planCheckoutUrl(selected.id));

  useSeo({
    title: `${L('Premium', 'Premium', 'Premium')} - Qor AI`,
    description: L(
      'Qor AI Premium pricing for AI product research, product link analysis, visual scanning, comparisons and smarter buying decisions.',
      'AI ürün araştırması, ürün link analizi, görsel tarama, karşılaştırma ve daha isabetli satın alma kararları için Qor AI Premium fiyatlandırması.',
      'Qor AI Premium Preise für KI-Produktrecherche, Linkanalyse, visuellen Scanner, Vergleiche und bessere Kaufentscheidungen.',
    ),
    path: '/premium',
  });

  function startCheckout(planId = selectedPlan) {
    setCheckoutMessage('');
    if (!user) {
      openAuth();
      return;
    }
    const url = planCheckoutUrl(planId);
    if (!url) {
      setCheckoutMessage(L(
        'Secure web checkout is being connected. Card payments will be processed by Paddle after account approval.',
        'Güvenli web checkout bağlanıyor. Kart ödemeleri hesap onayından sonra Paddle üzerinden işlenecek.',
        'Der sichere Web-Checkout wird verbunden. Kartenzahlungen werden nach der Kontofreigabe über Paddle verarbeitet.',
      ));
      return;
    }
    window.location.assign(url);
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

  const heroPoints = [
    L('AI product analysis', 'AI ürün analizi', 'KI-Produktanalyse'),
    L('Product link analysis', 'Ürün link analizi', 'Produktlink-Analyse'),
    L('Visual product scanner', 'Görsel ürün tarayıcı', 'Visueller Produktscanner'),
    L('Subscription analysis', 'Abonelik analizi', 'Abo-Analyse'),
  ];

  const valueCards = [
    {
      title: L('Research without friction', 'Akışı kesmeden araştır', 'Ohne Reibung recherchieren'),
      body: L(
        'Run product analysis, link checks and comparisons without stopping at basic usage limits.',
        'Ürün analizi, link kontrolü ve karşılaştırmaları temel kullanım sınırlarına takılmadan çalıştırın.',
        'Produktanalysen, Linkchecks und Vergleiche ohne Unterbrechung durch Basislimits nutzen.',
      ),
    },
    {
      title: L('Clearer buying decisions', 'Daha net satın alma kararı', 'Klarere Kaufentscheidungen'),
      body: L(
        'See practical tradeoffs, alternatives, price timing and fit signals before you buy.',
        'Satın almadan önce farkları, alternatifleri, fiyat zamanlamasını ve kişisel uyumu daha net görün.',
        'Praktische Abwägungen, Alternativen, Preis-Timing und Fit-Signale vor dem Kauf sehen.',
      ),
    },
    {
      title: L('Designed for serious shoppers', 'Ciddi araştırma için tasarlandı', 'Für ernsthafte Recherche gebaut'),
      body: L(
        'Premium is for users comparing several products, brands and subscriptions before spending money.',
        'Premium, para harcamadan önce birden fazla ürün, marka ve aboneliği karşılaştıran kullanıcılar içindir.',
        'Premium ist für Nutzer gedacht, die mehrere Produkte, Marken und Abos vor dem Kauf vergleichen.',
      ),
    },
  ];

  const included = [
    L('Unlimited AI product research', 'Sınırsız AI ürün araştırması', 'Unbegrenzte KI-Produktrecherche'),
    L('Unlimited product link analysis', 'Sınırsız ürün link analizi', 'Unbegrenzte Produktlink-Analyse'),
    L('Unlimited product comparisons', 'Sınırsız ürün karşılaştırma', 'Unbegrenzte Produktvergleiche'),
    L('Advanced visual scanner', 'Gelişmiş görsel tarayıcı', 'Erweiterter visueller Scanner'),
    L('Subscription value analysis', 'Abonelik değer analizi', 'Abo-Wertanalyse'),
    L('90-day price history', '90 günlük fiyat geçmişi', '90 Tage Preisverlauf'),
    L('Personalized recommendations', 'Kişiselleştirilmiş öneriler', 'Personalisierte Empfehlungen'),
    L('Priority support', 'Öncelikli destek', 'Priorisierter Support'),
  ];

  const rows = [
    {
      feature: L('AI product analysis', 'AI ürün analizi', 'KI-Produktanalyse'),
      free: L('Limited access', 'Sınırlı erişim', 'Begrenzter Zugriff'),
      premium: L('Unlimited access', 'Sınırsız erişim', 'Unbegrenzter Zugriff'),
    },
    {
      feature: L('Product link analysis', 'Ürün link analizi', 'Produktlink-Analyse'),
      free: L('Limited', 'Sınırlı', 'Begrenzt'),
      premium: L('Unlimited', 'Sınırsız', 'Unbegrenzt'),
    },
    {
      feature: L('Visual product scanner', 'Görsel ürün tarayıcı', 'Visueller Produktscanner'),
      free: L('Basic preview', 'Temel önizleme', 'Basisvorschau'),
      premium: L('Advanced scanner', 'Gelişmiş tarayıcı', 'Erweiterter Scanner'),
    },
    {
      feature: L('Product comparisons', 'Ürün karşılaştırmaları', 'Produktvergleiche'),
      free: L('Daily limit', 'Günlük limit', 'Tageslimit'),
      premium: L('Unlimited', 'Sınırsız', 'Unbegrenzt'),
    },
    {
      feature: L('Price history', 'Fiyat geçmişi', 'Preisverlauf'),
      free: L('7 days', '7 gün', '7 Tage'),
      premium: L('90 days', '90 gün', '90 Tage'),
    },
    {
      feature: L('Saved products', 'Kayıtlı ürünler', 'Gespeicherte Produkte'),
      free: L('Limited', 'Sınırlı', 'Begrenzt'),
      premium: L('Unlimited', 'Sınırsız', 'Unbegrenzt'),
    },
    {
      feature: L('Support', 'Destek', 'Support'),
      free: L('Standard', 'Standart', 'Standard'),
      premium: L('Priority', 'Öncelikli', 'Priorisiert'),
    },
  ];

  return (
    <div className="premium-page">
      <section className="premium-hero">
        <div className="container premium-hero-inner fade-up">
          <div className="premium-hero-copy">
            <span className="premium-kicker">QOR AI PREMIUM</span>
            <h1>{L('Make better product decisions with Premium.', 'Premium ile daha iyi ürün kararları verin.', 'Treffen Sie bessere Produktentscheidungen mit Premium.')}</h1>
            <p>
              {L(
                'AI-powered product research, link analysis, visual scanning and comparisons for people who want a clear answer before they buy.',
                'Satın almadan önce net cevap isteyen kullanıcılar için AI destekli ürün araştırması, link analizi, görsel tarama ve karşılaştırma.',
                'KI-gestützte Produktrecherche, Linkanalyse, visueller Scan und Vergleiche für klare Antworten vor dem Kauf.',
              )}
            </p>
            <div className="premium-hero-pills" aria-label={L('Premium features', 'Premium özellikleri', 'Premium-Funktionen')}>
              {heroPoints.map((point) => <span key={point}>{point}</span>)}
            </div>
          </div>

          <aside className="premium-checkout-card" aria-label={L('Selected Premium plan', 'Seçili Premium plan', 'Ausgewählter Premium-Plan')}>
            <span className="premium-card-label">{L('Most popular', 'En popüler', 'Am beliebtesten')}</span>
            <h2>{selected.name} Premium</h2>
            <div className="premium-price-line">
              <strong>{price(selected.amount)}</strong>
              <span>{selected.suffix}</span>
            </div>
            <p>
              {selected.id === 'yearly'
                ? L(`${TRIAL_DAYS}-day free trial, then ${price(YEARLY_PRICE)} per year.`, `${TRIAL_DAYS} günlük ücretsiz deneme, ardından yıllık ${price(YEARLY_PRICE)}.`, `${TRIAL_DAYS} Tage gratis, danach ${price(YEARLY_PRICE)} pro Jahr.`)
                : L(`${TRIAL_DAYS}-day free trial, then ${price(MONTHLY_PRICE)} per month.`, `${TRIAL_DAYS} günlük ücretsiz deneme, ardından aylık ${price(MONTHLY_PRICE)}.`, `${TRIAL_DAYS} Tage gratis, danach ${price(MONTHLY_PRICE)} pro Monat.`)}
            </p>
            <button className="btn premium-btn primary" type="button" onClick={() => startCheckout(selected.id)}>
              {user
                ? L('Continue to secure checkout', 'Güvenli checkout’a devam et', 'Zum sicheren Checkout')
                : L('Create account and continue', 'Hesap oluştur ve devam et', 'Konto erstellen und fortfahren')}
            </button>
            <p className="premium-payment-note">
              {checkoutReady
                ? L('Card payments are processed securely by Paddle. Qor AI does not store card details.',
                  'Kart ödemeleri güvenli şekilde Paddle tarafından işlenir. Qor AI kart bilgisi saklamaz.',
                  'Kartenzahlungen werden sicher über Paddle verarbeitet. Qor AI speichert keine Kartendaten.')
                : L('Paddle checkout is being prepared for Visa and Mastercard payments.',
                  'Visa ve Mastercard ödemeleri için Paddle checkout hazırlanıyor.',
                  'Paddle Checkout für Visa- und Mastercard-Zahlungen wird vorbereitet.')}
            </p>
          </aside>
        </div>
      </section>

      <section className="container premium-main" aria-label={L('Premium subscription', 'Premium abonelik', 'Premium-Abonnement')}>
        {status.isPremium && (
          <Reveal>
            <article className="premium-active-panel">
              <span className="premium-kicker">{L('Active subscription', 'Aktif abonelik', 'Aktives Abonnement')}</span>
              <h2>{activePlanLabel(activePlan, L)}</h2>
              <p>
                {L(
                  'Your Premium access is active. AI product research, product link analysis, comparisons and advanced recommendations are unlocked.',
                  'Premium erişiminiz aktif. AI ürün araştırması, ürün link analizi, karşılaştırmalar ve gelişmiş öneriler açık.',
                  'Ihr Premium-Zugang ist aktiv. KI-Produktrecherche, Linkanalyse, Vergleiche und erweiterte Empfehlungen sind freigeschaltet.',
                )}
              </p>
              <div className="premium-active-meta">
                <span>
                  <b>{L('Plan', 'Plan', 'Plan')}</b>
                  {activePlanLabel(activePlan, L)}
                </span>
                {premiumUntil && (
                  <span>
                    <b>{L('Estimated renewal / end', 'Tahmini yenileme / bitiş', 'Voraussichtliche Verlängerung / Ende')}</b>
                    {premiumUntil}
                  </span>
                )}
                <span>
                  <b>{L('Billing support', 'Fatura desteği', 'Abrechnungssupport')}</b>
                  {CONTACT_EMAIL}
                </span>
              </div>
              <button className="btn premium-btn secondary" type="button" onClick={refreshSubscription} disabled={refreshing}>
                {refreshing
                  ? L('Refreshing...', 'Yenileniyor...', 'Wird aktualisiert...')
                  : L('Refresh subscription status', 'Abonelik durumunu yenile', 'Abonnementstatus aktualisieren')}
              </button>
            </article>
          </Reveal>
        )}

        <Reveal>
          <div className="premium-trial">
            <strong>{L(`${TRIAL_DAYS}-day free trial`, `${TRIAL_DAYS} günlük ücretsiz deneme`, `${TRIAL_DAYS}-Tage-Gratisprobe`)}</strong>
            <span>
              {L(
                'Try Premium first. Cancel before the trial ends if it is not right for you.',
                'Önce Premium’u deneyin. Size uygun değilse deneme bitmeden iptal edin.',
                'Premium zuerst testen. Vor Ablauf der Probe kündigen, wenn es nicht passt.',
              )}
            </span>
          </div>
        </Reveal>

        <section className="premium-plans" aria-label={L('Choose a Premium plan', 'Premium plan seç', 'Premium-Plan wählen')}>
          <Reveal delay={80}>
            <button
              type="button"
              className={'premium-plan-card' + (selectedPlan === 'yearly' ? ' selected' : '')}
              onClick={() => {
                setSelectedPlan('yearly');
                setCheckoutMessage('');
              }}
            >
              <span className="premium-plan-save">{L(`SAVE ${savingsPct}%`, `%${savingsPct} TASARRUF`, `${savingsPct}% SPAREN`)}</span>
              <span className="premium-plan-name">{L('Yearly', 'Yıllık', 'Jährlich')}</span>
              <strong>{price(YEARLY_PRICE)}</strong>
              <em>{L(`${price(monthlyEquivalent)} / month equivalent`, `Aylık ${price(monthlyEquivalent)} denk gelir`, `${price(monthlyEquivalent)} / Monat effektiv`)}</em>
              <small>{L('Best value for regular product research.', 'Düzenli ürün araştırması için en avantajlı plan.', 'Bester Wert für regelmäßige Produktrecherche.')}</small>
            </button>
          </Reveal>
          <Reveal delay={140}>
            <button
              type="button"
              className={'premium-plan-card' + (selectedPlan === 'monthly' ? ' selected' : '')}
              onClick={() => {
                setSelectedPlan('monthly');
                setCheckoutMessage('');
              }}
            >
              <span className="premium-plan-space" />
              <span className="premium-plan-name">{L('Monthly', 'Aylık', 'Monatlich')}</span>
              <strong>{price(MONTHLY_PRICE)}</strong>
              <em>{L('Billed monthly', 'Aylık ödenir', 'Monatlich abgerechnet')}</em>
              <small>{L('Flexible access for short research periods.', 'Kısa araştırma dönemleri için esnek erişim.', 'Flexibler Zugang für kurze Recherchephasen.')}</small>
            </button>
          </Reveal>
        </section>

        <Reveal delay={180}>
          <div className="premium-cta-panel">
            <div>
              <strong>{L('Ready for Premium?', 'Premium’a hazır mısınız?', 'Bereit für Premium?')}</strong>
              <p>
                {L(
                  'Checkout opens after account sign-in so Premium can be attached to the correct Qor AI account.',
                  'Checkout, Premium’un doğru Qor AI hesabına tanımlanması için hesap girişinden sonra açılır.',
                  'Der Checkout öffnet nach dem Login, damit Premium dem richtigen Qor AI Konto zugeordnet wird.',
                )}
              </p>
            </div>
            <button className="btn premium-btn primary" type="button" onClick={() => startCheckout(selected.id)}>
              {L(`Continue - ${price(selected.amount)}${selected.suffix}`, `Devam et - ${price(selected.amount)}${selected.suffix}`, `Weiter - ${price(selected.amount)}${selected.suffix}`)}
            </button>
            {checkoutMessage && <p className="premium-checkout-message">{checkoutMessage}</p>}
            <p className="premium-legal-line">
              {L(
                'Prices are shown in USD. Taxes may be calculated during checkout. Subscriptions renew automatically until cancelled.',
                'Fiyatlar USD olarak gösterilir. Vergiler checkout sırasında hesaplanabilir. Abonelikler iptal edilene kadar otomatik yenilenir.',
                'Preise werden in USD angezeigt. Steuern können im Checkout berechnet werden. Abos verlängern sich automatisch bis zur Kündigung.',
              )}
            </p>
          </div>
        </Reveal>

        <section className="premium-value-grid" aria-label={L('Premium value', 'Premium değeri', 'Premium-Wert')}>
          {valueCards.map((item, index) => (
            <Reveal key={item.title} delay={index * 70}>
              <article>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </article>
            </Reveal>
          ))}
        </section>

        <section className="premium-included" aria-label={L('Included in Premium', 'Premium dahilindeki özellikler', 'In Premium enthalten')}>
          <div>
            <span className="premium-kicker">{L('Included', 'Dahil', 'Enthalten')}</span>
            <h2>{L('Everything needed for a clearer buying decision.', 'Daha net satın alma kararı için gereken her şey.', 'Alles für eine klarere Kaufentscheidung.')}</h2>
            <p>
              {L(
                'Premium focuses on the product research workflow: analyze, compare, scan, save and decide with less friction.',
                'Premium ürün araştırma akışına odaklanır: analiz edin, karşılaştırın, tarayın, kaydedin ve daha az sürtünmeyle karar verin.',
                'Premium konzentriert sich auf den Rechercheablauf: analysieren, vergleichen, scannen, speichern und leichter entscheiden.',
              )}
            </p>
          </div>
          <div className="premium-included-grid">
            {included.map((item) => (
              <span key={item}>{item}</span>
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
              <span className="premium-cell">{row.free}</span>
              <span className="premium-cell featured">{row.premium}</span>
            </div>
          ))}
        </section>

        <section className="premium-policy-strip" aria-label={L('Premium policies', 'Premium politikaları', 'Premium-Richtlinien')}>
          <span>{L('Secure web checkout prepared for Paddle.', 'Paddle için güvenli web checkout hazırlandı.', 'Sicherer Web-Checkout für Paddle vorbereitet.')}</span>
          <Link to="/terms">{L('Terms', 'Koşullar', 'Bedingungen')}</Link>
          <Link to="/privacy">{L('Privacy', 'Gizlilik', 'Datenschutz')}</Link>
          <Link to="/refund">{L('Refund policy', 'İade politikası', 'Erstattung')}</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{L('Contact', 'İletişim', 'Kontakt')}</a>
        </section>
      </section>
    </div>
  );
}
