import { useState } from 'react';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import { saveSubscriptionHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import AiText from '../components/AiText.jsx';
import './Subscriptions.css';

const PRESETS = [
  'Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Amazon Prime',
  'Adobe Creative Cloud', 'iCloud+', 'Microsoft 365', 'ChatGPT Plus', 'Claude Pro',
  'Xbox Game Pass', 'Apple Music',
];

const PROMPT = (subs, lang) =>
  `Compare these digital subscriptions: ${subs.join(', ')}.\n\n` +
  'Give a clear, simple comparison. For each: approximate monthly price, what it does, ' +
  'pros and cons. End with a **Qor AI Recommendation** heading saying who should pick which. ' +
  `Make headings **bold**, use "-" for bullet points. Reply ONLY in the language with ISO code: ${lang}.`;

export default function Subscriptions() {
  const { t, lang } = useI18n();
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

  async function compare() {
    if (selected.length < 2) return;
    setBusy(true); setResult('');
    trackEvent('subscription_compare', { count: selected.length });
    try {
      const text = await askQorAi([{ role: 'user', text: PROMPT(selected, lang) }]);
      setResult(text);
      saveSubscriptionHistory({ services: selected, analysis: text });
    } catch {
      setResult(t('la.errFail'));
    } finally {
      setBusy(false);
    }
  }

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
