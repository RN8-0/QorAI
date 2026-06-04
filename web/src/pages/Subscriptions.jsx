import { useEffect, useState } from 'react';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import { saveSubscriptionHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import AiText from '../components/AiText.jsx';
import { useSeo } from '../lib/seo';
import './Subscriptions.css';

const PRESETS = [
  'Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Amazon Prime',
  'Adobe Creative Cloud', 'iCloud+', 'Microsoft 365', 'ChatGPT Plus', 'Claude Pro',
  'Xbox Game Pass', 'Apple Music',
];
const PENDING_SUBS_KEY = 'qor.pendingSubscriptionAnalysis';

const PROMPT = (subs, lang) =>
  `Compare these digital subscriptions: ${subs.join(', ')}.\n\n` +
  'Give a clear, simple comparison. For each: approximate monthly price, what it does, ' +
  'pros and cons. End with a **Qor AI Recommendation** heading saying who should pick which. ' +
  `Make headings **bold**, use "-" for bullet points. Reply ONLY in the language with ISO code: ${lang}.`;

function pricingPlans(L) {
  return [
    {
      name: 'Free',
      price: '$0',
      cadence: L('forever', 'sürekli', 'dauerhaft'),
      cta: L('Start free', 'Ücretsiz başla', 'Kostenlos starten'),
      features: [
        L('20 welcome Q coins', '20 hoş geldin Q Coin', '20 Willkommens-Q-Coins'),
        L('3 product link analyses per day', 'Günde 3 ürün link analizi', '3 Produktlink-Analysen pro Tag'),
        L('3 subscription analyses per day', 'Günde 3 abonelik analizi', '3 Abo-Analysen pro Tag'),
        L('Basic catalog search and comparison', 'Temel katalog arama ve karşılaştırma', 'Basis-Suche und Vergleich'),
      ],
    },
    {
      name: 'Pro',
      price: '$3.99',
      cadence: L('per month', 'aylık', 'pro Monat'),
      cta: L('Get Pro', 'Pro’ya geç', 'Pro aktivieren'),
      highlight: true,
      features: [
        L('3-day free trial', '3 gün ücretsiz deneme', '3 Tage kostenlos testen'),
        L('Unlimited premium AI product analysis', 'Sınırsız premium AI ürün analizi', 'Unbegrenzte Premium-KI-Produktanalyse'),
        L('Advanced link and subscription analysis', 'Gelişmiş link ve abonelik analizi', 'Erweiterte Link- und Abo-Analyse'),
        L('90-day price history and smarter alternatives', '90 günlük fiyat geçmişi ve akıllı alternatifler', '90 Tage Preisverlauf und smarte Alternativen'),
      ],
    },
    {
      name: 'Pro Yearly',
      price: '$19.99',
      cadence: L('per year', 'yıllık', 'pro Jahr'),
      cta: L('Save with yearly', 'Yıllık al', 'Jährlich sparen'),
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

export default function Subscriptions() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('subs.title')} — Qor AI`, description: t('subs.subtitle'), path: '/subscriptions' });
  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(name) {
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
  }
  function addCustom(e) {
    e.preventDefault();
    const v = custom.trim();
    if (v && !selected.includes(v)) setSelected((s) => [...s, v]);
    setCustom('');
  }

  async function runCompare(items) {
    setBusy(true); setResult('');
    trackEvent('subscription_compare', { count: items.length });
    try {
      const text = await askQorAi([{ role: 'user', text: PROMPT(items, lang) }]);
      setResult(text);
      saveSubscriptionHistory({ services: items, analysis: text });
    } catch {
      setResult(t('la.errFail'));
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    if (selected.length < 2) return;
    if (!user) {
      localStorage.setItem(PENDING_SUBS_KEY, JSON.stringify({ selected, custom, ts: Date.now() }));
      openAuth();
      return;
    }
    await runCompare(selected);
  }

  function choosePlan() {
    if (!user) {
      openAuth();
      return;
    }
    window.location.href = 'https://play.google.com/store/apps/details?id=com.compair.app';
  }

  useEffect(() => {
    if (!user) return;
    const raw = localStorage.getItem(PENDING_SUBS_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_SUBS_KEY);
    try {
      const pending = JSON.parse(raw);
      const items = Array.isArray(pending.selected) ? pending.selected.filter(Boolean) : [];
      if (items.length < 2) return;
      setSelected(items);
      setCustom(pending.custom || '');
      runCompare(items);
    } catch {
      // Ignore stale pending payloads.
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container subs">
      <div className="subs-head">
        <div className="subs-icon">📺</div>
        <h1>{t('subs.title')}</h1>
        <p>{t('subs.subtitle')}</p>
      </div>

      <div className="subs-pills">
        {PRESETS.map((name) => (
          <button key={name}
            className={'subs-pill' + (selected.includes(name) ? ' active' : '')}
            onClick={() => toggle(name)}>
            {selected.includes(name) ? '✓ ' : '+ '}{name}
          </button>
        ))}
      </div>

      <form className="subs-custom" onSubmit={addCustom}>
        <input value={custom} onChange={(e) => setCustom(e.target.value)}
          placeholder={t('subs.customPlaceholder')} />
        <button type="submit" className="btn btn-ghost">{t('subs.add')}</button>
      </form>

      {selected.length > 0 && (
        <div className="subs-selected">
          {selected.map((s) => (
            <span key={s} className="subs-chip">
              {s}<button onClick={() => toggle(s)} aria-label="✕">✕</button>
            </span>
          ))}
        </div>
      )}

      <button className="btn btn-primary btn-lg subs-go"
        onClick={compare} disabled={busy || selected.length < 2}>
        {busy ? t('subs.analyzing') : selected.length < 2
          ? t('subs.goMin') : t('subs.go', { n: selected.length })}
      </button>

      <section className="subs-pricing" id="premium">
        <div className="subs-pricing-head">
          <span>Premium</span>
          <h2>{L('Plans for deeper AI analysis', 'Daha derin AI analizi için planlar', 'Pläne für tiefere KI-Analysen')}</h2>
        </div>
        <div className="subs-plan-grid">
          {pricingPlans(L).map((plan) => (
            <article key={plan.name} className={'subs-plan' + (plan.highlight ? ' featured' : '')}>
              {plan.badge && <div className="subs-plan-badge">{plan.badge}</div>}
              <h3>{plan.name}</h3>
              <div className="subs-price"><b>{plan.price}</b><span>{plan.cadence}</span></div>
              <ul>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button className={'btn btn-block ' + (plan.highlight ? 'btn-primary' : 'btn-ghost')}
                onClick={choosePlan}>
                {plan.cta}
              </button>
            </article>
          ))}
        </div>
      </section>

      {busy && (
        <div className="subs-loading"><div className="spinner" /><span>{t('subs.loading')}</span></div>
      )}

      {result && (
        <div className="subs-result fade-up">
          <div className="subs-result-head">{t('subs.resultHead')}</div>
          <div className="subs-result-body"><AiText text={result} /></div>
        </div>
      )}
    </div>
  );
}
