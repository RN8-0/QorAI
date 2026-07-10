import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { askQorAi, askQorAiGrounded } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import { useAuth } from '../lib/auth';
import { aiUserProfile, hasCompletedQuiz } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import { productPath } from '../lib/routes';
import { searchProducts, getProduct } from '../lib/typesense';
import { useGeoCountry } from '../lib/geo';
import { getPageContext, getPageMeta, setPageContext, subscribePageContext } from '../lib/pageContext';
import { CURRENCY_BY_COUNTRY, formatPriceAmount, priceForCountry } from '../lib/format';
import { displayProductName } from '../lib/productNames';
import { localizedSpecLabel, localizedSpecValue } from '../lib/specDisplay';
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

// Query words that carry no product identity — ignored when deciding whether a
// message is "about a specific product the catalog should have".
const STOP = new Set([
  'the', 'and', 'for', 'with', 'best', 'good', 'vs', 'or', 'is', 'are', 'a', 'an',
  've', 'ile', 'en', 'iyi', 'mi', 'mu', 'mı', 'için', 'bir', 'ya', 'da', 'de',
  'under', 'altı', 'alti', 'öneri', 'oneri', 'öner', 'hangi', 'nasıl', 'nasil',
  'phone', 'telefon', 'laptop', 'tablet', 'kulaklık', 'kulaklik',
]);

// Brand / model tokens that mark a message as a SPECIFIC product query, so we
// trigger a live web search when the Qor catalog has no confident match (instead
// of letting the model guess "not released yet" from stale memory).
const BRAND_RE = /\b(iphone|samsung|galaxy|xiaomi|redmi|poco|apple|macbook|imac|ipad|pixel|oneplus|realme|oppo|vivo|huawei|honor|nothing|asus|zenbook|rog|acer|lenovo|thinkpad|legion|hp|omen|victus|dell|xps|alienware|msi|razer|gigabyte|nvidia|geforce|rtx|gtx|radeon|amd|ryzen|threadripper|intel|core|arc|sony|bravia|lg|oled|tcl|hisense|nokia|motorola|moto|surface|playstation|ps5|xbox|nintendo|switch|airpods|airpod|bose|jbl|sennheiser|beats|marshall|dyson|logitech|corsair|steelseries|hyperx|garmin|fitbit|kindle|roborock|dreame|ecovacs)\b/i;
const MODEL_RE = /\b(?:[a-z]{1,4}-?\d{2,5}[a-z]{0,3}|\d{1,2}\s?(?:pro|ultra|max|plus|mini|air|gen|se)\b|m[1-9]\b)/i;

function looksLikeProduct(q) {
  return BRAND_RE.test(q) || MODEL_RE.test(q);
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// A catalog hit "strongly" answers the query only when the query's identifying
// tokens really appear in the product name/brand — so a typo-tolerant search
// returning a loosely-related product for "Galaxy S99 Ultra" is NOT treated as an
// on-site match (that message goes to web research instead).
function strongMatch(q, p) {
  const hay = norm(`${p?.name || ''} ${p?.brand || ''}`);
  if (!hay) return false;
  // Digit-bearing model tokens can be 2 chars ("15", "s24"); plain words need 3.
  const toks = norm(q).split(' ').filter((w) => (/\d/.test(w) ? w.length >= 2 : w.length >= 3) && !STOP.has(w));
  if (!toks.length) return false;
  // Model-number tokens ARE the product's identity — every one must appear, so a
  // non-existent "Galaxy S99 Ultra" never matches an on-site "Galaxy Watch Ultra".
  const idToks = toks.filter((w) => /\d/.test(w));
  if (idToks.length && !idToks.every((w) => hay.includes(w))) return false;
  const hit = toks.filter((w) => hay.includes(w)).length;
  return hit >= Math.max(2, Math.ceil(toks.length * 0.6));
}

function productUrl(product) {
  try {
    return new URL(productPath(product), window.location.origin).toString();
  } catch {
    return productPath(product);
  }
}

// Up to ~8 clean "Label: value" spec lines from the product's Qor data, in the
// UI language (source Turkish when the visitor + product are both Turkish).
function specDigest(product, lang) {
  const specLang = String(lang || 'en').slice(0, 2).toLowerCase();
  const trSrc = String(product?.sourceLang || '').toLowerCase() === 'tr' && specLang === 'tr';
  const src = (trSrc && product?.sourceKeySpecs && Object.keys(product.sourceKeySpecs).length)
    ? product.sourceKeySpecs
    : (product?.keySpecs && Object.keys(product.keySpecs).length ? product.keySpecs : null);
  const rows = [];
  if (src) {
    for (const [k, v] of Object.entries(src)) {
      const val = localizedSpecValue(String(v ?? ''), lang).split('\n')[0];
      if (!val) continue;
      rows.push(`${localizedSpecLabel(k, lang)}: ${val}`);
      if (rows.length >= 8) break;
    }
  }
  if (!rows.length) {
    const raw = String(product?.keySpecsText || '').replace(/\s+/g, ' ').trim();
    if (raw) return raw.slice(0, 240);
  }
  return rows.join('; ');
}

// STRONG grounding block from real Qor data: specs + the visitor-market price.
// The chat prompt is told to treat this as the source of truth.
function pbGrounding(products, country, lang) {
  const lines = products.slice(0, 3).map((p, i) => {
    const cp = priceForCountry(p, country);
    const digest = specDigest(p, lang);
    return [
      `${i + 1}. ${displayProductName(p, lang) || p.name}`,
      p.brand ? `Brand: ${p.brand}` : '',
      p.category ? `Category: ${p.category}` : '',
      Number(p.techScore) ? `Qor AI score: ${Math.round(Number(p.techScore))}/100` : '',
      cp ? `Qor price (${country || 'local'}): ${formatPriceAmount(cp.price, cp.currency, lang)}`
        : `Qor price: not listed for ${country || 'this market'} — say it should be checked on the product page`,
      digest ? `Specs: ${digest}` : '',
      `Qor page: ${productUrl(p)}`,
    ].filter(Boolean).join(' | ');
  });
  return [
    'QOR CATALOG DATA — the person is looking at / asking about these products.',
    'Use these Qor specs and prices as the source of truth; this product EXISTS on Qor:',
    ...lines,
  ].join('\n');
}

// Loose fallback context when there is no confident product — the search hits
// are offered as candidate options for a general recommendation question.
function buildCatalogContext(results = [], lang = 'en') {
  const items = results.filter((p) => p?.id && p?.name).slice(0, 5);
  if (!items.length) {
    return [
      `Site language code: ${lang}`,
      'Qor catalog search returned no strong product match for this message.',
      'Answer from careful public product knowledge. Do NOT claim a product does not exist or has not launched — if unsure of current status/price, say it should be verified on the store/official page.',
    ].join('\n');
  }
  return [
    `Site language code: ${lang}`,
    'Relevant Qor catalog options. Prefer these when recommending products:',
    ...items.map((p, i) => [
      `${i + 1}. ${displayProductName(p, lang) || p.name}`,
      p.brand ? `Brand: ${p.brand}` : '',
      p.category ? `Category: ${p.category}` : '',
      Number(p.techScore) ? `Qor AI score: ${Math.round(Number(p.techScore) || 0)}` : '',
      `Qor link: ${productUrl(p)}`,
    ].filter(Boolean).join(' | ')),
  ].join('\n');
}

function webResearchPrompt(q, lang) {
  return `The user asked: "${q}". Using web search, report the CURRENT reality of any product/subscription named: does it exist and has it launched (or is it rumored/unreleased — say which and the expected timeframe), its official key specs, the typical current market price, and the general review/community sentiment. Be concise and factual. Reply in ${lang}.`;
}

// Page-aware opening line: reads the current route + page metadata so the chat
// greets the visitor with what they're actually looking at and what to ask.
function pageGreeting(lang, pathname, meta, t) {
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const bare = String(pathname || '').replace(/^\/(en|de)(?=\/|$)/, '') || '/';
  const kind = meta?.kind || (
    bare.startsWith('/product/') ? 'product'
      : bare.startsWith('/compare') ? 'compare'
        : bare.startsWith('/category') ? 'category'
          : bare.startsWith('/blog/') ? 'blog'
            : bare.startsWith('/subscriptions') ? 'subscriptions'
              : bare.startsWith('/link-analysis') ? 'link'
                : '');
  const title = meta?.title || '';
  switch (kind) {
    case 'product':
      return title
        ? L(`You're viewing **${title}**. Ask me about its specs, price, who it's for, or how it stacks up against rivals — I'll use Qor's data.`,
          `**${title}** sayfasındasın. Özelliklerini, fiyatını, kime uygun olduğunu ya da rakipleriyle farkını sorabilirsin — Qor verisini kullanırım.`,
          `Du siehst **${title}**. Frag mich zu Specs, Preis, Zielgruppe oder Vergleich — ich nutze Qor-Daten.`)
        : t('ai.greeting');
    case 'compare':
      return title
        ? L(`Comparing **${title}**. Ask which one fits you best and why — I'll weigh the specs and prices.`,
          `**${title}** karşılaştırmasındasın. Hangisi sana daha uygun ve neden — sorabilirsin, özellik ve fiyatları tartarım.`,
          `Vergleich: **${title}**. Frag, welches besser zu dir passt — ich wäge Specs und Preise ab.`)
        : L("You're comparing products. Ask me which one fits you best.",
          'Ürünleri karşılaştırıyorsun. Hangisi sana uygun, sorabilirsin.',
          'Du vergleichst Produkte. Frag, welches am besten passt.');
    case 'category':
      return title
        ? L(`You're browsing **${title}**. Tell me your budget or how you'll use it and I'll pick the best ${title} for you.`,
          `**${title}** kategorisindesin. Bütçeni ya da kullanım amacını söyle, sana en uygun **${title}** modelini seçeyim.`,
          `Du stöberst in **${title}**. Nenn mir Budget oder Einsatz und ich finde das beste Modell.`)
        : L('Browse any category and ask me for a recommendation.',
          'Bir kategoriye göz at, sana öneri sunayım.',
          'Stöbere in einer Kategorie und frag mich nach einer Empfehlung.');
    case 'blog':
      return title
        ? L(`You're reading **${title}**. Ask me anything about the products in it or a better pick for you.`,
          `**${title}** yazısını okuyorsun. İçindeki ürünler ya da sana daha uygun bir seçim hakkında sorabilirsin.`,
          `Du liest **${title}**. Frag mich zu den Produkten darin oder einer besseren Wahl.`)
        : t('ai.greeting');
    case 'subscriptions':
      return L("You're on Subscriptions. Ask me to compare plans (Netflix, Spotify, ChatGPT…) for what you need.",
        'Abonelikler sayfasındasın. İhtiyacına göre planları (Netflix, Spotify, ChatGPT…) karşılaştırmamı isteyebilirsin.',
        'Du bist bei Abos. Lass mich Pläne (Netflix, Spotify, ChatGPT…) für dich vergleichen.');
    case 'link':
      return L('You can paste any product link above for a full analysis — or just ask me anything here.',
        'Yukarıya herhangi bir ürün linki yapıştırıp tam analiz alabilirsin — ya da buradan bana sorabilirsin.',
        'Füge oben einen Produktlink für eine Analyse ein — oder frag mich einfach hier.');
    default:
      return t('ai.greeting');
  }
}

export default function AiBubble() {
  const { t, lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const { user, openAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requireAiAccess = useAiAccess(lang);
  const [open, setOpen] = useState(false);
  // Real conversation turns only — the greeting is derived + rendered live, so it
  // stays page-aware and never leaks into the model history.
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ctxVer, setCtxVer] = useState(0);
  const scrollRef = useRef(null);
  const sendRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;
  const geoCountry = useGeoCountry();
  const currency = CURRENCY_BY_COUNTRY[String(geoCountry || '').toUpperCase()] || 'USD';

  // Re-render the greeting when a page publishes new context (a product page
  // finishes loading its data after we've already mounted).
  useEffect(() => subscribePageContext(() => setCtxVer((v) => v + 1)), []);

  const greeting = useMemo(
    () => pageGreeting(lang, location.pathname, getPageMeta(), t),
    [lang, location.pathname, ctxVer, t],
  );

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
  }, [msgs, busy, open, greeting]);

  useEffect(() => {
    const onOpen = (e) => {
      // The panel always opens now — a logged-out visitor sees the greeting + a
      // sign-in button; we only auto-send a prompt once they can actually chat.
      setOpen(true);
      const q = e.detail;
      const canChat = userRef.current && hasCompletedQuiz(userRef.current);
      if (q && typeof q === 'string') {
        if (canChat) setTimeout(() => sendRef.current?.(q), 150);
        return;
      }
      if (q && typeof q === 'object') {
        if (q.context) setPageContext(String(q.context));
        if (q.prompt && canChat) setTimeout(() => sendRef.current?.(q.prompt), 150);
      }
    };
    window.addEventListener('qor-open-ai', onOpen);
    return () => window.removeEventListener('qor-open-ai', onOpen);
  }, []);

  // Decide the grounding for a message: an on-site Qor product (specs + market
  // price) first; a live web search when the message names a specific product the
  // catalog can't confidently match; otherwise the catalog search hits as options.
  async function buildGrounding(q) {
    const meta = getPageMeta();
    const onPageIds = Array.isArray(meta?.productIds) ? meta.productIds.slice(0, 3) : [];
    let results = [];
    try { results = await searchProducts(q, 6); } catch { results = []; }
    const strongIds = results.filter((p) => strongMatch(q, p)).map((p) => p.id);
    const ids = [...new Set([...strongIds, ...onPageIds])].slice(0, 3);
    if (ids.length) {
      const full = (await Promise.all(ids.map((id) => getProduct(id).catch(() => null)))).filter(Boolean);
      if (full.length) return pbGrounding(full, geoCountry, lang);
    }
    if (looksLikeProduct(q)) {
      try {
        const research = await askQorAiGrounded(webResearchPrompt(q, lang), {
          language: lang, timeoutMs: 20000, maxOutputTokens: 1200,
        });
        if (research && research.trim()) {
          return `LIVE WEB RESEARCH — current facts for "${q}" (trust this over older memory for launch status, specs and price):\n${research.trim()}`;
        }
      } catch { /* grounded search unavailable — fall through to catalog options */ }
    }
    return buildCatalogContext(results, lang);
  }

  async function send(text) {
    if (!userRef.current) { openAuth(); return; }
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
      const grounding = await buildGrounding(q);
      const ctxText = getPageContext() || (typeof document !== 'undefined' ? `${document.title} — ${location.pathname}` : '');
      const pageContext = ctxText
        ? [{ role: 'user', text: `The user is currently on this Qor AI page; use it as context when relevant (do not repeat it verbatim):\n${ctxText}` }]
        : [];
      const reply = await askQorAi([
        ...profileContext,
        ...pageContext,
        ...next,
      ], { language: lang, context: grounding, country: geoCountry, currency });
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
        onClick={() => setOpen((o) => !o)}
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
            <div className="aib-msg model"><AiText text={greeting} /></div>
            {msgs.map((m, i) => (
              <div key={i} className={'aib-msg ' + m.role}>
                {m.role === 'model' ? <AiText text={m.text} /> : m.text}
              </div>
            ))}
            {busy && (
              <div className="aib-msg model aib-typing"><span /><span /><span /></div>
            )}
            {!user ? (
              <div className="aib-login">
                <p>{L('Sign in to chat with Qor AI and get personalized answers.',
                  'Qor AI ile sohbet etmek ve sana özel yanıtlar almak için giriş yap.',
                  'Melde dich an, um mit Qor AI zu chatten und persönliche Antworten zu erhalten.')}</p>
                <button className="aib-login-btn" onClick={() => { setOpen(false); openAuth(); }}>
                  {L('Sign in', 'Giriş yap', 'Anmelden')}
                </button>
              </div>
            ) : msgs.length === 0 && (
              <div className="aib-suggest">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>

          {user && (
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
          )}
        </div>
      )}
    </>
  );
}
