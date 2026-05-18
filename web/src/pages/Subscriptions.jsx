import { useState } from 'react';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import AiText from '../components/AiText.jsx';
import './Subscriptions.css';

const PRESETS = [
  'Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Amazon Prime',
  'Adobe Creative Cloud', 'iCloud+', 'Microsoft 365', 'ChatGPT Plus', 'Claude Pro',
  'Xbox Game Pass', 'Apple Music', 'Spotify Premium', 'BluTV',
];

const PROMPT = (subs) =>
  `Şu dijital abonelikleri karşılaştır: ${subs.join(', ')}.\n\n` +
  'Türkçe, sade ve net bir karşılaştırma yap. Her abonelik için: yaklaşık aylık fiyat, ' +
  'ne işe yaradığı, artıları ve eksileri. Sonunda **Qor AI Tavsiyesi** başlığıyla kimin ' +
  'hangisini seçmesi gerektiğini söyle. Başlıkları **kalın** yaz, maddeleri "-" ile yaz.';

export default function Subscriptions() {
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
      setResult(await askQorAi([{ role: 'user', text: PROMPT(selected) }]));
    } catch {
      setResult('Karşılaştırma şu an yapılamadı. Birazdan tekrar dene.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container subs">
      <div className="subs-head">
        <div className="subs-icon">📺</div>
        <h1>Abonelik <span className="grad-text">Karşılaştırma</span></h1>
        <p>Dijital aboneliklerini seç — Qor AI fiyat, özellik ve değer açısından kıyaslasın.</p>
      </div>

      <div className="subs-pills">
        {PRESETS.filter((p, i) => PRESETS.indexOf(p) === i).map((name) => (
          <button key={name}
            className={'subs-pill' + (selected.includes(name) ? ' active' : '')}
            onClick={() => toggle(name)}>
            {selected.includes(name) ? '✓ ' : '+ '}{name}
          </button>
        ))}
      </div>

      <form className="subs-custom" onSubmit={addCustom}>
        <input value={custom} onChange={(e) => setCustom(e.target.value)}
          placeholder="Listede yok mu? Abonelik adı yaz ve ekle…" />
        <button type="submit" className="btn btn-ghost">Ekle</button>
      </form>

      {selected.length > 0 && (
        <div className="subs-selected">
          {selected.map((s) => (
            <span key={s} className="subs-chip">
              {s}<button onClick={() => toggle(s)} aria-label="Çıkar">✕</button>
            </span>
          ))}
        </div>
      )}

      <button className="btn btn-primary btn-lg subs-go"
        onClick={compare} disabled={busy || selected.length < 2}>
        {busy ? 'Karşılaştırılıyor…' : selected.length < 2
          ? 'En az 2 abonelik seç' : `${selected.length} aboneliği karşılaştır`}
      </button>

      {busy && (
        <div className="subs-loading"><div className="spinner" /><span>Qor AI karşılaştırıyor…</span></div>
      )}

      {result && (
        <div className="subs-result fade-up">
          <div className="subs-result-head">🧠 Qor AI Karşılaştırması</div>
          <div className="subs-result-body"><AiText text={result} /></div>
        </div>
      )}
    </div>
  );
}
