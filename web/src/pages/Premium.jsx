import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import PlayBadge from '../components/PlayBadge.jsx';
import Reveal from '../components/Reveal.jsx';
import './Premium.css';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.compair.app';

function plans(L) {
  return [
    {
      name: 'Free',
      price: '$0',
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
      price: '$3.99',
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
      price: '$19.99',
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

  function choose() {
    if (!user) {
      openAuth();
      return;
    }
    window.location.href = PLAY_URL;
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
          <PlayBadge className="premium-play" getItOn={L('GET IT ON', 'İNDİR', 'LADE BEI')}
            label={L('Google Play', "Google Play'den indir", 'Google Play')} />
        </div>
      </section>

      <section className="container premium-grid" aria-label="Premium plans">
        {plans(L).map((plan, i) => (
          <Reveal key={plan.name} delay={i * 90}>
            <article className={'premium-card lift' + (plan.featured ? ' featured grad-ring' : '')}>
              {plan.badge && <span className="premium-badge">{plan.badge}</span>}
              {plan.featured && <span className="premium-badge">{L('Most popular', 'En popüler', 'Am beliebtesten')}</span>}
              <h2>{plan.name}</h2>
              <div className="premium-price"><b>{plan.price}</b><span>{plan.cadence}</span></div>
              <ul>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button className={'btn btn-block btn-shine ' + (plan.featured ? 'btn-grad' : 'btn-ghost')}
                onClick={choose}>
                {plan.cta}
              </button>
            </article>
          </Reveal>
        ))}
      </section>

      <p className="premium-paynote" style={{
        textAlign: 'center',
        fontSize: '13px',
        lineHeight: 1.5,
        color: 'var(--text2, #64748b)',
        margin: '2px auto 30px',
        maxWidth: '560px',
        padding: '0 16px',
      }}>
        {L(
          'Subscriptions are currently available through Google Play. Web checkout is coming soon.',
          'Abonelikler şu anda geçici olarak Google Play üzerinden alınmaktadır. Web ödemesi yakında.',
          'Abonnements sind derzeit über Google Play verfügbar. Web-Bezahlung folgt in Kürze.',
        )}
      </p>
    </div>
  );
}
