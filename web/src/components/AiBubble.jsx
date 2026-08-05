import { useState, useRef, useEffect, useMemo } from 'react';
import { IconX } from './GlyphIcons.jsx';
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

// Chat strings live HERE (not the site i18n table) so the assistant can pick its
// OWN language from the visitor's country — a Turkish visitor gets Turkish even
// with an English browser — and so German is always covered (the shared STRINGS
// table has no `ai.*` German entries).
const CHAT_STRINGS = {
  en: {
    subtitle: 'AI advisor',
    greeting: "Hi! I'm Qor AI 👋 Phone, laptop, headphones or a subscription — ask away and let's find your best match.",
    placeholder: 'Ask something…',
    errReply: "I couldn't answer just now 😕 Mind trying again shortly?",
    s1: 'Best phone under {price}', s2: 'Laptop recommendation for gaming', s3: 'iPhone 15 or Samsung S24?',
    newChat: 'New chat', history: 'Chat history', historyEmpty: 'No past chats yet.',
    signIn: 'Sign in', signInText: 'Sign in to chat with Qor AI and get personalized answers.',
    now: 'just now', minute: 'm', hour: 'h', day: 'd',
  },
  tr: {
    subtitle: 'Yapay zekâ danışman',
    greeting: 'Merhaba! Ben Qor AI 👋 Telefon, laptop, kulaklık ya da abonelik — ne arıyorsan sor, sana en uygununu bulalım.',
    placeholder: 'Bir şey sor…',
    errReply: 'Şu an yanıt veremedim 😕 Birazdan tekrar dener misin?',
    s1: '{price} altı en iyi telefon', s2: 'Oyun için laptop önerisi', s3: 'iPhone 15 mi Samsung S24 mü?',
    newChat: 'Yeni sohbet', history: 'Geçmiş sohbetler', historyEmpty: 'Henüz geçmiş sohbet yok.',
    signIn: 'Giriş yap', signInText: 'Qor AI ile sohbet etmek ve sana özel yanıtlar almak için giriş yap.',
    now: 'az önce', minute: 'dk', hour: 'sa', day: 'g',
  },
  de: {
    subtitle: 'KI-Berater',
    greeting: 'Hallo! Ich bin Qor AI 👋 Handy, Laptop, Kopfhörer oder ein Abo — frag einfach, ich finde das Beste für dich.',
    placeholder: 'Frag etwas…',
    errReply: 'Ich konnte gerade nicht antworten 😕 Versuchst du es gleich noch einmal?',
    s1: 'Bestes Handy unter {price}', s2: 'Laptop-Empfehlung fürs Gaming', s3: 'iPhone 15 oder Samsung S24?',
    newChat: 'Neuer Chat', history: 'Chatverlauf', historyEmpty: 'Noch keine früheren Chats.',
    signIn: 'Anmelden', signInText: 'Melde dich an, um mit Qor AI zu chatten und persönliche Antworten zu erhalten.',
    now: 'gerade eben', minute: 'Min', hour: 'Std', day: 'T',
  },
};

// Chat language = the visitor's OWN language: their explicit Settings choice wins,
// then their country (TR→Turkish, DACH→German, anywhere else→English), then the
// browser-detected site language. This is why a US visitor never sees a Turkish
// "under ₺30.000" prompt and a Turkey visitor is answered in Turkish.
function resolveChatLang(country, siteLang) {
  // Sohbet dili SİTE diline (artık tarayıcıya göre) uyar. Eski `qor.lang`
  // localStorage override'ı KALDIRILDI — aksi halde tarayıcı İngilizce olsa
  // bile eski 'tr' takılıp chat Türkçe cevaplıyordu (bkz. i18n/index.jsx).
  if (['tr', 'en', 'de'].includes(siteLang)) return siteLang;
  const cc = String(country || '').toUpperCase();
  if (cc === 'TR') return 'tr';
  if (['DE', 'AT', 'CH', 'LI'].includes(cc)) return 'de';
  return 'en';
}

// ── Persisted chat threads (per signed-in user) ─────────────────────
// The conversation survives page navigation AND reload, and the user keeps a
// history of past chats. Stored in localStorage keyed by user id so it never
// leaks between accounts on a shared browser.
const CHATS_KEY = 'qor.aiChats';
const uid = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function loadChats(userId) {
  if (!userId) return null;
  try {
    const all = JSON.parse(localStorage.getItem(CHATS_KEY) || '{}');
    const bucket = all && all[userId];
    if (bucket && Array.isArray(bucket.threads)) return bucket;
  } catch { /* ignore */ }
  return null;
}
function saveChats(userId, bucket) {
  if (!userId) return;
  try {
    const all = JSON.parse(localStorage.getItem(CHATS_KEY) || '{}');
    all[userId] = bucket;
    localStorage.setItem(CHATS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}
function newThread(greeting) {
  return { id: uid(), title: '', greeting: greeting || '', msgs: [], createdAt: Date.now(), updatedAt: Date.now() };
}

// Compact "2dk / 3sa / 1g" relative time for the history list.
function relativeTime(ts, S) {
  const s = Math.max(0, Math.floor((Date.now() - Number(ts || 0)) / 1000));
  if (s < 60) return S.now;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}${S.minute}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}${S.hour}`;
  return `${Math.floor(h / 24)}${S.day}`;
}

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

// "Which is best / recommend me one" intent — these want SPECIFIC current models,
// so they trigger a live web search even without a brand named (e.g. "best gaming
// laptop under 30k", "hangi telefonu almalıyım", "bana bir öneri ver").
const RECO_RE = /\b(best|top|recommend|recommendation|suggest|which|worth|budget|cheap|value|gaming|öner|oner|tavsiye|hangi|en iyi|en uygun|almalı|almali|alınır|alinir|bütçe|butce|uygun fiyat|kaç para|kac para|ne alsam)\b/i;
const CATEGORY_RE = /\b(phone|telefon|laptop|notebook|dizüstü|dizustu|tablet|tv|televizyon|monitor|monitör|headphone|kulaklık|kulaklik|earbud|watch|saat|akıllı saat|akilli saat|camera|kamera|console|konsol|gpu|ekran kartı|ekran karti|işlemci|islemci|cpu|ssd|klavye|keyboard|mouse|fare|hoparlör|speaker|robot süpürge|supurge|drone|printer|yazıcı|yazici)\b/i;

// Subscription services + generic subscription words — these need CURRENT plan
// tiers and prices, which the model's stale memory always gets wrong.
const SUB_RE = /\b(netflix|spotify|disney\+?|disney plus|hbo|max\b|hbo max|youtube premium|youtube music|prime video|amazon prime|apple tv|apple music|apple one|icloud|chatgpt|openai plus|gpt plus|claude pro|gemini advanced|midjourney|xbox game pass|game pass|playstation plus|ps plus|ea play|adobe|creative cloud|photoshop|microsoft 365|office 365|onedrive|google one|notion|dropbox|canva|exxen|blutv|gain|tabii|mubi|deezer|tidal|duolingo|abonelik|abone|üyelik|uyelik|subscription|premium plan|plan[ıi]|planlar)\b/i;

function looksLikeProduct(q) {
  return BRAND_RE.test(q) || MODEL_RE.test(q);
}
function looksLikeRecommendation(q) {
  return RECO_RE.test(q) && CATEGORY_RE.test(q);
}
function looksLikeSubscription(q) {
  return SUB_RE.test(q);
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// A catalog hit "strongly" answers the query only when the query's identifying
// tokens really appear in the product name/brand — so a typo-tolerant search
// returning a loosely-related product for "Galaxy S99 Ultra" is NOT treated as an
// on-site match (that message goes to web research instead).
//
// Crucially, we score on IDENTITY tokens (brand/model), not on the whole message:
// a natural-language query like "iphone 17 pro 512 gb almaya değer mi fiyatı ne"
// has the product's identity fully present (iphone/17/pro/512) but also carries
// conversational filler (almaya/değer/fiyatı). Dividing hits by ALL tokens used to
// push such queries below threshold, so on-site products silently missed their Qor
// price/specs grounding and fell through to web research. We now accept a match
// when every model-number token is present AND at least one brand/name word also
// matches — filler words no longer dilute the score.
function strongMatch(q, p) {
  const hay = norm(`${p?.name || ''} ${p?.brand || ''}`);
  if (!hay) return false;
  // Digit-bearing model tokens can be 2 chars ("15", "s24"); plain words need 3.
  const toks = norm(q).split(' ').filter((w) => (/\d/.test(w) ? w.length >= 2 : w.length >= 3) && !STOP.has(w));
  if (!toks.length) return false;
  const idToks = toks.filter((w) => /\d/.test(w));
  const wordToks = toks.filter((w) => !/\d/.test(w));
  // Model-number tokens ARE the product's identity — every one must appear, so a
  // non-existent "Galaxy S99 Ultra" never matches an on-site "Galaxy Watch Ultra".
  if (idToks.length && !idToks.every((w) => hay.includes(w))) return false;
  const wordHits = wordToks.filter((w) => hay.includes(w)).length;
  if (idToks.length) {
    // Identity numbers all matched — require at least one name/brand word too, so a
    // bare spec number ("en iyi 512 gb telefon") can't hijack an unrelated product.
    return wordHits >= 1;
  }
  // No model number in the query — need a solid name overlap to be confident.
  return wordHits >= Math.max(2, Math.ceil(wordToks.length * 0.6));
}

function productUrl(product) {
  try {
    return new URL(productPath(product), window.location.origin).toString();
  } catch {
    return productPath(product);
  }
}

// keySpecs come in alphabetical order, so a naive "first 8" leads with low-signal
// fields (5G, SAR, Body Ratio) and drops the ones people actually care about (RAM,
// storage, camera, which sort late). Rank each spec: the meaningful ones first,
// junk last, so the digest reads like a spec sheet a human would write.
const SPEC_PROMOTE = /display|screen|ekran|resolution|çözünürlük|cozunurluk|refresh|yenileme|panel|amoled|oled|chipset|processor|işlemci|islemci|\bcpu\b|\bgpu\b|\bram\b|memory|bellek|storage|depolama|camera|kamera|battery|batarya|pil|charg|şarj|sarj|weight|ağırlık|agirlik|\bsize\b|boyut/i;
const SPEC_DEMOTE = /\b5g\b|\b4g\b|4\.5g|3g\b|\bsar\b|sim count|sim say|body ratio|body oran|gövde|govde|water|su geçir|su gecir|dust|toz|bluetooth|\bnfc\b|\bgps\b|radio|fm |warranty|garanti/i;

function specRank(key) {
  // Demote wins ties: "Display / Body Ratio" mentions "display" but is low-signal.
  if (SPEC_DEMOTE.test(key)) return 2;
  if (SPEC_PROMOTE.test(key)) return 0;
  return 1;
}

// Up to ~8 clean "Label: value" spec lines from the product's Qor data, in the
// UI language (source Turkish when the visitor + product are both Turkish),
// meaningful specs first.
function specDigest(product, lang) {
  const specLang = String(lang || 'en').slice(0, 2).toLowerCase();
  const trSrc = String(product?.sourceLang || '').toLowerCase() === 'tr' && specLang === 'tr';
  const src = (trSrc && product?.sourceKeySpecs && Object.keys(product.sourceKeySpecs).length)
    ? product.sourceKeySpecs
    : (product?.keySpecs && Object.keys(product.keySpecs).length ? product.keySpecs : null);
  const rows = [];
  if (src) {
    const entries = Object.entries(src)
      .map(([k, v], i) => ({ k, v, i, rank: specRank(k) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i);
    for (const { k, v } of entries) {
      const val = localizedSpecValue(String(v ?? ''), lang).split('\n')[0].trim();
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

// Country/currency-aware research prompt. Forces the grounded search to return
// SPECIFIC, currently-available named products (or subscription plans) with real
// current prices in the visitor's market — so the chat answers with concrete
// picks, not generic "look for an i7" advice, and never guesses launch status.
function webResearchPrompt(q, lang, country, currency, wantsSub) {
  const market = country ? `the ${country} market` : "the visitor's local market";
  const money = currency ? ` in ${currency}` : ' in the local currency';
  if (wantsSub) {
    return `The user asked: "${q}". Using web search, report the CURRENT subscription plans for any service named or implied: the actual plan/tier names, what each includes, and each plan's current price${money} for ${market} (${new Date().getFullYear()}). If the question compares services or asks which to pick, say which is best value for the stated need. Be concise and factual — no invented prices. Reply in ${lang}.`;
  }
  return `The user asked: "${q}". Using web search, answer with CURRENT reality for ${market} as of ${new Date().toISOString().slice(0, 10)}:\n`
    + `- If a SPECIFIC product is named: confirm whether it has actually launched (give the launch date; if only rumored/unreleased say so and the expected timeframe), its official key specs, its typical current price${money}, and the general review/community sentiment.\n`
    + `- If it's a recommendation ("best/which X for a budget"): name 2-4 SPECIFIC, currently-available models by exact name that fit, each with a one-line why, key specs and an approximate current price${money}. Prefer current-generation models actually sold in ${market}.\n`
    + `Be concise and factual. Never invent an exact price or claim a product is unreleased when it is on sale. Reply in ${lang}.`;
}

// Page-aware opening line: reads the current route + page metadata so the chat
// greets the visitor with what they're actually looking at and what to ask.
function pageGreeting(lang, pathname, meta, defaultGreeting) {
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const bare = String(pathname || '').replace(/^\/(en|de|tr)(?=\/|$)/, '') || '/';
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
        : defaultGreeting;
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
        : defaultGreeting;
    case 'subscriptions':
      return L("You're on Subscriptions. Ask me to compare plans (Netflix, Spotify, ChatGPT…) for what you need.",
        'Abonelikler sayfasındasın. İhtiyacına göre planları (Netflix, Spotify, ChatGPT…) karşılaştırmamı isteyebilirsin.',
        'Du bist bei Abos. Lass mich Pläne (Netflix, Spotify, ChatGPT…) für dich vergleichen.');
    case 'link':
      return L('You can paste any product link above for a full analysis — or just ask me anything here.',
        'Yukarıya herhangi bir ürün linki yapıştırıp tam analiz alabilirsin — ya da buradan bana sorabilirsin.',
        'Füge oben einen Produktlink für eine Analyse ein — oder frag mich einfach hier.');
    default:
      return defaultGreeting;
  }
}

export default function AiBubble() {
  const { lang } = useI18n();
  const { user, openAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const geoCountry = useGeoCountry();
  const currency = CURRENCY_BY_COUNTRY[String(geoCountry || '').toUpperCase()] || 'USD';
  // The chat speaks the VISITOR's language (country-first), independent of the
  // browser-driven site UI language — see resolveChatLang.
  const chatLang = useMemo(() => resolveChatLang(geoCountry, lang), [geoCountry, lang]);
  const S = CHAT_STRINGS[chatLang] || CHAT_STRINGS.en;
  const requireAiAccess = useAiAccess(chatLang);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ctxVer, setCtxVer] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  // Persisted conversation threads (per signed-in user). Survives navigation AND
  // reload; the active thread never changes just because the page changed.
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState('');

  const scrollRef = useRef(null);
  const sendRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const activeThread = threads.find((tr) => tr.id === activeId) || null;
  const msgs = activeThread ? activeThread.msgs : [];
  const historyThreads = threads.filter((tr) => tr.msgs.length > 0).sort((a, b) => b.updatedAt - a.updatedAt);

  // Load / reset the user's saved chats when the signed-in user changes.
  useEffect(() => {
    if (!user) { setThreads([]); setActiveId(''); return; }
    const bucket = loadChats(user.id);
    if (bucket && bucket.threads.length) {
      setThreads(bucket.threads);
      const valid = bucket.activeId && bucket.threads.some((tr) => tr.id === bucket.activeId);
      setActiveId(valid ? bucket.activeId : bucket.threads[bucket.threads.length - 1].id);
    } else {
      setThreads([]); setActiveId('');
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && threads.length) saveChats(user.id, { threads, activeId });
  }, [threads, activeId, user]);

  // Re-render the greeting when a page publishes new context (a product page
  // finishes loading its data after we've already mounted).
  useEffect(() => subscribePageContext(() => setCtxVer((v) => v + 1)), []);

  // Live page-aware opener — shown only while the active thread is empty; once the
  // conversation starts, the thread keeps its own frozen greeting.
  const liveGreeting = useMemo(
    () => pageGreeting(chatLang, location.pathname, getPageMeta(), S.greeting),
    [chatLang, location.pathname, ctxVer, S.greeting],
  );
  const greeting = (activeThread && msgs.length > 0 && activeThread.greeting) ? activeThread.greeting : liveGreeting;

  // Quick prompts follow the CHAT language (templates) and the visitor's COUNTRY
  // for the price figure — so a US visitor never sees a Turkish-Lira budget.
  const budget = PHONE_BUDGET_BY_CURRENCY[currency] || PHONE_BUDGET_BY_CURRENCY.USD;
  const suggestions = [
    S.s1.replace('{price}', formatPriceAmount(budget, currency, chatLang)),
    S.s2,
    S.s3,
  ];

  function goQuiz() {
    const next = `${location.pathname}${location.search}${location.hash}`;
    setOpen(false);
    navigate(`/quiz?required=1&next=${encodeURIComponent(next)}`);
  }

  // Start a fresh chat that comments on the CURRENT page. The previous chat is
  // kept in history untouched. If the active chat is already empty, we just point
  // its greeting at the current page instead of piling up empty threads.
  function newChat() {
    setShowHistory(false);
    const g = pageGreeting(chatLang, location.pathname, getPageMeta(), S.greeting);
    const active = threadsRef.current.find((tr) => tr.id === activeIdRef.current);
    if (active && active.msgs.length === 0) {
      setThreads((prev) => prev.map((tr) => (tr.id === active.id
        ? { ...tr, greeting: g, createdAt: Date.now(), updatedAt: Date.now() } : tr)));
      return;
    }
    const th = newThread(g);
    setThreads((prev) => [...prev.filter((tr) => tr.msgs.length > 0), th]);
    setActiveId(th.id);
  }

  function openThread(id) {
    setActiveId(id);
    setShowHistory(false);
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy, open, greeting, showHistory, activeId]);

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

  // Decide the grounding for a message. SITE-FIRST: an on-site Qor product (its
  // specs + market price) is the source of truth when the catalog confidently
  // matches. Otherwise INTERNET: a live web search returns current, specific
  // products/plans and prices — for named products, "which is best" questions,
  // and subscriptions — so answers are concrete and never guess launch status.
  // Catalog options are attached to the research so the model can link Qor pages.
  async function buildGrounding(q) {
    const meta = getPageMeta();
    const pageKind = meta?.kind || '';
    const onPageIds = Array.isArray(meta?.productIds) ? meta.productIds.slice(0, 3) : [];
    let results = [];
    try { results = await searchProducts(q, 6); } catch { results = []; }
    const strongIds = results.filter((p) => strongMatch(q, p)).map((p) => p.id);
    const ids = [...new Set([...strongIds, ...onPageIds])].slice(0, 3);
    if (ids.length) {
      const full = (await Promise.all(ids.map((id) => getProduct(id).catch(() => null)))).filter(Boolean);
      if (full.length) return pbGrounding(full, geoCountry, chatLang);
    }
    // No confident on-site product → go to the internet for current facts when the
    // message is about a product, a recommendation, or a subscription (or we're on
    // the subscriptions page, where every question is about current plan pricing).
    const wantsSub = looksLikeSubscription(q) || pageKind === 'subscriptions';
    const wantsResearch = looksLikeProduct(q) || looksLikeRecommendation(q) || wantsSub;
    if (wantsResearch) {
      try {
        const research = await askQorAiGrounded(
          webResearchPrompt(q, chatLang, geoCountry, currency, wantsSub),
          { language: chatLang, timeoutMs: 22000, maxOutputTokens: 1400 },
        );
        if (research && research.trim()) {
          const catalog = buildCatalogContext(results, chatLang);
          const onSite = results.some((p) => p?.id && p?.name)
            ? `\n\nON-SITE QOR OPTIONS (recommend and link these when they fit the answer):\n${catalog}`
            : '';
          return `LIVE WEB RESEARCH — current facts for "${q}" (trust this over older memory for launch status, specs and price):\n${research.trim()}${onSite}`;
        }
      } catch { /* grounded search unavailable — fall through to catalog options */ }
    }
    return buildCatalogContext(results, chatLang);
  }

  async function send(text) {
    if (!userRef.current) { openAuth(); return; }
    if (!hasCompletedQuiz(userRef.current)) { goQuiz(); return; }
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    setShowHistory(false);

    // Resolve — or lazily create — the active thread, then append the user turn.
    let tid = activeIdRef.current;
    let thread = threadsRef.current.find((tr) => tr.id === tid);
    if (!thread) {
      thread = newThread(pageGreeting(chatLang, location.pathname, getPageMeta(), S.greeting));
      tid = thread.id;
    }
    const priorMsgs = thread.msgs || [];
    const next = [...priorMsgs, { role: 'user', text: q }];
    // Freeze the greeting to THIS page on the first turn so later navigation can't
    // rewrite an ongoing conversation's opener.
    const frozenGreeting = priorMsgs.length === 0
      ? pageGreeting(chatLang, location.pathname, getPageMeta(), S.greeting)
      : thread.greeting;

    setThreads((prev) => {
      const base = prev.some((tr) => tr.id === tid) ? prev : [...prev, thread];
      return base.map((tr) => (tr.id === tid ? {
        ...tr,
        title: tr.title || q.slice(0, 48),
        greeting: frozenGreeting,
        msgs: next,
        updatedAt: Date.now(),
      } : tr));
    });
    setActiveId(tid);
    setBusy(true);
    trackEvent('ai_chat_message');

    const append = (msg) => setThreads((prev) => prev.map((tr) => (tr.id === tid
      ? { ...tr, msgs: [...tr.msgs, msg], updatedAt: Date.now() } : tr)));

    try {
      const access = await requireAiAccess('ai_chat', {
        onMessage: (message) => append({ role: 'model', text: message }),
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
      ], { language: chatLang, context: grounding, country: geoCountry, currency });
      append({ role: 'model', text: reply });
    } catch {
      append({ role: 'model', text: S.errReply });
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
                <span>{S.subtitle}</span>
              </div>
            </div>
            <div className="aib-head-actions">
              {user && (
                <button className="aib-head-btn" onClick={newChat} title={S.newChat} aria-label={S.newChat}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
              {user && historyThreads.length > 0 && (
                <button
                  className={'aib-head-btn' + (showHistory ? ' active' : '')}
                  onClick={() => setShowHistory((v) => !v)}
                  title={S.history}
                  aria-label={S.history}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" />
                  </svg>
                </button>
              )}
              <button className="aib-head-x" onClick={() => setOpen(false)} aria-label="✕"><IconX size={14} width={2.4} /></button>
            </div>
          </div>

          {user && showHistory && (
            <div className="aib-history">
              {historyThreads.length === 0 ? (
                <p className="aib-history-empty">{S.historyEmpty}</p>
              ) : historyThreads.map((th) => (
                <button
                  key={th.id}
                  className={'aib-history-item' + (th.id === activeId ? ' active' : '')}
                  onClick={() => openThread(th.id)}
                >
                  <span className="aib-history-title">{th.title || S.newChat}</span>
                  <span className="aib-history-time">{relativeTime(th.updatedAt, S)}</span>
                </button>
              ))}
            </div>
          )}

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
                <p>{S.signInText}</p>
                <button className="aib-login-btn" onClick={() => { setOpen(false); openAuth(); }}>
                  {S.signIn}
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
                placeholder={S.placeholder}
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
