/**
 * Qor AI — İncehesap TR fiyat connector'ı (arama JSON + ürün sayfası microdata)
 *
 * İncehesap "Paylaştıkça Kazan" değerlendirmesinin (2026-07-04) çıktısı:
 *   - Site düz curl + Chrome UA'ya 200 döner (Epey'in aksine TLS duvarı yok,
 *     scraper-proxy GEREKMEZ; Node fetch yine de riskli → curl'e shell-out).
 *   - Arama: /ajax/search.php?q=<kw> temiz JSON verir:
 *       { u: [ { id, satis_durumu, sku, a (ad), u (slug), r (resim) } ] }
 *     Ürün sayfası URL şeması: /<slug>-fiyati-<id>/
 *   - Ürün sayfasında JSON-LD YOK ama schema.org MICRODATA tam:
 *       itemprop="price" content="24049.00"  + priceCurrency=TRY
 *       itemprop="availability" content="…/InStock|OutOfStock"
 *     (InStock/"Sepete Ekle" tutarlılığı canlı doğrulandı.)
 *   - Affiliate: "Paylaştıkça Kazan" linki yalnız onaylı publisher panelinde
 *     üretiliyor; format resmî sayfalarda/aramalarda görünmüyor. Bu yüzden
 *     fiyat ile atıf AYRIK: fiyat bu scrape'ten, link buildAffiliateUrl()
 *     üzerinden. INCEHESAP_PARAM + INCEHESAP_REF (migration/.env) dolunca
 *     linkler otomatik affiliate'e döner; boşken düz ürün linki yazılır.
 *
 * Koruma felsefesi newegg.js ile aynı:
 *   - SKIP_FRESH: taze incehesap satırı olan ürün ağa hiç çıkmadan atlanır.
 *   - Hakem: mevcut en ucuz offer (USD) yanlış eşleşmenin uçuk fiyat
 *     yayınlamasını [1/3.5, 3.5]× bandıyla keser.
 *   - Geçici arıza (bot duvarı / 5xx / timeout) THROW eder → runner mevcut
 *     satırlara dokunmaz. Kesin "burada yok" [] döner → bayat satır temizlenir.
 *
 * SIKI ÜLKE KURALI: İncehesap yalnız TR'ye satar → offer.country her zaman
 * 'TR'; başka pazara asla yazılmaz.
 *
 * Config (migration/.env):
 *   INCEHESAP_ENABLED=0        kapatma anahtarı (varsayılan açık)
 *   INCEHESAP_GAP_MS           istekler arası boşluk (varsayılan 3000)
 *   INCEHESAP_SKIP_FRESH_H     tazelik atlama eşiği saat (varsayılan 20)
 *   INCEHESAP_PARAM / INCEHESAP_REF  affiliate paramı (panelden öğrenilecek)
 */
'use strict';

const { execFile } = require('child_process');
const { req } = require('../../migration/pb');
const { toUsd } = require('../lib/offers');
const { searchQuery, titleMatches } = require('../lib/amazon_page');
const { buildAffiliateUrl } = require('../lib/affiliate');

const ENV = process.env;
const GAP_MS = Math.max(1200, Number(ENV.INCEHESAP_GAP_MS || 3000));
const SKIP_FRESH_MS = Math.max(1, Number(ENV.INCEHESAP_SKIP_FRESH_H || 20)) * 60 * 60 * 1000;
const EXPIRES_MS = 50 * 60 * 60 * 1000; // bir gece kaçarsa fiyat ertesi güne kadar görünür kalsın
const BASE = 'https://www.incehesap.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const esc = v => String(v || '').replace(/"/g, '\\"');

// Node fetch (undici) TLS parmak izinden duvara takılabilir; curl hem bu
// PC'de hem Hetzner'de var ve İncehesap'a 200 alıyor (canlı doğrulandı).
function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-sS', '--compressed', '--location', '--max-time', '30',
      '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: tr-TR,tr;q=0.9,en;q=0.7',
      '-w', '\n__HTTP_STATUS__:%{http_code}',
      url,
    ], { maxBuffer: 24 * 1024 * 1024, windowsHide: true }, (err, stdout = '') => {
      const m = String(stdout).match(/\n__HTTP_STATUS__:(\d{3})\s*$/);
      if (m) resolve({ status: Number(m[1]), text: String(stdout).slice(0, m.index) });
      else reject(err || new Error('curl: durum işareti yok'));
    });
  });
}

// Modül seviyesi tempo: tüm worker'lar tek kuyruğa girer, İncehesap'a
// GAP_MS'ten sık istek gitmez (runner concurrency'si yalnız PB yazımını paralel yapar).
let fetchChain = Promise.resolve();
let lastFetchAt = 0;
function politeFetch(url) {
  const run = async () => {
    const wait = lastFetchAt + GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait + Math.floor(Math.random() * 500)));
    lastFetchAt = Date.now();
    return curlGet(url);
  };
  const p = fetchChain.then(run, run);
  fetchChain = p.catch(() => {});
  return p;
}

// Üst üste geçici arıza koşu-seviyesi şalteri açar: duvarlı bir gece
// çekiçlemek yerine hızla düşer, mevcut satırlar yaşamaya devam eder.
const MAX_STRIKES = 5;
let strikes = 0;
let breakerAt = 0;
const BREAKER_COOLDOWN_MS = Math.max(5, Number(ENV.INCEHESAP_BREAKER_COOLDOWN_MIN || 30)) * 60 * 1000;

function bump(reasonMsg) {
  strikes++;
  if (strikes >= MAX_STRIKES && !breakerAt) {
    breakerAt = Date.now();
    console.log(`  ! incehesap: şalter açıldı (${reasonMsg})`);
  }
}

// Varyant belirteçleri: adayın taşıdığı ama ÜRÜN adında olmayan her kelime
// muhtemelen büyük kardeş model ("RTX 4060" sorgusuna ilk kart "4060 Ti"
// gelebilir). Ceza puanı en düşük + en kısa başlık kazanır; yine de tek
// aday yanlışsa fiyat hakemi son kapıda keser.
const VARIANT_WORDS = [
  'plus', 'pro', 'max', 'ultra', 'mini', 'lite', 'ti', 'super', 'xt',
  'wireless', 'kablosuz', 'lightspeed', 'bluetooth', 'superlight', 'fe', 'dual',
];

const normCode = s => String(s).replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** PB adındaki parantezli üretici part kodu ("(GV-N5090WF3OC-32G)") — en güçlü
 *  kimlik. Kapasite parantezleri ("(1 TB)") kod değildir, atlanır. */
function pbPartCode(name) {
  for (const m of String(name).matchAll(/\(([^()]{6,})\)/g)) {
    const c = m[1].trim();
    if (/[A-Za-z]/.test(c) && /\d/.test(c) && !/^\d+\s*(?:gb|tb)$/i.test(c)) return normCode(c);
  }
  return '';
}

// Aday başlığındaki part-kod-benzeri desenler ("TUF-RTX5090-32G-GAMING",
// "910-005568") — tireli, her parçası ≥2 alfanumerik.
const CAND_CODE_RE = /\b[A-Z0-9]{2,}(?:-[A-Z0-9]{2,})+\b/g;

function codesAgree(want, candCode) {
  const b = normCode(candCode);
  if (!want || !b) return false;
  if (want === b) return true;
  // Uzun kodlarda kuyruk farkı toleransı (32G vs 32GD); kısa kodda tam eşitlik şart.
  return (b.length >= 8 && want.includes(b)) || (want.length >= 8 && b.includes(want));
}

/** Arama JSON'ından en iyi aday: token eşleşmesi ŞART; part kodu uyuşan aday
 *  kesin kazanır, part kodu ÇELİŞEN aday elenir (Windforce OC ≠ Gaming OC
 *  vakası — ikisi de "…RTX 5090 … Gaming (Oyuncu) Ekran Kartı" başlığı taşıyıp
 *  token eşleşmesini geçiyordu); kodsuz adaylarda varyant cezası + kısa ad. */
function bestCandidate(items, productName, wantCode) {
  const nameFold = ` ${String(productName).toLowerCase()} `;
  const candidates = [];
  for (const it of items || []) {
    if (!it || !it.u || !it.id) continue;
    if (Number(it.satis_durumu) !== 1) continue; // satışta olmayan kart bayat fiyat taşır
    const title = String(it.a || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    // amazon_page.titleMatches: rakamlı model token'ları rakam-sınırlı arar,
    // TR kategori kelimeleri stopword'dür — "LG G3"→"G 3" faciası yaşanmaz.
    if (!titleMatches(productName, title)) continue;
    let codeHit = 0;
    if (wantCode) {
      // Tüm başlığın normalize'ında PB kodu geçiyorsa kesin aynı SKU.
      if (normCode(title).includes(wantCode)) codeHit = 1;
      else {
        // Aday kendi kodunu taşıyor ama bizimkiyle çelişiyorsa: farklı SKU — ele.
        const candCodes = title.toUpperCase().match(CAND_CODE_RE) || [];
        if (candCodes.length && !candCodes.some(c => codesAgree(wantCode, c))) continue;
      }
    }
    const t = ` ${title.toLowerCase()} `;
    const extra = VARIANT_WORDS.filter(w => t.includes(` ${w} `) && !nameFold.includes(` ${w} `)).length;
    candidates.push({ id: it.id, slug: String(it.u), title, extra, codeHit });
    if (candidates.length >= 10) break;
  }
  if (!candidates.length) return null;
  candidates.sort((x, y) => (y.codeHit - x.codeHit) || (x.extra - y.extra) || (x.title.length - y.title.length));
  return candidates[0];
}

/** İki attribute sırasını da tolere eden microdata okuyucu. */
function microdataAttr(html, prop) {
  const a = html.match(new RegExp(`itemprop="${prop}"[^>]*content="([^"]+)"`, 'i'));
  if (a) return a[1];
  const b = html.match(new RegExp(`content="([^"]+)"[^>]*itemprop="${prop}"`, 'i'));
  return b ? b[1] : '';
}

/** Ürün sayfası microdata'sından fiyat/para birimi/stok oku.
 *  Dönüş: {price, currency, inStock} | null (microdata hiç yok → şablon
 *  değişmiş olabilir, çağıran THROW eder ki tüm katalog fiyatsız kalmasın). */
function parseProductPage(html) {
  // Offer fiyatı ("24049.00"); yoksa AggregateOffer lowPrice ("24049").
  const rawPrice = microdataAttr(html, 'price') || microdataAttr(html, 'lowPrice');
  const currency = (microdataAttr(html, 'priceCurrency') || 'TRY').toUpperCase();
  const availability = microdataAttr(html, 'availability');
  if (!rawPrice && !availability) return null; // microdata tümüyle kayıp
  // "12.499,90" TR biçimi de "24049.00" makine biçimi de güvenle çözülsün.
  const price = Number(String(rawPrice).replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return {
    price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : 0,
    currency,
    inStock: /InStock|PreOrder/i.test(availability),
  };
}

// İncehesap araması uzun spec kuyruklarında 0 sonuç veriyor (canlı test
// 2026-07-04: "…RTX 5090 32GB GDDR7 Ekran Kartı"→0, "…RTX 5090"→2) — jsonld.js
// buildKeywordQuery'deki kuyruk kesme burada zorunlu. Eşleştirme yine TAM adla
// (titleMatches) yapılır; kısaltma yalnız sorguyu gevşetir, güveni düşürmez.
function buildQuery(product) {
  let name = searchQuery(String(product.name || '')) // TR kategori kelimeleri düşer
    // Parantezli part kodları ("(GV-N5090AORUSM ICE-32GD)") İncehesap aramasını
    // 0 sonuca düşürür (canlı vaka: Aorus Master Ice) — kapasite parantezleri
    // ("(1 TB)") hariç sorgudan at; eşleştirme (modelTokens) onları zaten atıyor.
    .replace(/\((?![^)]*(?:gb|tb))[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const cut = name.search(/\s(?:\d+(?:[.,]\d+)?\s*(?:cm|mm|inch|gb|tb|ghz|mhz|mah|wh|w)\b|\(\d|dual\s*sim|single\s*sim|android|windows|macos|wi-?fi|bluetooth|touchscreen)/i);
  if (cut > 10) name = name.slice(0, cut).trim();
  const brand = String(product.brand || '').trim();
  const brandFirst = (brand.split(/\s+/)[0] || '').toLowerCase();
  if (brandFirst && !name.toLowerCase().startsWith(brandFirst)) name = `${brand} ${name}`.trim();
  return name.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Kendi satırının tazeliği + mevcut en ucuz fiyat (USD) — akıl sağlığı hakemi. */
async function loadContext(productId) {
  const filter = `productId="${esc(productId)}" && price>0`;
  const r = await req('GET',
    `/api/collections/offers/records?perPage=50&fields=network,country,price,currency,lastCheckedAt&filter=${encodeURIComponent(filter)}`);
  if (r.status !== 200) throw new Error(`offer context ${r.status}`);
  let refUsd = 0;
  let ownCheckedAt = 0;
  for (const o of (r.body.items || [])) {
    if (o.network === 'incehesap') {
      const t = Date.parse(o.lastCheckedAt || '');
      if (Number.isFinite(t)) ownCheckedAt = Math.max(ownCheckedAt, t);
    }
    const usd = toUsd(o.price, o.currency);
    if (usd > 0 && (refUsd === 0 || usd < refUsd)) refUsd = usd;
  }
  return { refUsd, ownCheckedAt };
}

module.exports = {
  id: 'incehesap',

  isConfigured() {
    return ENV.INCEHESAP_ENABLED !== '0';
  },

  async getRateLimit() { return null; },
  CALLS_PER_PRODUCT: 0,

  async searchOffers(product) {
    if (breakerAt && Date.now() - breakerAt < BREAKER_COOLDOWN_MS) {
      throw new Error('incehesap şalteri açık');
    }
    if (breakerAt) { breakerAt = 0; strikes = MAX_STRIKES - 1; } // yarı-açık deneme
    const name = String(product.name || '').trim();
    if (name.length < 6) return [];

    const { refUsd, ownCheckedAt } = await loadContext(product.id);
    if (Date.now() - ownCheckedAt < SKIP_FRESH_MS) return null; // taze — ağa çıkmadan atla

    // 1) Arama: JSON uç noktası (HTML arama sayfası parse etmekten kararlı).
    const q = encodeURIComponent(buildQuery(product)).slice(0, 200);
    let sr;
    try {
      sr = await politeFetch(`${BASE}/ajax/search.php?q=${q}`);
    } catch (e) { bump(e.message); throw e; }
    if (sr.status !== 200) { bump(`arama ${sr.status}`); throw new Error(`incehesap arama ${sr.status}`); }
    let data;
    try { data = JSON.parse(sr.text); } catch { bump('arama JSON değil'); throw new Error('incehesap arama JSON değil (duvar?)'); }
    strikes = 0;

    const hit = bestCandidate(data && data.u, name);
    if (!hit) return []; // kesin eşleşme yok → bayat incehesap satırı temizlenir

    // 2) Ürün sayfası: fiyat yalnız burada (arama JSON'ı fiyat taşımaz).
    const pageUrl = `${BASE}/${hit.slug}-fiyati-${hit.id}/`;
    let pr;
    try {
      pr = await politeFetch(pageUrl);
    } catch (e) { bump(e.message); throw e; }
    if (pr.status !== 200) { bump(`ürün ${pr.status}`); throw new Error(`incehesap ürün ${pr.status}`); }
    const off = parseProductPage(pr.text);
    if (!off) { bump('microdata yok'); throw new Error('incehesap microdata kayıp (şablon değişti?)'); }
    strikes = 0;
    if (!(off.price > 0)) return []; // fiyatsız sayfa: göstermeye değer veri yok

    // Hakem: bilinen tüm fiyatlardan uçuk sapan eşleşme yanlış üründür.
    const usd = toUsd(off.price, off.currency);
    if (refUsd > 0 && usd > 0 && (usd > refUsd * 3.5 || usd < refUsd / 3.5)) {
      console.log(`  ! incehesap hakem: ${off.price} ${off.currency} (~$${usd.toFixed(0)}) vs ref ~$${refUsd.toFixed(0)} — atlandı (${hit.title.slice(0, 50)})`);
      return [];
    }

    const now = Date.now();
    return [{
      productId: product.id,
      merchantProductId: String(hit.id),
      title: hit.title,
      store: 'İncehesap',
      network: 'incehesap',
      country: 'TR', // SIKI KURAL: İncehesap yalnız TR — başka pazara asla yazma
      price: off.price,
      shipping: 0,
      totalPrice: off.price,
      currency: off.currency || 'TRY',
      priceText: `${off.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`,
      url: pageUrl,
      // Env'de INCEHESAP_PARAM+INCEHESAP_REF doluysa affiliate'e sarılır,
      // boşsa düz link — fiyat gösterimi atıftan bağımsız çalışır.
      affiliateUrl: buildAffiliateUrl('incehesap', pageUrl, { country: 'TR' }),
      condition: 'new',
      inStock: off.inStock,
      availability: off.inStock ? 'in_stock' : 'out_of_stock',
      matchConfidence: hit.extra === 0 ? 0.8 : 0.65, // sıkı token eşleşmesi; varyant şüphesi güveni düşürür
      source: 'incehesap',
      lastCheckedAt: new Date(now).toISOString(),
      priceUpdatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EXPIRES_MS).toISOString(),
    }];
  },
};
