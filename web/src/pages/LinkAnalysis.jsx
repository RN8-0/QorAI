import { useState } from 'react';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n/index.jsx';
import AiText from '../components/AiText.jsx';
import './LinkAnalysis.css';

const PROMPT = (url, lang) =>
  `A user wants to analyze the product at this link: ${url}\n\n` +
  'Identify the product and give a clear review under these headings: ' +
  '1) Product name (your best guess) 2) Short summary (2-3 sentences) ' +
  '3) Pros (bullet list with "-") 4) Cons (bullet list with "-") ' +
  '5) Who it suits / Qor AI recommendation.\n' +
  "If you cannot open the link, infer the product from the URL slug and use your knowledge. " +
  `Make headings **bold**. Reply ONLY in the language with ISO code: ${lang}.`;

export default function LinkAnalysis() {
  const { t, lang } = useI18n();
  const [url, setUrl] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function analyze(e) {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { setErr(t('la.errUrl')); return; }
    setErr(''); setBusy(true); setResult('');
    trackEvent('link_analysis');
    try {
      setResult(await askQorAi([{ role: 'user', text: PROMPT(u, lang) }]));
    } catch {
      setErr(t('la.errFail'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container la">
      <div className="la-head">
        <div className="la-icon">🔗</div>
        <h1>{t('la.title')}</h1>
        <p>{t('la.subtitle')}</p>
      </div>

      <form className="la-form" onSubmit={analyze}>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder={t('la.placeholder')} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t('la.analyzing') : t('la.analyze')}
        </button>
      </form>
      {err && <div className="la-err">{err}</div>}

      {busy && (
        <div className="la-loading">
          <div className="spinner" />
          <span>{t('la.loading')}</span>
        </div>
      )}

      {result && (
        <div className="la-result fade-up">
          <div className="la-result-head">{t('la.resultHead')}</div>
          <div className="la-result-body"><AiText text={result} /></div>
        </div>
      )}
    </div>
  );
}
