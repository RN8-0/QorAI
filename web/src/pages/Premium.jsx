import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useGeoCountry } from '../lib/geo';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal.jsx';
import './Premium.css';

// Polar'daki GERÇEK fiyatlar (panelde ne varsa burada o yazmalı). Ziyaretçinin
// ülkesine uyan para birimi gösterilir ve checkout da AYNI para biriminde açılır.
const PRICES = {
  usd: { sym: '$', monthly: '7.99', yearly: '49.99' },
  eur: { sym: '€', monthly: '6.99', yearly: '49.99' },
  gbp: { sym: '£', monthly: '7.99', yearly: '44.99' },
  try: { sym: '₺', monthly: '149,99', yearly: '1799,99' },
};
const EURO_CC = ['DE', 'AT', 'BE', 'NL', 'FR', 'IT', 'ES', 'PT', 'IE', 'FI', 'GR',
  'SK', 'SI', 'EE', 'LV', 'LT', 'LU', 'MT', 'CY', 'HR'];

function currencyForCountry(cc) {
  const c = String(cc || '').toUpperCase();
  if (c === 'TR') return 'try';
  if (c === 'GB') return 'gbp';
  if (EURO_CC.indexOf(c) >= 0) return 'eur';
  return 'usd';
}

function plans(L, cur) {
  const p = PRICES[cur] || PRICES.usd;
  const money = (v) => (cur === 'try' ? `${v} ${p.sym}` : `${p.sym}${v}`);
  return [
    {
      name: 'Free',
      key: 'free',
      price: money('0'),
      cadence: L('forever', 'sürekli', 'dauerhaft'),
      cta: L('Start free', 'Ücretsiz başla', 'Kostenlos starten'),
      features: [
        L('20 welcome Qor Coins', '20 hoş geldin Qor Coin', '20 Willkommens-Qor-Coins'),
        L('Qor AI Chat (runs on Qor Coins)', 'Qor AI Chat (Qor Coin ile)', 'Qor AI Chat (mit Qor Coins)'),
        L('Visual scanner & smart link analysis (Qor Coins)', 'Görsel tarayıcı ve akıllı link analizi (Qor Coin ile)', 'Visueller Scanner & smarte Link-Analyse (mit Qor Coins)'),
        L('Standard recommendations', 'Standart öneriler', 'Standard-Empfehlungen'),
        L('Product comparisons, search and categories', 'Ürün karşılaştırma, arama ve kategoriler', 'Produktvergleiche, Suche und Kategorien'),
      ],
    },
    {
      name: 'Pro',
      key: 'monthly',
      price: money(p.monthly),
      cadence: L('monthly', 'aylık', 'monatlich'),
      cta: L('Get Pro', 'Pro’ya geç', 'Pro aktivieren'),
      featured: true,
      features: [
        L('3-day free trial', '3 gün ücretsiz deneme', '3 Tage kostenlos testen'),
        L('Unlimited Qor AI Chat', 'Sınırsız Qor AI Chat', 'Unbegrenzter Qor AI Chat'),
        L('Unlimited visual scanner', 'Sınırsız görsel tarayıcı', 'Unbegrenzter visueller Scanner'),
        L('Unlimited smart link analysis', 'Sınırsız akıllı link analizi', 'Unbegrenzte smarte Link-Analyse'),
        L('Deeper personalized recommendations', 'Daha derin kişiselleştirilmiş öneriler', 'Tiefere personalisierte Empfehlungen'),
        L('Priority support', 'Öncelikli destek', 'Priorisierter Support'),
      ],
    },
    {
      name: 'Pro Yearly',
      key: 'yearly',
      price: money(p.yearly),
      cadence: L('yearly', 'yıllık', 'jährlich'),
      cta: L('Save yearly', 'Yıllık al', 'Jährlich sparen'),
      badge: L('Best value', 'En avantajlı', 'Bester Wert'),
      features: [
        L('3-day free trial', '3 gün ücretsiz deneme', '3 Tage kostenlos testen'),
        L('Everything in Pro monthly', 'Aylık Pro’daki her şey', 'Alles aus Pro monatlich'),
        L('Lowest yearly cost for heavy AI use', 'Yoğun AI kullanımında en düşük yıllık maliyet', 'Niedrigste Jahreskosten für intensive KI-Nutzung'),
        L('Priority access to new premium tools', 'Yeni premium araçlara öncelikli erişim', 'Priorität bei neuen Premium-Tools'),
      ],
    },
  ];
}

export default function Premium() {
  const { lang } = useI18n();
  const { user, openAuth } = useAuth();
  const geoCountry = useGeoCountry();
  const cur = currencyForCountry(geoCountry);
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({
    title: `${L('Premium', 'Premium', 'Premium')} — Qor AI`,
    description: L(
      'Qor AI Premium plans for deeper AI product, link and subscription analysis.',
      'Daha derin ürün, link ve abonelik analizi için Qor AI Premium planları.',
      'Qor AI Premium-Pläne für tiefere Produkt-, Link- und Abo-Analysen.',
    ),
    path: '/premium',
  });

  // Web ödemesi Polar.sh üzerinden (Merchant of Record). Ödeme oturumunu
  // SUNUCU açıyor: `external_customer_id` alanına PocketBase kullanıcı id'si
  // yazılıyor, böylece kullanıcı ödemede farklı bir e-posta kullansa bile
  // premium DOĞRU hesaba işleniyor. Ülke kodunu da gönderiyoruz: checkout
  // sayfasında para birimi SEÇİLEMEDİĞİ için sunucu, ziyaretçinin para
  // birimindeki fiyatla oturumu açar (ekranda yazan tutarla birebir aynı).
  const [busyPlan, setBusyPlan] = useState('');
  const [payErr, setPayErr] = useState('');

  async function choose(plan) {
    if (!user) { openAuth(); return; }
    // Ücretsiz plan bir satın alma değil: giriş yapmış kullanıcıyı katalogla
    // baş başa bırakıyoruz, ödeme oturumu açmıyoruz.
    if (plan === 'free') { window.location.href = '/'; return; }
    if (busyPlan) return;
    setPayErr('');
    setBusyPlan(plan);
    try {
      const res = await pb.send('/api/polar/checkout', { method: 'POST', body: { plan, country: geoCountry || '' } });
      if (res && res.url) { window.location.href = res.url; return; }
      throw new Error('no_url');
    } catch (err) {
      setBusyPlan('');
      setPayErr(L(
        'Could not start checkout. Please try again in a moment.',
        'Ödeme başlatılamadı. Lütfen biraz sonra tekrar dene.',
        'Zahlung konnte nicht gestartet werden. Bitte versuche es gleich erneut.',
      ));
      console.warn('[polar] checkout failed', err);
    }
  }

  return (
    <div className="premium-page">
      <section className="premium-hero aurora">
        <div className="container premium-hero-inner fade-up">
          <span className="premium-kicker">Premium</span>
          <h1>{L('Unlock deeper ', 'Daha derin ', 'Schalte tiefere ')}<span className="grad-anim">Qor AI</span>{L(' analysis', ' analizini aç', ' Analysen frei')}</h1>
          <p>
            {L(
              'Use the same Premium plan across product analysis, link analysis and subscription decisions.',
              'Aynı Premium planı ürün analizi, link analizi ve abonelik kararlarında kullan.',
              'Nutze denselben Premium-Plan für Produkt-, Link- und Abo-Analysen.',
            )}
          </p>
          <p className="premium-paynote" style={{
            fontSize: '13.5px',
            lineHeight: 1.5,
            fontWeight: 600,
            color: 'var(--text2, #475569)',
            margin: '0 auto 14px',
            maxWidth: '520px',
          }}>
            {L(
              'Start with a 3-day free trial. Cancel any time before it ends and you are not charged.',
              '3 gün ücretsiz denemeyle başla. Deneme bitmeden iptal edersen ücret alınmaz.',
              'Starte mit 3 Tagen kostenlos. Kündige vor Ablauf und es wird nichts berechnet.',
            )}
          </p>
        </div>
      </section>

      {payErr && (
        <div className="container" role="alert" style={{
          margin: '0 auto 12px', maxWidth: 560, textAlign: 'center',
          color: '#b91c1c', fontWeight: 700, fontSize: 13.5,
        }}>{payErr}</div>
      )}

      <section className="container premium-grid" aria-label="Premium plans">
        {plans(L, cur).map((plan, i) => (
          <Reveal key={plan.name} delay={i * 90}>
            <article className={'premium-card lift' + (plan.featured ? ' featured grad-ring' : '')}>
              {plan.badge && <span className="premium-badge">{plan.badge}</span>}
              {plan.featured && <span className="premium-badge">{L('Most popular', 'En popüler', 'Am beliebtesten')}</span>}
              <h2>{plan.name}</h2>
              <div className="premium-price"><b>{plan.price}</b><span>{plan.cadence}</span></div>
              {/* Buradaki rakam ABD fiyatı; Play Store her ülke için ayrı fiyat
                  tutuyor (ör. aylık GBP 4,99 / EUR 7,49 / AED 24,99) ve vergi
                  ülkeye göre ekleniyor. Not olmadan sayfa, çoğu ülkede yanlış
                  bir fiyat vaat etmiş oluyordu. */}
              {plan.key !== 'free' && (
                <p className="premium-price-note">
                  {L(
                    'Billed in this currency. Local tax may be added at checkout. Renews automatically; cancel any time.',
                    'Ödeme bu para biriminde alınır. Ülkene göre vergi eklenebilir. Otomatik yenilenir, istediğin an iptal edebilirsin.',
                    'Abrechnung in dieser Währung. Lokale Steuern können hinzukommen. Verlängert sich automatisch, jederzeit kündbar.',
                  )}
                </p>
              )}
              <ul>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button className={'btn btn-block btn-shine ' + (plan.featured ? 'btn-grad' : 'btn-ghost')}
                onClick={() => choose(plan.key)}
                disabled={busyPlan === plan.key}>
                {busyPlan === plan.key
                  ? L('Redirecting…', 'Yönlendiriliyor…', 'Weiterleitung…')
                  : plan.cta}
              </button>
            </article>
          </Reveal>
        ))}
      </section>
    </div>
  );
}
