import { useEffect, useState } from 'react';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import { saveLinkAnalysisHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import AiText from '../components/AiText.jsx';
import { useSeo } from '../lib/seo';
import './LinkAnalysis.css';

const MAX_LINKS = 4;
const PENDING_LINK_KEY = 'qor.pendingLinkAnalysis';

function singlePrompt(url, lang) {
  return (
    `A user wants to analyze the product at this link: ${url}\n\n` +
    'Identify the product and give a clear review under these headings: ' +
    '1) Product name (your best guess) 2) Short summary (2-3 sentences) ' +
    '3) Pros (bullet list with "-") 4) Cons (bullet list with "-") ' +
    '5) Who it suits / Qor AI recommendation.\n' +
    'If you cannot open the link, infer the product from the URL slug and use your knowledge. ' +
    `Make headings **bold**. Reply ONLY in the language with ISO code: ${lang}.`
  );
}

function comparePrompt(urls, lang) {
  return (
    'A user wants to compare the products behind these links:\n' +
    urls.map((u, i) => `${i + 1}. ${u}`).join('\n') +
    '\n\nIdentify each product from its URL, then compare them. Give: a short intro, ' +
    'a **head-to-head** section covering price, performance, key strengths and weaknesses ' +
    'of each, and finish with a **Qor AI Verdict** heading saying which to pick and for whom. ' +
    'Use "-" for bullets and **bold** headings. ' +
    `Reply ONLY in the language with ISO code: ${lang}.`
  );
}

export default function LinkAnalysis() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('la.title')} — Qor AI`, description: t('la.subtitle'), path: '/link-analysis' });
  const [urls, setUrls] = useState(['']);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function setUrl(i, val) {
    setUrls((u) => u.map((x, idx) => (idx === i ? val : x)));
  }
  function addUrl() {
    setUrls((u) => (u.length < MAX_LINKS ? [...u, ''] : u));
  }
  function removeUrl(i) {
    setUrls((u) => u.filter((_, idx) => idx !== i));
  }

  async function runAnalysis(list) {
    setErr(''); setBusy(true); setResult('');
    trackEvent('link_analysis', { count: list.length });
    try {
      const prompt = list.length > 1 ? comparePrompt(list, lang) : singlePrompt(list[0], lang);
      const text = await askQorAi([{ role: 'user', text: prompt }]);
      setResult(text);
      saveLinkAnalysisHistory({ urls: list, analysis: text, type: list.length > 1 ? 'compare' : 'single' });
    } catch {
      setErr(t('la.errFail'));
    } finally {
      setBusy(false);
    }
  }

  async function analyze(e) {
    e.preventDefault();
    const list = urls.map((u) => u.trim()).filter(Boolean);
    if (!list.length) return;
    if (list.some((u) => !/^https?:\/\//i.test(u))) { setErr(t('la.errUrl')); return; }
    if (!user) {
      localStorage.setItem(PENDING_LINK_KEY, JSON.stringify({ urls: list, ts: Date.now() }));
      setErr(L('Sign in to continue. Your links are saved.', 'Devam etmek için giriş yap. Linklerin kaybolmayacak.', 'Melde dich an, um fortzufahren. Deine Links bleiben erhalten.'));
      openAuth();
      return;
    }
    await runAnalysis(list);
  }

  useEffect(() => {
    if (!user) return;
    const raw = localStorage.getItem(PENDING_LINK_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_LINK_KEY);
    try {
      const pending = JSON.parse(raw);
      const list = Array.isArray(pending.urls) ? pending.urls.slice(0, MAX_LINKS).filter(Boolean) : [];
      if (!list.length) return;
      setUrls(list);
      runAnalysis(list);
    } catch {
      // Ignore stale pending payloads.
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const filled = urls.filter((u) => u.trim()).length;

  return (
    <div className="container la">
      <div className="la-head">
        <div className="la-icon">🔗</div>
        <h1>{t('la.title')}</h1>
        <p>{t('la.subtitle')}</p>
      </div>

      <form className="la-form" onSubmit={analyze}>
        <div className="la-rows">
          {urls.map((url, i) => (
            <div className="la-row" key={i}>
              <span className="la-row-no">{i + 1}</span>
              <input type="url" value={url} onChange={(e) => setUrl(i, e.target.value)}
                placeholder={t('la.placeholder')} />
              {urls.length > 1 && (
                <button type="button" className="la-row-x" onClick={() => removeUrl(i)} aria-label="✕">✕</button>
              )}
            </div>
          ))}
        </div>

        <div className="la-actions">
          {urls.length < MAX_LINKS && (
            <button type="button" className="la-add" onClick={addUrl}>{t('la.addLink')}</button>
          )}
          <button type="submit" className="btn btn-primary la-go" disabled={busy}>
            {busy ? t('la.analyzing')
              : filled > 1 ? t('la.analyzeMany', { n: filled }) : t('la.analyzeOne')}
          </button>
        </div>
        <p className="la-hint">{t('la.hintMulti')}</p>
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
