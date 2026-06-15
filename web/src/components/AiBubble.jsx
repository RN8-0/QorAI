import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import { useAuth } from '../lib/auth';
import { aiUserProfile, hasCompletedQuiz } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import { productPath } from '../lib/routes';
import { searchProducts } from '../lib/typesense';
import { useGeoCountry } from '../lib/geo';
import { CURRENCY_BY_COUNTRY, formatPriceAmount } from '../lib/format';
import { useI18n } from '../i18n/index.jsx';
import AiText from './AiText.jsx';
import './AiBubble.css';

// A sensible mid-range phone budget per currency, so the "best phone under X"
// quick prompt always shows the visitor's OWN currency/market — never a Turkish
// Lira figure to a US user or vice-versa.
const PHONE_BUDGET_BY_CURRENCY = {
  USD: 400, EUR: 400, GBP: 350, TRY: 30000, CAD: 550, AUD: 600,
  CHF: 400, PLN: 1800, MXN: 8000, BRL: 2500, RUB: 35000,
};

function productUrl(product) {
  try {
    return new URL(productPath(product), window.location.origin).toString();
  } catch {
    return productPath(product);
  }
}

function compactSpecs(product) {
  const raw = String(product?.keySpecsText || '').replace(/\s+/g, ' ').trim();
  if (raw) return raw.slice(0, 260);
  const specs = [];
  if (product?.screenSizeValue) specs.push(`screen ${product.screenSizeValue}"`);
  if (product?.batteryCapacityValue) specs.push(`battery ${product.batteryCapacityValue} mAh`);
  if (product?.weightValueKg) specs.push(`weight ${product.weightValueKg} kg`);
  return specs.join(', ');
}

function buildCatalogContext(results = [], lang = 'en') {
  const items = results.filter((p) => p?.id && p?.name).slice(0, 5);
  if (!items.length) {
    return [
      'Qor catalog search returned no strong product match for this message.',
      'If the question is about a product, answer with careful public product knowledge and say live prices/availability should be verified.',
    ].join('\n');
  }
  return [
    `Site language code: ${lang}`,
    'Relevant Qor catalog matches. Prefer these when answering product questions:',
    ...items.map((p, i) => {
      const bits = [
        `${i + 1}. ${p.name}`,
        p.brand ? `Brand: ${p.brand}` : '',
        p.category ? `Category: ${p.category}` : '',
        p.techScore ? `Qor AI score: ${Math.round(Number(p.techScore) || 0)}` : '',
        compactSpecs(p) ? `Specs: ${compactSpecs(p)}` : '',
        `Qor link: ${productUrl(p)}`,
        p.lowestOfferUrl ? `Store link: ${p.lowestOfferUrl}` : '',
        p.sourceUrl ? `Source link: ${p.sourceUrl}` : '',
      ].filter(Boolean);
      return bits.join(' | ');
    }),
  ].join('\n');
}

export default function AiBubble() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requireAiAccess = useAiAccess(lang);
  const [open, setOpen] = useState(false);
  const greetingRef = useRef(null);
  if (!greetingRef.current) greetingRef.current = { role: 'model', text: t('ai.greeting') };
  const [msgs, setMsgs] = useState(() => [greetingRef.current]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const sendRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;
  const geoCountry = useGeoCountry();
  const currency = CURRENCY_BY_COUNTRY[String(geoCountry || '').toUpperCase()] || 'USD';

  // Quick prompts follow the SITE LANGUAGE (templates) but the user's COUNTRY
  // for the price figure — so the budget suggestion is always in their currency.
  const budget = PHONE_BUDGET_BY_CURRENCY[currency] || PHONE_BUDGET_BY_CURRENCY.USD;
  const s1 = t('ai.s1', { price: formatPriceAmount(budget, currency, lang) });
  const suggestions = [s1, t('ai.s2'), t('ai.s3')];

  function goQuiz() {
    const next = `${location.pathname}${location.search}${location.hash}`;
    setOpen(false);
    navigate(`/quiz?required=1&next=${encodeURIComponent(next)}`);
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy, open]);

  useEffect(() => {
    const onOpen = (e) => {
      if (!userRef.current) { openAuth(); return; }
      if (!hasCompletedQuiz(userRef.current)) { goQuiz(); return; }
      setOpen(true);
      const q = e.detail;
      if (q && typeof q === 'string') setTimeout(() => sendRef.current?.(q), 120);
    };
    window.addEventListener('qor-open-ai', onOpen);
    return () => window.removeEventListener('qor-open-ai', onOpen);
  }, [location.hash, location.pathname, location.search, navigate, openAuth]);

  async function send(text) {
    if (!userRef.current) { setOpen(false); openAuth(); return; }
    if (!hasCompletedQuiz(userRef.current)) { goQuiz(); return; }
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    const next = [...msgs, { role: 'user', text: q }];
    setMsgs(next);
    setBusy(true);
    trackEvent('ai_chat_message');
    try {
      const access = await requireAiAccess('ai_chat', {
        onMessage: (message) => setMsgs((m) => [...m, { role: 'model', text: message }]),
      });
      if (!access.ok) return;
      const profile = aiUserProfile(userRef.current);
      const profileContext = hasCompletedQuiz(userRef.current)
        ? [{
          role: 'user',
          text: `Use this Qor AI profile context silently when advising, without listing it back:\n${JSON.stringify(profile)}`,
        }]
        : [];
      const catalogResults = await searchProducts(q, 5).catch(() => []);
      const catalogContext = buildCatalogContext(catalogResults, lang);
      const reply = await askQorAi([
        ...profileContext,
        ...next.filter((m, i) => !(i === 0 && m === greetingRef.current)),
      ], { language: lang, context: catalogContext, country: geoCountry, currency });
      setMsgs((m) => [...m, { role: 'model', text: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: 'model', text: t('ai.errReply') }]);
    } finally {
      setBusy(false);
    }
  }
  sendRef.current = send;

  return (
    <>
      <button
        className={'aib-fab' + (open ? ' open' : '')}
        onClick={() => {
          if (!open && !user) { openAuth(); return; }
          if (!open && user && !hasCompletedQuiz(user)) { goQuiz(); return; }
          setOpen((o) => !o);
        }}
        aria-label="Qor AI"
      >
        {open ? '✕' : <img src="/assets/qor_logo_512.png?v=20260605a" alt="" />}
        {!open && <span className="aib-fab-pulse" />}
      </button>

      {open && (
        <div className="aib-panel fade-up">
          <div className="aib-head">
            <div className="aib-head-id">
              <img src="/assets/qor_logo_512.png?v=20260605a" alt="Qor AI" />
              <div>
                <strong>Qor AI</strong>
                <span>{t('ai.subtitle')}</span>
              </div>
            </div>
            <button className="aib-head-x" onClick={() => setOpen(false)} aria-label="✕">✕</button>
          </div>

          <div className="aib-msgs" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div key={i} className={'aib-msg ' + m.role}>
                {m.role === 'model' ? <AiText text={m.text} /> : m.text}
              </div>
            ))}
            {busy && (
              <div className="aib-msg model aib-typing"><span /><span /><span /></div>
            )}
            {msgs.length === 1 && (
              <div className="aib-suggest">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <form className="aib-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('ai.placeholder')}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="→">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
