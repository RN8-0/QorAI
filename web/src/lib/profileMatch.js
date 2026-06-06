import { hasCompletedQuiz } from './qorCoins';
import { getRecentProducts } from './recentViewed';

const ANDROID = new Set(['android', 'samsung', 'google', 'xiaomi', 'huawei']);
const APPLE_BRANDS = new Set(['apple', 'beats']);
const WINDOWS_BRANDS = new Set(['microsoft', 'dell', 'hp', 'lenovo', 'asus', 'acer', 'msi', 'razer', 'surface', 'framework']);
const ANDROID_BRANDS = new Set(['samsung', 'xiaomi', 'oppo', 'vivo', 'realme', 'oneplus', 'motorola', 'huawei', 'honor', 'poco', 'nothing', 'google', 'tecno', 'infinix', 'zte']);
const GAMING_CATS = new Set(['gpus', 'graphics_cards', 'monitors', 'keyboards', 'mice', 'headphones', 'consoles', 'gaming_consoles', 'gamepads', 'vr_headsets', 'desktops', 'laptops', 'cpus', 'ram', 'ssd', 'ssds', 'cpu_coolers', 'pc_cases']);
const CREATOR_CATS = new Set(['cameras', 'camera_lenses', 'gimbals', 'drones', 'monitors', 'laptops', 'microphones', 'headphones', 'tablets']);
const PRODUCTIVITY_CATS = new Set(['laptops', 'monitors', 'tablets', 'smartphones', 'keyboards', 'mice', 'webcams', 'routers', 'printers']);

const PROFESSION_CATS = {
  student: ['laptops', 'tablets', 'headphones', 'smartphones', 'e_readers'],
  engineer: ['laptops', 'monitors', 'cpus', 'gpus', 'graphics_cards', 'keyboards', 'mice'],
  designer: ['monitors', 'tablets', 'laptops', 'cameras', 'smartphones'],
  developer: ['laptops', 'monitors', 'keyboards', 'mice', 'desktops', 'routers'],
  gamer: [...GAMING_CATS],
  manager: ['smartphones', 'laptops', 'smartwatches', 'tablets', 'headphones'],
  healthcare: ['tablets', 'smartwatches', 'smartphones', 'laptops'],
  teacher: ['laptops', 'tablets', 'projectors', 'webcams', 'headphones'],
  finance: ['laptops', 'monitors', 'smartphones', 'tablets'],
  creator: [...CREATOR_CATS],
  other: ['smartphones', 'laptops', 'headphones'],
};

const USAGE_CATS = {
  gaming: [...GAMING_CATS],
  gaming_setup: [...GAMING_CATS],
  content: [...CREATOR_CATS],
  creator_setup: [...CREATOR_CATS],
  work: [...PRODUCTIVITY_CATS],
  productivity_setup: [...PRODUCTIVITY_CATS],
  study: ['laptops', 'tablets', 'headphones', 'e_readers'],
  travel: ['smartphones', 'tablets', 'headphones', 'smartwatches', 'cameras'],
  family: ['tvs', 'tablets', 'smartphones', 'robot_vacuums', 'speakers'],
  all: [],
};

const BUDGET_SCORE = {
  budget: 0.25,
  low: 0.25,
  mid: 0.55,
  high: 0.78,
  premium: 0.9,
  luxury: 1,
  any: 0.75,
};

function arr(value) {
  return Array.isArray(value) ? value.filter(Boolean).map((x) => String(x).toLowerCase()) : [];
}

function norm(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
}

function categoryKey(product) {
  return String(product?.category || '').toLowerCase().replace(/-/g, '_');
}

function productBlob(product) {
  return [
    product?.name,
    product?.brand,
    product?.category,
    product?.subcategory,
    product?.keySpecsText,
    product?.filterTokens?.join(' '),
    JSON.stringify(product?.keySpecs || {}),
    JSON.stringify(product?.specs || {}),
    JSON.stringify(product?.specSections || {}),
    JSON.stringify(product?.sourceSpecs || {}),
    JSON.stringify(product?.sourceSpecSections || {}),
  ].filter(Boolean).join(' ').toLowerCase();
}

function inferEcosystem(product) {
  const brand = norm(product?.brand);
  const specs = productBlob(product);
  if (APPLE_BRANDS.has(brand) || /\bios\b|macos|iphone|ipad|macbook/.test(specs)) return 'apple';
  if (brand === 'samsung') return 'samsung';
  if (brand === 'google') return 'google';
  if (brand === 'xiaomi' || brand === 'poco') return 'xiaomi';
  if (brand === 'huawei' || brand === 'honor') return 'huawei';
  if (WINDOWS_BRANDS.has(brand) || /windows/.test(specs)) return 'windows';
  if (ANDROID_BRANDS.has(brand) || /android/.test(specs)) return 'android';
  return 'neutral';
}

function rankedMatch(category, list = []) {
  const normalized = list.map((x) => String(x).toLowerCase().replace(/-/g, '_'));
  const index = normalized.indexOf(category);
  if (index < 0) return 0;
  return Math.max(0.35, Math.min(1, 1 - index * 0.08));
}

function neutralEcosystemBaseline(user, product) {
  const cat = categoryKey(product);
  const priorities = arr(user?.priorities);
  const usage = norm(user?.usageIntent);
  const profession = norm(user?.profession);
  const gaming = usage.includes('gaming') || profession === 'gamer' || priorities.includes('gaming');
  const creator = usage.includes('content') || usage.includes('creator') || profession === 'creator' || priorities.includes('creator');
  const productivity = usage.includes('work') || usage.includes('productivity') || priorities.includes('productivity');
  if (GAMING_CATS.has(cat) && gaming) return 0.9;
  if (CREATOR_CATS.has(cat) && creator) return 0.86;
  if (PRODUCTIVITY_CATS.has(cat) && productivity) return 0.84;
  if (GAMING_CATS.has(cat) || CREATOR_CATS.has(cat) || PRODUCTIVITY_CATS.has(cat)) return 0.8;
  return 0.68;
}

function ecosystemScore(user, product) {
  const userEco = norm(user?.ecosystem || 'mixed');
  const productEco = inferEcosystem(product);
  if (productEco === 'neutral') return neutralEcosystemBaseline(user, product);
  if (userEco === 'mixed') return 0.72;
  if (userEco === productEco) return 1;
  if (ANDROID.has(userEco) && ANDROID.has(productEco)) return 0.9;
  if (userEco === 'windows' && productEco === 'windows') return 0.96;
  if (userEco === 'apple' && productEco === 'windows') return 0.58;
  if (userEco === 'windows' && productEco === 'apple') return 0.52;
  if (userEco === 'apple' && ANDROID.has(productEco)) return 0.18;
  if (ANDROID.has(userEco) && productEco === 'apple') return 0.18;
  return 0.5;
}

function priceForUser(user, product) {
  const country = String(user?.country || '').toUpperCase();
  const prices = product?.prices && typeof product.prices === 'object' ? product.prices : {};
  return Number(prices[country] || prices[country.toLowerCase()] || prices.US || product?.lowestPriceUSD || product?.lowestPrice || 0);
}

function budgetScore(user, product) {
  const budget = norm(user?.budgetRange || 'mid');
  const base = BUDGET_SCORE[budget] ?? 0.55;
  const price = priceForUser(user, product);
  if (!price || budget === 'any') return base;
  if (budget === 'budget' || budget === 'low') return price <= 350 ? 1 : price <= 900 ? 0.72 : 0.38;
  if (budget === 'mid') return price <= 1100 ? 0.95 : price <= 1700 ? 0.72 : 0.48;
  if (budget === 'premium') return price >= 450 ? 0.9 : 0.78;
  if (budget === 'luxury' || budget === 'high') return 0.92;
  return base;
}

function priorityScore(user, product) {
  const priorities = arr(user?.priorities);
  const tech = Math.max(0, Math.min(100, Number(product?.techScore) || 0)) / 100;
  if (!priorities.length) return Math.max(0.3, Math.min(0.9, tech || 0.5));
  const blob = productBlob(product);
  const cat = categoryKey(product);
  let match = 0;
  const has = (...terms) => terms.some((term) => blob.includes(term));
  for (const p of priorities) {
    if (p === 'performance' && (tech >= 0.85 || has('performance', 'hızlı', 'fast', 'powerful', 'güçlü', 'cpu', 'gpu'))) match += 1;
    else if (p === 'battery' && has('battery', 'pil', 'mah', 'long lasting', 'uzun')) match += 1;
    else if (p === 'camera' && has('camera', 'kamera', 'mp', 'optical zoom', 'ois')) match += 1;
    else if (p === 'display' && has('display', 'screen', 'ekran', 'oled', 'amoled', 'hz', 'nits')) match += 1;
    else if ((p === 'value' || p === 'price') && budgetScore(user, product) >= 0.75) match += 1;
    else if (p === 'portability' && has('portable', 'hafif', 'lightweight', 'weight', 'thin')) match += 1;
    else if (p === 'gaming' && (GAMING_CATS.has(cat) || has('gaming', 'oyun', 'rtx', 'fps', '144hz', '165hz', '240hz'))) match += 1;
    else if (p === 'creator' && (CREATOR_CATS.has(cat) || has('creator', 'editing', 'render', '4k', 'video', 'photo'))) match += 1;
    else if (p === 'productivity' && (PRODUCTIVITY_CATS.has(cat) || has('office', 'multitask', 'keyboard', 'battery'))) match += 1;
    else if (p === 'ecosystem') match += ecosystemScore(user, product);
    else if (p === 'durability' && has('durable', 'dayanıklı', 'sağlam', 'ip68', 'water resistance')) match += 1;
    else if (p === 'quality' && (tech >= 0.8 || has('premium', 'quality', 'kalite'))) match += 1;
  }
  const keyword = match / priorities.length;
  return keyword < 0.3 ? Math.max(0, Math.min(1, keyword * 0.6 + tech * 0.4)) : Math.max(0, Math.min(1, keyword));
}

function deviceScore(user, product) {
  const devices = new Set(arr(user?.currentDevices));
  const cat = categoryKey(product);
  const brand = norm(product?.brand);
  if (!devices.size) {
    const interests = arr(user?.interestCategories);
    return interests.includes(cat) ? 0.75 : 0.55;
  }
  if (devices.has(cat)) return 0.96;
  const eco = norm(user?.ecosystem);
  const hasPhone = devices.has('smartphones');
  const hasLaptop = devices.has('laptops') || devices.has('desktops');
  if (cat === 'smartphones') {
    if (brand === 'apple') return eco === 'apple' ? 0.95 : 0.4;
    if (ANDROID.has(eco) || hasPhone) return 0.86;
    return 0.55;
  }
  if (cat === 'laptops' || cat === 'desktops') {
    if (brand === 'apple') return eco === 'apple' ? 0.95 : 0.45;
    if (eco === 'windows' || hasLaptop) return 0.88;
    return 0.6;
  }
  if (cat === 'tablets') return devices.has('tablets') || eco === 'apple' || ANDROID.has(eco) ? 0.85 : 0.55;
  if (cat === 'smartwatches') return hasPhone ? 0.86 : 0.55;
  if (['headphones', 'speakers', 'earbuds', 'earphones'].includes(cat)) return brand === 'apple' && eco === 'apple' ? 0.9 : 0.78;
  if (GAMING_CATS.has(cat)) return eco === 'windows' || hasLaptop ? 0.84 : 0.58;
  return 0.65;
}

function historyBoost(product) {
  let items = [];
  try { items = getRecentProducts(); } catch { items = []; }
  if (!items.length) return 0;
  const cat = categoryKey(product);
  const id = String(product?.id || '');
  let boost = 0;
  const categoryHits = items.filter((p) => categoryKey(p) === cat).length;
  if (categoryHits) boost += Math.min(3, categoryHits * 0.45);
  const directIndex = items.findIndex((p) => String(p.id) === id);
  if (directIndex >= 0) boost += Math.max(0.5, 2.5 - directIndex * 0.15);
  return Math.min(6, boost);
}

function releaseYear(product) {
  const blobs = [
    product?.releaseYear,
    product?.year,
    product?.releaseDate,
    product?.keySpecs?.['Release Year'],
    product?.keySpecs?.['Piyasaya Çıkış Yılı'],
    product?.keySpecs?.['Piyasaya Çıkış Tarihi'],
    product?.specs?.['Release Year'],
    product?.specs?.['Release Date'],
    product?.specs?.['year'],
    product?.specs?.['Yıl'],
    product?.specs?.['Piyasaya Çıkış Tarihi'],
    JSON.stringify(product?.specSections || {}),
  ];
  for (const item of blobs) {
    const match = String(item || '').match(/\b(20\d{2})\b/);
    const year = match ? Number(match[1]) : 0;
    if (year >= 2001 && year <= new Date().getFullYear() + 1) return year;
  }
  return null;
}

function userIntentBoost(user, product) {
  const cat = categoryKey(product);
  const priorities = arr(user?.priorities);
  let boost = 0;
  boost += rankedMatch(cat, USAGE_CATS[norm(user?.usageIntent)] || []) * 8;
  boost += rankedMatch(cat, PROFESSION_CATS[norm(user?.profession)] || []) * 6;
  if (priorities.includes('gaming')) boost += rankedMatch(cat, [...GAMING_CATS]) * 5;
  if (priorities.includes('creator')) boost += rankedMatch(cat, [...CREATOR_CATS]) * 4;
  if (priorities.includes('productivity')) boost += rankedMatch(cat, [...PRODUCTIVITY_CATS]) * 4;
  return Math.max(0, Math.min(14, boost));
}

export function hasProfileMatch(user) {
  return hasCompletedQuiz(user);
}

export function calculateProfileMatchScore(user, product) {
  if (!hasProfileMatch(user) || !product) return 0;
  const personal =
    ecosystemScore(user, product) * 25
    + budgetScore(user, product) * 25
    + priorityScore(user, product) * 25
    + deviceScore(user, product) * 25;
  const tech = Math.max(0, Math.min(100, Number(product.techScore) || 0));
  const trendRaw = Number(product.trendScore) || 0;
  const ratingCommunity = Number(product.ratings?.community) || 0;
  const community = ratingCommunity > 0
    ? Math.min(100, ratingCommunity * 20)
    : (trendRaw > 0 ? Math.min(100, trendRaw <= 10 ? trendRaw * 10 : trendRaw) : tech * 0.72);
  const pricePerf = priceForUser(user, product) > 0
    ? (tech * 0.6 + Math.min(100, 100000 / (priceForUser(user, product) + 700)) * 0.4)
    : tech * 0.7;
  let total = personal * 0.55 + tech * 0.18 + community * 0.12 + pricePerf * 0.15;
  const year = releaseYear(product);
  if (year) {
    const diff = new Date().getFullYear() - year;
    if (diff <= 0) total += 8;
    else if (diff === 1) total += 4;
    else if (diff === 3) total -= 5;
    else if (diff === 4) total -= 10;
    else if (diff > 4) total -= 14;
  }
  const interests = arr(user?.interestCategories);
  const cat = categoryKey(product);
  if (interests.includes(cat)) total += 4;
  if (norm(user?.primaryCategory).replace(/-/g, '_') === cat) total += 3;
  total += userIntentBoost(user, product);
  total += historyBoost(product);
  return Math.max(10, Math.min(100, Math.round(10 + Math.max(0, Math.min(100, total)) * 0.9)));
}
