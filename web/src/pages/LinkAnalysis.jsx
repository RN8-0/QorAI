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
    "You are Qor AI's web link analysis engine.\n" +
    `Analyze this product URL exactly: ${url}\n\n` +
    'Rules:\n' +
    '- Identify the exact product from the URL/domain/slug. Do not replace it with a similar product.\n' +
    '- If the URL cannot be opened or the exact model is uncertain, state the uncertainty clearly.\n' +
    '- Do not invent live prices. Mention that prices can change by region/store.\n' +
    '- Explain strengths, weaknesses, who it suits, and whether the user should buy, wait or skip.\n\n' +
    'Output with these **bold** headings: Product, Qor AI summary, Strengths, Weaknesses, Best for, Verdict. ' +
    `Use "-" bullets. Reply ONLY in the language with ISO code: ${lang}.`
  );
}

function comparePrompt(urls, lang) {
  return (
    "You are Qor AI's product comparison engine.\n" +
    'Analyze these product URLs exactly:\n' +
    urls.map((u, i) => `${i + 1}. ${u}`).join('\n') +
    '\n\nRules:\n' +
    '- Identify each exact product from its URL/domain/slug. Do not substitute nearby models.\n' +
    '- If any product is uncertain, keep it in the comparison and mark it uncertain.\n' +
    '- Compare only what can be reasonably inferred; do not invent live prices.\n' +
    '- End with a clear recommendation for different user types.\n\n' +
    'Output with **bold** headings: Products identified, Head-to-head, Strengths and weaknesses, Qor AI verdict. ' +
    `Use "-" bullets. Reply ONLY in the language with ISO code: ${lang}.`
  );
}

export default function LinkAnalysis() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('la.title')} — Qor AI`, description: t('la.subtitle'), path: '/link-analysis' });
  const [urls, setUrls] = useState(['']);
  const [mode, setMode] = useState('single');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function setUrl(i, val) {
    setUrls((u) => u.map((x, idx) => (idx === i ? val : x)));
  }

  function addUrl() {
    setMode('compare');
    setUrls((u) => (u.length < MAX_LINKS ? [...u, ''] : u));
  }

  function removeUrl(i) {
    setUrls((u) => {
      const next = u.filter((_, idx) => idx !== i);
      if (next.length <= 1) setMode('single');
      return next.length ? next : [''];
    });
  }

  async function runAnalysis(list) {
    setErr('');
    setBusy(true);
    setResult('');
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
    const list = urls.map((u) => u.trim()).filter(Boolean).slice(0, MAX_LINKS);
    if (!list.length) return;
    if (list.some((u) => !/^https?:\/\//i.test(u))) { setErr(t('la.errUrl')); return; }
    if (!user) {
      localStorage.setItem(PENDING_LINK_KEY, JSON.stringify({ urls: list, mode, ts: Date.now() }));
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
      setMode(list.length > 1 ? 'compare' : 'single');
      runAnalysis(list);
    } catch {
      // Ignore stale pending payloads.
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const filled = urls.filter((u) => u.trim()).length;

  return (
    <div className="container la">
      <div className="la-head">
        <div className="la-icon">LINK</div>
        <h1>{t('la.title')}</h1>
        <p>{t('la.subtitle')}</p>
      </div>

      <div className="la-mode" role="tablist" aria-label="Link mode">
        <button type="button" className={mode === 'single' ? 'active' : ''}
          onClick={() => { setMode('single'); setUrls((u) => [u[0] || '']); }}>
          {L('Single product', 'Tek ürün', 'Ein Produkt')}
        </button>
        <button type="button" className={mode === 'compare' ? 'active' : ''}
          onClick={() => { setMode('compare'); setUrls((u) => (u.length > 1 ? u : [...u, ''])); }}>
          {L('Compare links', 'Linkleri karşılaştır', 'Links vergleichen')}
        </button>
      </div>

      <form className="la-form" onSubmit={analyze}>
        <div className="la-form-head">
          <strong>{L('Paste product URLs', 'Ürün linklerini yapıştır', 'Produkt-URLs einfügen')}</strong>
          <span>{mode === 'compare' ? t('la.hintMulti') : L('Qor AI will identify the exact product before reviewing it.', 'Qor AI yorumlamadan önce ürünü kesin olarak tanımlar.', 'Qor AI erkennt zuerst das exakte Produkt.')}</span>
        </div>
        <div className="la-rows">
          {urls.map((url, i) => (
            <div className="la-row" key={i}>
              <span className="la-row-no">{i + 1}</span>
              <input type="url" value={url} onChange={(e) => setUrl(i, e.target.value)}
                placeholder={t('la.placeholder')} />
              {urls.length > 1 && (
                <button type="button" className="la-row-x" onClick={() => removeUrl(i)} aria-label="Remove">×</button>
              )}
            </div>
          ))}
        </div>

        <div className="la-actions">
          {mode === 'compare' && urls.length < MAX_LINKS && (
            <button type="button" className="la-add" onClick={addUrl}>{t('la.addLink')}</button>
          )}
          {mode === 'single' && (
            <button type="button" className="la-add" onClick={addUrl}>{L('Switch to compare', 'Karşılaştırmaya geç', 'Zum Vergleich wechseln')}</button>
          )}
          <button type="submit" className="btn btn-primary la-go" disabled={busy}>
            {busy ? t('la.analyzing')
              : filled > 1 ? t('la.analyzeMany', { n: filled }) : t('la.analyzeOne')}
          </button>
        </div>
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
