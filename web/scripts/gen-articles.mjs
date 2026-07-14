// Blog article generator → PocketBase `articles` collection. For each niche topic
// it writes a native TR/EN/DE buying-guide listicle, grounded on the topic's real
// top products (own catalogue images only — no scraped web images, zero copyright
// risk), and upserts it into PB so the SITE renders it and the ADMIN/PB dashboard
// can edit it. Product refs link back to on-site specs pages (internal linking +
// the visitor lands on our affiliate links).
//
// SEO / E-E-A-T: every article carries an author byline, a real publish date, an
// SEO meta title + description, keyword tags, a "which to buy" verdict and a short
// FAQ — the exact signals Google's helpful-content / E-E-A-T systems reward.
//
// CADENCE (anti "scaled content abuse"): the cron path publishes EXACTLY ONE new
// article per run via --next; the shell wrapper gates it to once every ~3 days.
// One guide / 3 days ≈ 10/month — far under Google's daily-volume penalty band —
// and every guide is a genuinely different product set + angle, never a rebrand
// of the same list.
//
//   node web/scripts/gen-articles.mjs --validate       # count picks per topic, NO AI calls
//   node web/scripts/gen-articles.mjs --dry            # generate the next topic, PRINT it, no PB write
//   node web/scripts/gen-articles.mjs --next           # publish the next unpublished topic (or refresh the stalest)
//   node web/scripts/gen-articles.mjs --topics=a,b     # (re)generate specific topics by key
//   node web/scripts/gen-articles.mjs --only=cat1,cat2 # legacy per-category mode
//   node web/scripts/gen-articles.mjs --force          # ignore freshness / force regenerate
//
// PB admin creds: env (POCKETBASE_URL / _ADMIN_EMAIL / _ADMIN_PASSWORD) or, for
// local runs, migration/.env.

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { categoryLabel } from '../src/lib/format.js';

const here = dirname(fileURLToPath(import.meta.url));
const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');
const NEXT = process.argv.includes('--next') || DRY; // --dry implies "pick the next topic"
const VALIDATE = process.argv.includes('--validate');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);
const MAX_AGE_DAYS = 30;
const LANGS = ['tr', 'en', 'de'];
const LANG_NAME = { tr: 'Türkçe', en: 'English', de: 'Deutsch' };
// Honest editorial byline (E-E-A-T author signal without fabricating a fake
// human expert). Change to a real editor's name here if you ever want one.
const AUTHOR = 'Qor AI Editör Ekibi';
// Per-language headings for the verdict + FAQ appended into the conclusion HTML.
const VERDICT_H = { tr: 'Kısaca: hangisini almalı?', en: 'In short: which one to buy?', de: 'Kurz gesagt: welches kaufen?' };
const FAQ_H = { tr: 'Sıkça sorulan sorular', en: 'Frequently asked questions', de: 'Häufig gestellte Fragen' };

function pbCreds() {
  const e = { ...process.env };
  if ((!e.POCKETBASE_ADMIN_EMAIL || !e.POCKETBASE_ADMIN_PASSWORD)) {
    const f = join(here, '..', '..', 'migration', '.env');
    if (existsSync(f)) {
      for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
        const i = line.indexOf('='); if (i < 0 || line.startsWith('#')) continue;
        const k = line.slice(0, i).trim(); if (!e[k]) e[k] = line.slice(i + 1).trim();
      }
    }
  }
  return { url: (e.POCKETBASE_URL || PB_URL).replace(/\/$/, ''), email: e.POCKETBASE_ADMIN_EMAIL, pass: e.POCKETBASE_ADMIN_PASSWORD };
}

let token = '';
async function pbAuth() {
  const { url, email, pass } = pbCreds();
  const r = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password: pass }),
  });
  if (!r.ok) throw new Error(`PB auth ${r.status}`);
  token = (await r.json()).token;
}
async function pb(method, path, body) {
  const { url } = pbCreds();
  const r = await fetch(`${url}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function slugifyProduct(v) {
  return String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}
// Aynı modelin varyantlarını (renk / hafıza / EKRAN BOYUTU / BAĞLANTI) tek anahtara
// indirger — "Galaxy Watch 8 44mm / 40mm" ya da "Tab S11 Ultra Wi-Fi / 5G" üçlü
// tekrarları listeyi ucuz/spam gösteriyordu. mm + wifi/5g/lte token'ları da atılır.
function modelKey(name) {
  let s = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\b\d+\s?(gb|tb|mb)\b/g, ' ').replace(/\b\d+(\.\d+)?\s?(mm|"|inch|inç)\b/g, ' ')
    .replace(/\b(wi-?fi|wifi|lte|5g|4g|3g|cellular|esim|wlan)\b/g, ' ')
    // Apple Watch vb. kordon/kayış varyantları aynı saat sayılır (3× Ultra 3 tekrarı)
    .replace(/\b(trail|milan(o|ese)|ocean|kordon|alpine|braided|solo|nike|hermes|link|kayis)\b/g, ' ')
    .replace(/\b(schwarz|weiss|blau|rot|grau|silber|gold|black|white|blue|red|green|silver|mit|armband|loop|sport|titan(ium)?|aluminium|case|gehause)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return s.split(' ').slice(0, 6).join(' ');
}

async function tsCategories() {
  const qs = new URLSearchParams({ q: '*', query_by: 'name', per_page: '0', facet_by: 'category', max_facet_values: '60' });
  const r = await (await fetch(`${TS_URL}/collections/products/documents/search?${qs}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } })).json();
  return (r.facet_counts?.[0]?.counts || []).filter((c) => c.count >= 8).map((c) => c.value);
}
// opts.brands: tanınmış marka allow-list'i (no-name/leş ürünlerin listelere
// sızmasını keser — "Concord kulaklık" / "JCB Toughphone" vakaları).
// opts.nameRe: seri filtresi (SERT — eşleşmeyen elenir). opts.preferRe: konunun
// asıl ürünleri (YUMUŞAK — techScore'da amirallerin altında kalsalar da öne
// alınır). opts.techFloor / opts.techCeil: techScore bandı — floor junk/eskiyi
// keser; ceil bir SEGMENTİ (ör. bütçe) amiral gemilerinden ayırır.
// opts.queries: HEDEFLİ metin aramaları (seri adları). Katalog büyükse (laptops
// 10k, headphones 10k) tek q=* sweep'i istenen seriyi top-N penceresinin dışında
// bırakabiliyor (iş laptopları oyuncu rig'lerinin altında kalıyordu, bütçe
// telefonları amirallerin çok altında) — bu yüzden her seri adı ayrı aranır ve
// sonuçlar birleştirilir. Yoksa tek q=* sweep (yüksek-skorlu topic'ler için).
// opts.filterExtra: ek Typesense filtresi. opts.sortBy: sıralama (varsayılan
// techScore:desc; sayısal sıralama veri kirli olduğu için ÖNERİLMEZ).
async function tsTop(cat, n = 8, opts = {}) {
  const floor = Number.isFinite(opts.techFloor) ? opts.techFloor : 30;
  let filter = `category:=${cat} && techScore:>=${floor}`;
  if (Number.isFinite(opts.techCeil)) filter += ` && techScore:<${opts.techCeil}`;
  if (opts.filterExtra) filter += ` && ${opts.filterExtra}`;
  const base = { query_by: 'name', filter_by: filter, sort_by: opts.sortBy || 'techScore:desc', include_fields: 'id,name,slug,brand,techScore,imageUrl' };
  const useQueries = opts.queries && opts.queries.length;
  const terms = useQueries ? opts.queries : ['*'];
  const perPage = useQueries ? '20' : '250';
  const rawHits = [];
  for (const term of terms) {
    const qs = new URLSearchParams({ ...base, q: term, per_page: perPage });
    const r = await (await fetch(`${TS_URL}/collections/products/documents/search?${qs}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } })).json();
    for (const h of (r.hits || [])) rawHits.push(h.document);
  }
  const seen = new Set(); const pool = [];
  const brands = (opts.brands || []).map((b) => b.toLowerCase());
  const excludeRe = opts.excludeRe || null;
  for (const d of rawHits) {
    if (!d?.id || !d?.name) continue;
    if (!/^https?:\/\//i.test(d.imageUrl || '')) continue; // görselsiz ürün makaleye girmez
    if (brands.length && !brands.includes(String(d.brand || '').toLowerCase())) continue;
    if (opts.nameRe && !opts.nameRe.test(d.name)) continue;
    if (excludeRe && excludeRe.test(d.name)) continue;
    const k = modelKey(d.name); if (k && seen.has(k)) continue; if (k) seen.add(k);
    pool.push({ id: d.id, name: d.name, slug: slugifyProduct(d.slug || d.name), brand: d.brand || '', techScore: d.techScore || 0, imageUrl: d.imageUrl, price: '' });
  }
  // Çoklu arama sonuçları seri sırasında gelir → segment içinde en iyiyi öne almak
  // için techScore'a göre yeniden sırala (tek q=* sweep zaten sıralı; idempotent).
  pool.sort((a, b) => b.techScore - a.techScore);
  const ordered = opts.preferRe
    ? [...pool.filter((p) => opts.preferRe.test(p.name)), ...pool.filter((p) => !opts.preferRe.test(p.name))]
    : pool;
  // Tek markanın listeyi ele geçirmesini engelle (7 Anker / 8 Samsung = affiliate
  // spam görüntüsü). Marka başına tavan → çeşitlilik → daha güvenilir listicle.
  const maxPerBrand = Number.isFinite(opts.maxPerBrand) ? opts.maxPerBrand : 3;
  const brandCount = {};
  const out = [];
  for (const p of ordered) {
    const b = (p.brand || '').toLowerCase();
    if ((brandCount[b] || 0) >= maxPerBrand) continue;
    brandCount[b] = (brandCount[b] || 0) + 1;
    out.push(p);
    if (out.length >= n) break;
  }
  // Gerçek Amazon TL fiyatı PB rollup'ından (TS'te lowestPrice metni yok).
  if (out.length && !VALIDATE) {
    try {
      const filter2 = out.map((p) => `id="${p.id}"`).join(' || ');
      const pr = await pb('GET', `/api/collections/products/records?perPage=${out.length}&fields=id,lowestPrice,lowestPriceCurrency&filter=${encodeURIComponent(filter2)}`);
      const byId = new Map((pr.body.items || []).map((x) => [x.id, x]));
      for (const p of out) {
        const rec = byId.get(p.id);
        if (rec && Number(rec.lowestPrice) > 0 && rec.lowestPriceCurrency === 'TRY') {
          p.price = `${Math.round(Number(rec.lowestPrice)).toLocaleString('tr-TR')} TL`;
        }
      }
    } catch (_) { /* fiyatsız devam — makale yine üretilir */ }
  }
  return out;
}

// ── NICHE TOPIC BANK ────────────────────────────────────────────────
// Ordered map (insertion order = rotation order for --next). ~25 niche,
// searchable buying guides. Each surfaces a GENUINELY DIFFERENT product set
// (category × sub-type via brands + nameRe/preferRe + techFloor) so no two
// guides collapse into the same flagship list — the safeguard against Google's
// duplicate / scaled-content signals. Topics roll out one at a time via --next.
//
// AVOID DUPLICATING existing hand-made PB articles — the site already has:
// gaming phones (2026-en-iyi-oyuncu-telefonlari), camera phones, flagship phones,
// music subs, AI subs. Do NOT add topics that cannibalise those. (Slug detection
// won't catch a semantic dup with a different slug, so keep the bank distinct.)
const TOPICS = {
  'en-iyi-gaming-laptoplar': {
    cat: 'laptops', n: 8, techFloor: 50,
    slug_tr: 'en-iyi-gaming-laptoplar', slug_en: 'best-gaming-laptops', slug_de: 'beste-gaming-laptops',
    label: { tr: 'gaming laptoplar', en: 'gaming laptops', de: 'Gaming-Laptops' },
    brands: ['Asus', 'MSI', 'Lenovo', 'HP', 'Acer', 'Monster', 'Casper', 'Dell', 'Gigabyte'],
    nameRe: /rog|tuf|legion|loq|omen|victus|nitro|predator|katana|raider|vector|abra|tulpar|strix|scar|cyborg|g1[4568]|gaming/i,
    angle: 'Audience: PC gamers. Judge by GPU tier and wattage, cooling and fan noise, display (Hz, response), upgrade room and price/performance within its segment. Say concretely what class of gaming each machine is for (1080p high, 1440p ultra…). No office-laptop generalities.',
  },
  'en-iyi-kablosuz-kulakliklar': {
    cat: 'headphones', n: 8, techFloor: 40,
    slug_tr: 'en-iyi-kablosuz-kulakliklar', slug_en: 'best-wireless-earbuds', slug_de: 'beste-kabellose-earbuds',
    label: { tr: 'kablosuz kulaklıklar', en: 'wireless earbuds', de: 'kabellose Earbuds' },
    brands: ['Apple', 'Samsung', 'Sony', 'Sennheiser', 'Bose', 'Xiaomi', 'Huawei', 'Google', 'Nothing', 'JBL', 'Beats', 'Jabra', 'Anker'],
    nameRe: /buds|airpods|freebuds|free ?clip|ear \(|nothing ear|wf-|linkbuds|elite \d|jabra|momentum true|pixel buds|soundcore/i,
    excludeRe: /max|over-ear|kulak üstü/i,
    angle: 'Audience: everyday true-wireless earbud buyers. Judge sound signature, ANC quality, call clarity, fit/comfort for long wear, battery + case, and ecosystem pairing. Be concrete about who each set suits (gym, commute, calls). Not over-ear headphones.',
  },
  'en-iyi-4k-televizyonlar': {
    cat: 'tvs', n: 8, techFloor: 45,
    slug_tr: 'en-iyi-4k-televizyonlar', slug_en: 'best-4k-tvs', slug_de: 'beste-4k-fernseher',
    label: { tr: '4K televizyonlar', en: '4K TVs', de: '4K-Fernseher' },
    brands: ['Samsung', 'LG', 'Sony', 'TCL', 'Hisense', 'Philips', 'Panasonic', 'Vestel', 'Arçelik', 'Grundig'],
    excludeRe: /\boled\b|\b8k\b/i,
    angle: 'Audience: living-room 4K TV buyers who want value QLED/LED, not OLED. Judge panel brightness for bright rooms, local dimming, upscaling, smart platform, and value at each size. Say what room and use each fits. Do not cover OLED sets here.',
  },
  'en-iyi-akilli-saatler': {
    cat: 'smartwatches', n: 8, techFloor: 40,
    slug_tr: 'en-iyi-akilli-saatler', slug_en: 'best-smartwatches', slug_de: 'beste-smartwatches',
    label: { tr: 'akıllı saatler', en: 'smartwatches', de: 'Smartwatches' },
    brands: ['Apple', 'Samsung', 'Garmin', 'Huawei', 'Google', 'Xiaomi', 'Amazfit', 'Honor'],
    preferRe: /apple watch|galaxy watch|pixel watch|watch gt|watch ultra/i,
    angle: 'Audience: everyday smartwatch buyers. Judge daily health/fitness tracking, phone-ecosystem fit (iOS vs Android), battery life, app support and build. Be honest that Apple only pairs with iPhone. Name who each watch is for.',
  },
  'en-iyi-android-tabletler': {
    cat: 'tablets', n: 8, techFloor: 40,
    slug_tr: 'en-iyi-android-tabletler', slug_en: 'best-android-tablets', slug_de: 'beste-android-tablets',
    label: { tr: 'Android tabletler', en: 'Android tablets', de: 'Android-Tablets' },
    brands: ['Samsung', 'Xiaomi', 'Lenovo', 'Huawei', 'Honor', 'Nothing', 'Realme', 'Oppo', 'TCL'],
    nameRe: /galaxy tab|xiaomi pad|redmi pad|lenovo tab|tab p|tab m|yoga tab|matepad|honor pad|nothing|oppo pad|realme pad/i,
    angle: 'Audience: Android tablet buyers (media, note-taking, light work). Judge screen quality, performance for the price, stylus/keyboard support, software update length and speaker quality. Skip iPad. Say what each is best at.',
  },
  'en-iyi-ekran-kartlari': {
    cat: 'graphics_cards', n: 8, techFloor: 45,
    slug_tr: 'en-iyi-ekran-kartlari', slug_en: 'best-graphics-cards', slug_de: 'beste-grafikkarten',
    label: { tr: 'ekran kartları', en: 'graphics cards', de: 'Grafikkarten' },
    brands: ['Asus', 'MSI', 'Gigabyte', 'Zotac', 'Sapphire', 'PowerColor', 'Palit', 'Gainward', 'Inno3D', 'XFX', 'PNY', 'Nvidia', 'AMD'],
    preferRe: /rtx 50|rtx 40|radeon rx 9|radeon rx 7|rx 90|rx 79|rx 77/i,
    angle: 'Audience: PC builders choosing a GPU. Judge raster + ray-tracing performance per tier, VRAM, power draw/PSU needs, and price/performance at 1080p/1440p/4K. Name the resolution and settings each card targets. No CPU talk.',
  },
  'en-iyi-uygun-fiyatli-telefonlar': {
    cat: 'smartphones', n: 8, techFloor: 25, techCeil: 60,
    slug_tr: 'en-iyi-uygun-fiyatli-telefonlar', slug_en: 'best-budget-phones', slug_de: 'beste-guenstige-smartphones',
    label: { tr: 'uygun fiyatlı telefonlar', en: 'budget phones', de: 'günstige Smartphones' },
    brands: ['Samsung', 'Xiaomi', 'Redmi', 'Poco', 'Realme', 'Motorola', 'Nothing', 'Honor', 'Tecno', 'Infinix', 'Oppo', 'Vivo', 'TCL'],
    queries: ['redmi note', 'redmi 1', 'poco', 'galaxy a', 'galaxy m', 'realme', 'moto g', 'tecno', 'infinix', 'honor x', 'narzo', 'nothing phone (3a', 'cmf phone'],
    nameRe: /redmi|poco|galaxy a\d|galaxy m|realme|moto g|tecno|infinix|honor x|narzo|nothing phone \(3a|cmf phone/i,
    excludeRe: /ultra|pro\+|fold|flip/i,
    angle: 'Audience: value buyers on a tight budget. Judge what actually matters cheap: everyday performance, battery, screen and camera you can live with, plus software support years. Be blunt about the compromises. Name who each is for.',
  },
  'en-iyi-gurultu-onleyici-kulakliklar': {
    cat: 'headphones', n: 7, techFloor: 45,
    slug_tr: 'en-iyi-gurultu-onleyici-kulakliklar', slug_en: 'best-noise-cancelling-headphones', slug_de: 'beste-noise-cancelling-kopfhoerer',
    label: { tr: 'gürültü önleyici kulaklıklar', en: 'noise-cancelling headphones', de: 'Noise-Cancelling-Kopfhörer' },
    brands: ['Sony', 'Bose', 'Sennheiser', 'Apple', 'Bowers & Wilkins', 'Sennheiser', 'JBL', 'Anker', 'Technics', 'Beyerdynamic'],
    nameRe: /wh-1000|quietcomfort|qc\b|momentum \d|px[578]|airpods max|noise|soundcore space|h9\d|aviator/i,
    angle: 'Audience: travellers/office workers wanting over-ear ANC. Judge noise-cancelling depth, comfort for hours, sound signature, call quality and battery. Be concrete about flights/open offices. Over-ear only, not earbuds.',
  },
  'en-iyi-oled-televizyonlar': {
    cat: 'tvs', n: 7, techFloor: 55,
    slug_tr: 'en-iyi-oled-televizyonlar', slug_en: 'best-oled-tvs', slug_de: 'beste-oled-fernseher',
    label: { tr: 'OLED televizyonlar', en: 'OLED TVs', de: 'OLED-Fernseher' },
    brands: ['LG', 'Samsung', 'Sony', 'Philips', 'Panasonic'],
    nameRe: /oled/i,
    angle: 'Audience: home-cinema buyers ready to pay for OLED. Judge perfect blacks, motion, brightness limits, gaming features (120Hz/HDMI 2.1/VRR) and processing. Say which is best for movies vs gaming vs bright rooms. OLED sets only.',
  },
  'en-iyi-is-laptoplari': {
    cat: 'laptops', n: 8, techFloor: 55,
    slug_tr: 'en-iyi-is-laptoplari', slug_en: 'best-business-laptops', slug_de: 'beste-business-laptops',
    label: { tr: 'iş laptopları', en: 'business laptops', de: 'Business-Laptops' },
    brands: ['Lenovo', 'Dell', 'HP', 'Asus', 'Apple', 'Acer', 'Microsoft', 'Samsung', 'LG', 'Huawei'],
    queries: ['thinkpad', 'latitude', 'elitebook', 'probook', 'macbook air', 'zenbook', 'xps', 'expertbook', 'galaxy book', 'lg gram', 'matebook', 'surface laptop', 'thinkbook', 'swift go'],
    nameRe: /thinkpad|latitude|elitebook|probook|macbook air|zenbook|\bxps\b|expertbook|galaxy book|\bgram\b|matebook|surface laptop|thinkbook|swift go|swift x/i,
    excludeRe: /gaming|rog strix|\btuf\b|nitro|legion pro|victus|scar|raider|predator/i,
    angle: 'Audience: professionals and remote workers. Judge portability + weight, keyboard, battery for a full workday, build quality, ports and webcam. Not gaming rigs. Name the worker each suits (travel, coding, office).',
  },
  'en-iyi-oyuncu-monitorleri': {
    cat: 'monitors', n: 8, techFloor: 45,
    slug_tr: 'en-iyi-oyuncu-monitorleri', slug_en: 'best-gaming-monitors', slug_de: 'beste-gaming-monitore',
    label: { tr: 'oyuncu monitörleri', en: 'gaming monitors', de: 'Gaming-Monitore' },
    brands: ['Samsung', 'LG', 'Asus', 'MSI', 'Gigabyte', 'AOC', 'Acer', 'Dell', 'BenQ', 'ViewSonic', 'Koorui', 'Xiaomi'],
    preferRe: /odyssey|rog|tuf|predator|nitro|mag |aorus|ultragear|gaming|165 ?hz|180 ?hz|240 ?hz|360 ?hz/i,
    angle: 'Audience: PC/console gamers buying a monitor. Judge refresh rate, response time, panel type (IPS/VA/OLED), resolution vs GPU, adaptive sync and HDR. Match each to a use (competitive FPS vs immersive). No office-monitor talk.',
  },
  'en-iyi-katlanabilir-telefonlar': {
    cat: 'smartphones', n: 6, techFloor: 55,
    slug_tr: 'en-iyi-katlanabilir-telefonlar', slug_en: 'best-foldable-phones', slug_de: 'beste-faltbare-smartphones',
    label: { tr: 'katlanabilir telefonlar', en: 'foldable phones', de: 'faltbare Smartphones' },
    brands: ['Samsung', 'Google', 'Honor', 'Motorola', 'Oppo', 'Huawei', 'Xiaomi', 'Vivo'],
    nameRe: /fold|flip|razr|magic v|find n|mix flip|pocket/i,
    angle: 'Audience: buyers curious about foldables. Judge the two form factors (book-fold vs flip), crease/durability, hinge, multitasking, camera and battery trade-offs vs a normal flagship. Be honest about the premium. Name who each fits.',
  },
  'en-iyi-robot-supurgeler': {
    cat: 'robot_vacuums', n: 8, techFloor: 35,
    slug_tr: 'en-iyi-robot-supurgeler', slug_en: 'best-robot-vacuums', slug_de: 'beste-saugroboter',
    label: { tr: 'robot süpürgeler', en: 'robot vacuums', de: 'Saugroboter' },
    brands: ['Roborock', 'Xiaomi', 'Dreame', 'Ecovacs', 'iRobot', 'Eufy', 'Samsung', 'Roidmi', 'Tapo', 'TP-Link'],
    preferRe: /roborock|dreame|ecovacs|deebot|roomba|s\d|x\d|qrevo|omni/i,
    angle: 'Audience: buyers automating floor cleaning. Judge suction, mopping (and self-wash docks), navigation/mapping, obstacle avoidance, and app control. Match each to a home (pets, rugs, multi-floor). Be clear on the dock upsell.',
  },
  'en-iyi-oyuncu-kulakliklari': {
    cat: 'headphones', n: 7, techFloor: 35,
    slug_tr: 'en-iyi-oyuncu-kulakliklari', slug_en: 'best-gaming-headsets', slug_de: 'beste-gaming-headsets',
    label: { tr: 'oyuncu kulaklıkları', en: 'gaming headsets', de: 'Gaming-Headsets' },
    brands: ['HyperX', 'SteelSeries', 'Razer', 'Logitech', 'Corsair', 'Asus', 'Turtle Beach', 'Sony', 'EPOS', 'Sennheiser'],
    nameRe: /gaming|hyperx|cloud|arctis|kraken|blackshark|barracuda|virtuoso|nova|maxwell|g[3-9]\d\d|void|inzone|rog/i,
    angle: 'Audience: gamers buying a headset. Judge mic quality, positional audio/surround, comfort for long sessions, wireless vs wired latency and multi-platform support. Name the player each fits (competitive, console, streaming).',
  },
  'en-iyi-ogrenci-laptoplari': {
    cat: 'laptops', n: 8, techFloor: 35, techCeil: 72, maxPerBrand: 2,
    slug_tr: 'en-iyi-ogrenci-laptoplari', slug_en: 'best-student-laptops', slug_de: 'beste-studenten-laptops',
    label: { tr: 'öğrenci laptopları', en: 'student laptops', de: 'Studenten-Laptops' },
    brands: ['Lenovo', 'HP', 'Asus', 'Acer', 'Dell', 'Apple', 'Casper', 'Monster', 'Huawei', 'Samsung'],
    queries: ['ideapad', 'vivobook', 'aspire', 'inspiron', 'modern', 'thinkbook', 'hp 15', 'hp 250', 'pavilion', 'chromebook', 'macbook air m1', 'swift', 'excalibur'],
    nameRe: /ideapad|vivobook|aspire|inspiron|\bmodern\b|thinkbook|hp 15|hp 250|pavilion|chromebook|macbook air m1|\bswift\b|excalibur/i,
    excludeRe: /rog|legion pro|predator|raider|scar|strix/i,
    angle: 'Audience: students on a budget. Judge value performance for notes/research/light editing, battery for a campus day, weight, screen and durability. Be realistic about what to skip. Name the study use each fits. Keep it affordable — not premium ultrabooks.',
  },
  'en-iyi-uygun-fiyatli-tabletler': {
    cat: 'tablets', n: 7, techFloor: 12, techCeil: 48,
    slug_tr: 'en-iyi-uygun-fiyatli-tabletler', slug_en: 'best-budget-tablets', slug_de: 'beste-guenstige-tablets',
    label: { tr: 'uygun fiyatlı tabletler', en: 'budget tablets', de: 'günstige Tablets' },
    brands: ['Samsung', 'Xiaomi', 'Redmi', 'Lenovo', 'Honor', 'Realme', 'TCL', 'Nokia', 'Alcatel', 'Huawei', 'Oppo'],
    queries: ['redmi pad', 'xiaomi pad se', 'galaxy tab a', 'lenovo tab', 'tab m', 'honor pad x', 'pad se', 'matepad se', 'realme pad', 'nokia t', 'smart tab', 'galaxy tab s6 lite'],
    nameRe: /redmi pad|xiaomi pad se|galaxy tab a|lenovo tab|tab m|honor pad x|pad se|matepad se|realme pad|nokia t|smart tab|tab s6 lite|flex a/i,
    angle: 'Audience: buyers wanting a cheap tablet for streaming, browsing and kids. Judge screen for the money, battery, storage/expandability and whether performance is bearable. Be honest about the ceiling. Name the casual use each fits.',
  },
  'en-iyi-spor-akilli-saatleri': {
    cat: 'smartwatches', n: 7, techFloor: 18, maxPerBrand: 2,
    slug_tr: 'en-iyi-spor-akilli-saatleri', slug_en: 'best-sports-watches', slug_de: 'beste-sportuhren',
    label: { tr: 'spor akıllı saatleri', en: 'sports watches', de: 'Sportuhren' },
    brands: ['Garmin', 'Amazfit', 'Polar', 'Suunto', 'Coros', 'Huawei', 'Apple'],
    // Garmin/Coros/Suunto techScore'da düşük kalır (spec canavarı değiller) →
    // büyük smartwatch kategorisinde amirallerin altında gömülür; hedefli arama şart.
    queries: ['garmin', 'forerunner', 'fenix', 'instinct', 'venu', 'amazfit', 't-rex', 'polar', 'suunto', 'coros', 'huawei watch gt', 'apple watch ultra'],
    nameRe: /garmin|forerunner|fenix|instinct|venu|amazfit|t-rex|polar|suunto|coros|watch gt|watch ultra/i,
    angle: 'Audience: runners, cyclists, hikers and gym-goers. Judge GPS accuracy, training metrics, battery in GPS mode, ruggedness and multi-sport modes. Say which sport each excels at. Fitness first, smart features second.',
  },
  'en-iyi-oyun-konsollari': {
    cat: 'gaming_consoles', n: 6, techFloor: 20,
    slug_tr: 'en-iyi-oyun-konsollari', slug_en: 'best-game-consoles', slug_de: 'beste-spielekonsolen',
    label: { tr: 'oyun konsolları', en: 'game consoles', de: 'Spielekonsolen' },
    brands: ['Sony', 'Microsoft', 'Nintendo', 'Valve', 'Asus', 'Lenovo'],
    preferRe: /playstation|ps5|xbox|switch|steam deck|rog ally|legion go/i,
    angle: 'Audience: buyers choosing a console or handheld. Judge library/exclusives, performance, price of console + games, and handheld vs living-room use. Match each to a player (families, power gamers, on-the-go). Be clear on ecosystems.',
  },
  'en-iyi-projektorler': {
    cat: 'projectors', n: 7, techFloor: 30,
    slug_tr: 'en-iyi-projektorler', slug_en: 'best-projectors', slug_de: 'beste-beamer',
    label: { tr: 'projektörler', en: 'projectors', de: 'Beamer' },
    brands: ['Epson', 'BenQ', 'ViewSonic', 'Xiaomi', 'Anker', 'XGIMI', 'Optoma', 'LG', 'Samsung', 'JmGO', 'Acer'],
    preferRe: /xgimi|nebula|benq|epson|halo|horizon|freestyle|cosmos|the premiere/i,
    angle: 'Audience: home-theatre buyers. Judge brightness (lumens) for your room light, native resolution, throw distance/short-throw, built-in smart apps and speakers. Match each to a setup (dark room vs living room). Be clear on ambient-light limits.',
  },
  'en-iyi-uygun-fiyatli-kulakliklar': {
    cat: 'headphones', n: 7, techFloor: 12, techCeil: 46,
    slug_tr: 'en-iyi-uygun-fiyatli-kulakliklar', slug_en: 'best-budget-earbuds', slug_de: 'beste-guenstige-earbuds',
    label: { tr: 'uygun fiyatlı kulaklıklar', en: 'budget earbuds', de: 'günstige Earbuds' },
    brands: ['Xiaomi', 'Samsung', 'JBL', 'Anker', 'QCY', 'Haylou', 'Redmi', 'Realme', 'Nothing', 'Honor', 'Baseus', 'Oppo', 'Soundpeats', 'Soundcore'],
    queries: ['redmi buds', 'galaxy buds fe', 'nothing ear (a', 'cmf buds', 'soundcore', 'soundpeats', 'qcy', 'haylou', 'realme buds', 'jbl tune', 'jbl wave', 'jbl vibe', 'honor choice', 'anker'],
    nameRe: /redmi buds|galaxy buds fe|nothing ear \(a|cmf buds|soundcore|soundpeats|qcy|haylou|realme buds|jbl tune|jbl wave|jbl vibe|honor choice|anker/i,
    maxPerBrand: 3,
    angle: 'Audience: buyers wanting solid earbuds cheap. Judge sound and ANC you actually get at this price, call quality, battery and comfort. Be blunt about what the budget costs you. Name who each set is a smart pick for.',
  },
  'en-iyi-oyun-televizyonlari': {
    cat: 'tvs', n: 7, techFloor: 50,
    slug_tr: 'en-iyi-oyun-televizyonlari', slug_en: 'best-gaming-tvs', slug_de: 'beste-gaming-fernseher',
    label: { tr: 'oyun televizyonları', en: 'gaming TVs', de: 'Gaming-Fernseher' },
    brands: ['LG', 'Samsung', 'Sony', 'TCL', 'Hisense', 'Philips'],
    preferRe: /oled|qn9|neo qled|c[234] |g[234] |120 ?hz|144 ?hz|gaming/i,
    excludeRe: /\b8k\b/i,
    angle: 'Audience: console/PC gamers buying a TV. Judge HDMI 2.1 (4K120), VRR/ALLM, input lag, brightness and burn-in risk. Match each to a console (PS5, Series X, PC). Gaming features first, not general picture talk.',
  },
  'en-iyi-android-akilli-saatler': {
    cat: 'smartwatches', n: 7, techFloor: 40, maxPerBrand: 2,
    slug_tr: 'en-iyi-android-akilli-saatler', slug_en: 'best-android-smartwatches', slug_de: 'beste-android-smartwatches',
    label: { tr: 'Android akıllı saatler', en: 'Android smartwatches', de: 'Android-Smartwatches' },
    brands: ['Samsung', 'Google', 'Huawei', 'Xiaomi', 'Amazfit', 'Honor', 'Mobvoi', 'OnePlus'],
    nameRe: /galaxy watch|pixel watch|watch gt|watch \d|amazfit|ticwatch|honor watch|oneplus watch|redmi watch/i,
    angle: 'Audience: Android phone owners choosing a watch. Judge Wear OS vs custom OS, health tracking, battery life, app support and phone-brand pairing perks. Skip Apple Watch. Name the Android user each fits.',
  },
  'en-iyi-oda-monitorleri': {
    cat: 'monitors', n: 7, techFloor: 35, maxPerBrand: 2,
    slug_tr: 'en-iyi-oda-monitorleri', slug_en: 'best-office-monitors', slug_de: 'beste-buero-monitore',
    label: { tr: 'ofis monitörleri', en: 'office monitors', de: 'Büro-Monitore' },
    brands: ['Dell', 'LG', 'Samsung', 'HP', 'BenQ', 'ViewSonic', 'Philips', 'AOC', 'Lenovo', 'Asus'],
    queries: ['proart', 'thinkvision', 'dell ultrasharp', 'dell u24', 'dell u27', 'dell u32', 'dell p24', 'dell p27', 'lg ultrafine', 'lg 27u', 'lg 32u', 'benq pd', 'benq gw', 'viewsonic vg', 'samsung smart monitor', 'hp e2', 'philips brilliance'],
    nameRe: /proart|thinkvision|ultrasharp|\bu2[47]|\bu3[24]|\bp2[47]|ultrafine|\bpd[23]\d|\bgw2\d|\bvg2\d|smart monitor|brilliance|\be2[47]/i,
    excludeRe: /gaming|legion|alienware|predator|nitro|\bmag\b|aorus|odyssey|\brog\b|swift|\btuf\b|ultragear|\d{3} ?hz|1[68]0 ?hz|240 ?hz|360 ?hz|curved/i,
    angle: 'Audience: home-office and productivity users. Judge ergonomics (height/pivot), USB-C single-cable docking, eye comfort, colour for everyday work and size/resolution value. Not gaming panels. Name the desk setup each fits.',
  },
  'en-iyi-drone': {
    cat: 'drones', n: 6, techFloor: 30,
    slug_tr: 'en-iyi-drone', slug_en: 'best-drones', slug_de: 'beste-drohnen',
    label: { tr: 'dronelar', en: 'drones', de: 'Drohnen' },
    brands: ['DJI', 'Autel', 'Hubsan', 'Ryze', 'Potensic', 'Holy Stone'],
    preferRe: /dji|mavic|mini \d|air \d|neo|flip|autel|evo|nano/i,
    angle: 'Audience: aerial photo/video hobbyists. Judge camera/sensor and video specs, flight time, range, obstacle avoidance and the sub-250g licence advantage. Match each to a use (travel vlog, pro footage, beginner). Note local rules briefly.',
  },
  'en-iyi-e-kitap-okuyucular': {
    cat: 'e_readers', n: 6, techFloor: 20,
    slug_tr: 'en-iyi-e-kitap-okuyucular', slug_en: 'best-e-readers', slug_de: 'beste-e-reader',
    label: { tr: 'e-kitap okuyucular', en: 'e-readers', de: 'E-Reader' },
    brands: ['Amazon', 'Kobo', 'PocketBook', 'Onyx', 'Tolino'],
    preferRe: /kindle|paperwhite|oasis|scribe|kobo|clara|libra|sage|boox|pocketbook/i,
    angle: 'Audience: book lovers wanting an e-reader. Judge screen (warmth/front-light), size, waterproofing, store/format openness (ePub vs Kindle), page-turn feel and battery. Match each to a reader (commuter, note-taker, library user).',
  },
};

async function deepseek(system, user) {
  const { url } = pbCreds();
  const r = await fetch(`${url}/api/ai/deepseek`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 3500, temperature: 0.85, response_format: { type: 'json_object' } }),
  });
  if (!r.ok) throw new Error(`deepseek ${r.status}`);
  const c = (await r.json())?.choices?.[0]?.message?.content;
  if (!c) throw new Error('deepseek empty');
  return JSON.parse(c);
}

async function geminiJson(system, user) {
  const { url } = pbCreds();
  const r = await fetch(`${url}/api/ai/gemini`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      // yüksek tavan: uzun listicle + verdict + FAQ tek JSON'da kesilmesin
      generationConfig: { maxOutputTokens: 8192, temperature: 0.85, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const data = await r.json();
  const c = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!c) throw new Error('gemini empty');
  return JSON.parse(c);
}

// DeepSeek (bakiye varsa) → Gemini fallback; tek sağlayıcı ölünce üretim durmasın.
// Gemini tarafına bir tekrar hakkı: 429 ve kesik-JSON (truncation) geçici olabiliyor.
async function aiJson(system, user) {
  try { return await deepseek(system, user); } catch (_) { /* bakiye/kota → gemini */ }
  try { return await geminiJson(system, user); }
  catch (_) { return await geminiJson(system, user); }
}

function sys(lang) {
  return [
    `You are a senior tech editor at a ${LANG_NAME[lang]} tech publication, writing a buying guide. You have strong opinions formed by years of reviewing hardware.`,
    'VOICE — must read like a human editor, never like generated text:',
    '- Vary sentence length; mix short punchy sentences with longer ones. Start some sentences with "Ama", "Yine de", "Açıkçası" (or natural equivalents in the target language).',
    '- Take positions: say which pick YOU would buy and why. Include one honest drawback per model — no product is perfect.',
    '- Concrete over abstract: name specs, use-cases and real trade-offs, never vague praise.',
    'BANNED (instant tells of machine text): "günümüzde", "sonuç olarak", "özetle", "ister ... ister ...", "arayanlar için", "öne çıkıyor", "ihtiyaçlarınıza", "in conclusion", "whether you\'re", "game-changer", "delve", "comprehensive", "furthermore", "elevate", exclamation marks, rhetorical questions, and starting every pick the same way.',
    'NEVER mention AI or that this is generated. Do NOT invent prices or availability — a real price may be provided per model; you may call something expensive/good value but never state numbers not given.',
    'Output ONLY valid JSON.',
  ].join('\n');
}
function userMsg(lang, label, picks, angle = '') {
  const list = picks.map((p) => `- ${p.name}${p.brand ? ` (${p.brand})` : ''} — score ${p.techScore}/100${p.price ? ` — street price ${p.price}` : ''}`).join('\n');
  return [
    `Topic: best ${label} (2026 buying guide). Language: ${LANG_NAME[lang]}.`,
    angle ? `Editorial angle (follow strictly): ${angle}` : '',
    `Real models to cover:\n${list}`,
    'Return JSON:',
    '{',
    '  "title": "<SEO title matching the topic intent, <=60 chars, include the year 2026>",',
    '  "lead": "<2 sentences, direct and specific — what this guide answers and for whom>",',
    '  "body": "<HTML: one intro <p> with a clear point of view, then an <h2> with a <ul> of 4-5 concrete buying criteria for THIS topic. Use only <h2>,<p>,<ul>,<li>,<strong>. No model names here, no images, no links, no invented prices.>",',
    '  "picks": [ {"name":"<EXACT name from the list above>","desc":"<3-4 sentences: what it does best for this audience, one honest weakness, who should pick it. Each pick must OPEN DIFFERENTLY.>"}, ... one per listed model ],',
    '  "verdict": "<2-3 sentences: name your single top pick AND a runner-up/value alternative from the list, and say who each is for. This is the editor\'s call.>",',
    '  "faq": [ {"q":"<a real question a buyer of this topic googles>","a":"<1-2 sentence concrete answer>"}, ... exactly 3 ],',
    '  "metaTitle": "<=60 char SEO title, may differ slightly from title>",',
    '  "metaDescription": "<=155 char meta description that earns the click, specific>",',
    '  "tags": "<4-6 comma-separated keyword phrases a buyer would search, in the target language>"',
    '}',
    `Everything in ${LANG_NAME[lang]}. picks[].name MUST match the list exactly.`,
  ].filter(Boolean).join('\n');
}

// Model bazen **markdown** bazen <strong> döndürüyor; conclusion HTML olarak
// basıldığı için markdown kalın/italik → gerçek etikete çevrilir (yoksa TR'de
// düz "**...**" yıldızları görünüyordu).
function mdToHtml(t) {
  return String(t || '').trim()
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>');
}
// Metni max uzunluğa KELİME sınırında kırp (meta açıklaması kelime ortasında
// kesilmesin — "ekran ve t" gibi çirkin uçlar Google'da kötü görünür).
function clampText(s, max) {
  s = String(s || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '').trim();
}

// verdict + FAQ → conclusion HTML (frontend renders `conclusion_<lang>` as HTML).
function buildConclusion(lang, verdict, faq) {
  const parts = [];
  if (verdict && String(verdict).trim()) {
    parts.push(`<h2>${VERDICT_H[lang]}</h2><p>${mdToHtml(verdict)}</p>`);
  }
  const qs = (faq || []).filter((f) => f && f.q && f.a).slice(0, 4);
  if (qs.length) {
    parts.push(`<h2>${FAQ_H[lang]}</h2>`);
    for (const f of qs) parts.push(`<h3>${mdToHtml(f.q)}</h3><p>${mdToHtml(f.a)}</p>`);
  }
  return parts.join('\n');
}

async function genOne(cat, existing, topic = null, force = FORCE) {
  if (!force && existing) {
    const ageDays = (Date.now() - Date.parse(existing.updated || 0)) / 86400000;
    if (ageDays < MAX_AGE_DAYS) return { cat, status: 'skip' };
  }
  const picks = await tsTop(topic ? topic.cat : cat, topic ? (topic.n || 8) : 8, topic || {});
  if (picks.length < 4) return { cat, status: `too-few(${picks.length})` };
  const prod = picks.map((p) => ({ id: p.id, slug: p.slug, name: p.name, brand: p.brand, techScore: p.techScore, imageUrl: p.imageUrl, ...(p.price ? { price: p.price } : {}) }));
  const byName = new Map(picks.map((p, i) => [p.name.toLowerCase().trim(), i]));
  const rec = topic
    ? { slug: topic.slug_tr, slug_tr: topic.slug_tr, slug_en: topic.slug_en, slug_de: topic.slug_de, status: 'published', category: topic.cat, cover: picks[0].imageUrl, author: AUTHOR }
    : { slug: cat, status: 'published', category: cat, cover: picks[0].imageUrl, author: AUTHOR };
  // Yeni makalede yayın tarihi = şimdi (E-E-A-T + JSON-LD datePublished). Tazeleme
  // (mevcut kaydı güncelleme) publishedAt'e dokunmaz — `updated` dateModified olur.
  if (!existing) rec.publishedAt = new Date().toISOString();
  for (const lang of LANGS) {
    const label = topic ? (topic.label[lang] || topic.label.tr) : categoryLabel(cat, lang);
    const out = await aiJson(sys(lang), userMsg(lang, label, picks, topic ? topic.angle : ''));
    rec[`title_${lang}`] = clampText(out.title || '', 80);
    rec[`lead_${lang}`] = String(out.lead || '').trim();
    rec[`body_${lang}`] = String(out.body || '').trim();
    rec[`conclusion_${lang}`] = buildConclusion(lang, out.verdict, out.faq);
    rec[`metaTitle_${lang}`] = clampText(out.metaTitle || out.title || '', 64);
    rec[`metaDescription_${lang}`] = clampText(out.metaDescription || out.lead || '', 160);
    rec[`tags_${lang}`] = String(out.tags || '').trim().slice(0, 200);
    // Açıklamayı doğru ürüne bağla: önce TAM ad eşleşmesi, sonra tam-ad substring;
    // 14-karakter önek eşleşmesi yakın-varyant adlarda çakışıyordu (G16 açıklaması
    // Duo 16'ya yapışmıştı). `used` çift-atamayı engeller → her açıklama tek ürüne.
    const used = new Set();
    for (const pk of (out.picks || [])) {
      const key = String(pk.name || '').toLowerCase().trim();
      if (!key || !pk.desc) continue;
      let idx = (byName.has(key) && !used.has(byName.get(key))) ? byName.get(key) : -1;
      if (idx < 0) idx = picks.findIndex((p, i) => !used.has(i) && key.length > 8 && (p.name.toLowerCase().includes(key) || key.includes(p.name.toLowerCase())));
      if (idx >= 0) { used.add(idx); prod[idx][`desc_${lang}`] = String(pk.desc).trim(); }
    }
  }
  // Açıklaması olmayan pick'leri DÜŞÜR: yakın-varyant modeller (aynı laptop'un
  // farklı SKU kodu — Zephyrus G16 TB008X vs TB045) AI tarafından tek sayılıp
  // açıklamasız kalabiliyor; boş ürün bloğu sayfada kötü görünür. En az 4 dolu şart.
  rec.products = prod.filter((p) => (p.desc_tr || '').trim().length > 20);
  // Kalite kapısı: yapısal olarak eksik makale yayınlanmaz.
  if (!rec.title_tr || !rec.body_tr || rec.body_tr.length < 300) return { cat, status: 'thin' };
  if (rec.products.length < 4) return { cat, status: `few-desc(${rec.products.length})` };
  if (DRY) return { cat, status: 'dry', rec };
  if (existing) { const r = await pb('PATCH', `/api/collections/articles/records/${existing.id}`, rec); return { cat, status: r.status < 300 ? 'updated' : `err:${r.status}` }; }
  const r = await pb('POST', '/api/collections/articles/records', rec);
  return { cat, status: r.status < 300 ? 'created' : `err:${r.status}:${JSON.stringify(r.body).slice(0, 200)}` };
}

// --validate: her topic için pick sayısını + ilk 3 modeli yazdır, HİÇ AI çağırma.
async function validate() {
  console.log(`[validate] ${Object.keys(TOPICS).length} topics\n`);
  let bad = 0;
  for (const [key, topic] of Object.entries(TOPICS)) {
    try {
      const picks = await tsTop(topic.cat, topic.n || 8, topic);
      const ok = picks.length >= 4;
      if (!ok) bad++;
      console.log(`${ok ? '✓' : '✗'} ${key.padEnd(38)} ${String(picks.length).padStart(2)} picks  |  ${picks.slice(0, 3).map((p) => p.name).join(' · ')}`);
    } catch (e) { bad++; console.log(`✗ ${key.padEnd(38)} ERR ${e.message}`); }
  }
  console.log(`\n[validate] ${Object.keys(TOPICS).length - bad}/${Object.keys(TOPICS).length} topics yield >=4 picks`);
  if (bad) process.exitCode = 1;
}

// --next / --dry: yayınlanmamış İLK topic'i seç, üret, tek makale yayınla. Bu
// topic üretilemezse (too-few/thin) SIRADAKİ topic'e geç; İLK BAŞARIDA dur.
// Tüm bank yayınlandıysa: en eski güncellenen yayınlanmış topic'i TAZELE.
async function runNext(existing) {
  const entries = Object.entries(TOPICS);
  const unpublished = entries.filter(([, t]) => !existing.has(t.slug_tr));
  if (unpublished.length) {
    for (const [key, topic] of unpublished) {
      try {
        const r = await genOne(key, null, topic);
        if (r.status === 'created' || r.status === 'dry') {
          console.log(`[next] ${key}: ${r.status}${r.status === 'dry' ? '' : ' — published'}`);
          if (r.status === 'dry') printDry(topic, r.rec);
          return;
        }
        console.log(`[next] ${key}: ${r.status} — skipping to next topic`);
      } catch (e) { console.log(`[next] ${key}: err:${e.message} — skipping to next topic`); }
    }
    console.log('[next] no publishable topic among the unpublished set.');
    return;
  }
  // Bank tükendi → en eski yayınlanmış topic'i tazele (evergreen refresh).
  const published = entries
    .map(([key, t]) => [key, t, existing.get(t.slug_tr)])
    .filter(([, , rec]) => rec)
    .sort((a, b) => Date.parse(a[2].updated || 0) - Date.parse(b[2].updated || 0));
  if (!published.length) { console.log('[next] nothing to refresh.'); return; }
  const [key, topic, rec] = published[0];
  // Tazeleme: en eskiyi KOŞULSUZ yeniden üret (force) — cadence değişse bile
  // 30-gün eşiğine takılıp sessizce durmasın.
  const r = await genOne(key, DRY ? null : rec, topic, true); // --dry: taze üret, yazma
  console.log(`[next] refresh ${key}: ${r.status}`);
  if (r.status === 'dry') printDry(topic, r.rec);
}

function printDry(topic, rec) {
  const trunc = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));
  console.log('\n════════ DRY PREVIEW (not written to PB) ════════');
  console.log('slug        :', rec.slug, '| category:', rec.category, '| author:', rec.author);
  console.log('publishedAt :', rec.publishedAt || '(refresh — keeps original)');
  for (const lang of LANGS) {
    console.log(`\n── ${lang.toUpperCase()} ─────────────────────────────`);
    console.log('title       :', rec[`title_${lang}`]);
    console.log('metaTitle   :', rec[`metaTitle_${lang}`]);
    console.log('metaDesc    :', rec[`metaDescription_${lang}`], `(${(rec[`metaDescription_${lang}`] || '').length} ch)`);
    console.log('tags        :', rec[`tags_${lang}`]);
    console.log('lead        :', rec[`lead_${lang}`]);
    console.log('body        :', trunc(rec[`body_${lang}`].replace(/\s+/g, ' '), 320));
    console.log('conclusion  :', trunc(rec[`conclusion_${lang}`].replace(/\s+/g, ' '), 320));
  }
  console.log('\npicks:');
  for (const p of rec.products) console.log(`  • ${p.name} (score ${p.techScore}${p.price ? ', ' + p.price : ''})\n      TR: ${trunc((p.desc_tr || '').replace(/\s+/g, ' '), 180)}`);
  console.log('\n═════════════════════════════════════════════════');
}

async function main() {
  if (VALIDATE) { await validate(); return; }
  await pbAuth();
  const existRes = await pb('GET', '/api/collections/articles/records?perPage=300&fields=id,slug,slug_tr,updated');
  // key by BOTH slug ve slug_tr → "yayınlandı mı" kontrolü topic.slug_tr'yi yakalar.
  const existing = new Map();
  for (const x of (existRes.body.items || [])) { if (x.slug) existing.set(x.slug, x); if (x.slug_tr) existing.set(x.slug_tr, x); }

  if (NEXT) { await runNext(existing); return; }

  const TOPIC_ARG = (process.argv.find((a) => a.startsWith('--topics=')) || '').replace('--topics=', '').split(',').filter(Boolean);
  if (TOPIC_ARG.length) {
    console.log(`[articles] ${TOPIC_ARG.length} topics; ${existing.size} existing keys`);
    for (const key of TOPIC_ARG) {
      const topic = TOPICS[key];
      if (!topic) { console.log(`  ${key}: unknown topic (options: ${Object.keys(TOPICS).join(', ')})`); continue; }
      try { const r = await genOne(key, existing.get(topic.slug_tr), topic); console.log(`  ${key}: ${r.status}`); }
      catch (e) { console.log(`  ${key}: err:${e.message}`); }
    }
    return;
  }
  let cats = ONLY.length ? ONLY : await tsCategories();
  console.log(`[articles] ${cats.length} categories; ${existing.size} existing keys`);
  for (const cat of cats) {
    try { const r = await genOne(cat, existing.get(cat)); console.log(`  ${cat}: ${r.status}`); }
    catch (e) { console.log(`  ${cat}: err:${e.message}`); }
  }
}
main().catch((e) => { console.error('[articles] fatal:', e); process.exit(1); });
