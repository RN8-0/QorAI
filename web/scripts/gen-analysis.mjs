// ═══════════════════════════════════════════════════════════════════════════
//  Yayinlanabilir URUN ANALIZI ureteci → PocketBase `analyses` (TASLAK olarak).
//
//  NE ISE YARAR: sitenin tek OZGUN varligi AI analizi. Spec tablosu ve fiyat
//  Epey'den geliyor ve onlarca Turk sitesinde birebir ayni duruyor; Google'in
//  spec icin bizi tercih etmesi icin sebep yok. Baska hicbir yerde bulunmayan
//  bir HUKUM icin sebep var.
//
//  KURAL — HER SEY TASLAK OLARAK YAZILIR (status='draft'). Bu betik hicbir
//  kaydi YAYINA ALMAZ. Yayin karari admin panelinden, insan onayiyla verilir.
//  Sebebi teknik degil politik: 107k urune otomatik AI metni basmak, spec
//  sayfalarindaki olcekli-icerik problemini bu sefer AI metniyle yeniden kurar
//  ve Google'in spam politikasi bunu adiyla sayar. Fark hacimde degil,
//  editoryal kapida.
//
//  Prompt TEK KOPYA: admin/js/analysis_prompt.js — admin paneli de ayni dosyayi
//  kosturur (bkz. scripts/_spec_sandbox.mjs, admin/js/spec_i18n.js deseni).
//
//   node web/scripts/gen-analysis.mjs --product=samsung-galaxy-s26-ultra
//   node web/scripts/gen-analysis.mjs --category=smartphones --limit=5
//   node web/scripts/gen-analysis.mjs --product=<slug> --force   # taslagi ez
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadAdminSandbox } from '../../scripts/_spec_sandbox.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
const LANGS = ['tr', 'en'];

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const FORCE = process.argv.includes('--force');
const URUN = arg('product');
const KATEGORI = arg('category');
const LIMIT = Number(arg('limit') || 3);

// Prompt + normalize + HTML: admin ile AYNI dosya.
const sandbox = loadAdminSandbox([join(here, '..', '..', 'admin', 'js', 'analysis_prompt.js')]);
const PROMPT = sandbox.QorAiAnalysisPrompt;
if (!PROMPT) throw new Error('admin/js/analysis_prompt.js yuklenemedi');

// spec cevirisi de ayni tek kaynaktan (TR/EN spec etiketleri)
const specSandbox = loadAdminSandbox([join(here, '..', '..', 'admin', 'js', 'spec_i18n.js')]);
const SPEC = specSandbox.QorAiSpecI18n;

function pbCreds() {
  const e = { ...process.env };
  if (!e.POCKETBASE_ADMIN_EMAIL || !e.POCKETBASE_ADMIN_PASSWORD) {
    const f = join(here, '..', '..', 'migration', '.env');
    if (existsSync(f)) {
      for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
        const i = line.indexOf('=');
        if (i < 0 || line.startsWith('#')) continue;
        const k = line.slice(0, i).trim();
        if (!(k in e)) e[k] = line.slice(i + 1).trim();
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

async function geminiJson(system, user) {
  const { url } = pbCreds();
  const r = await fetch(`${url}/api/ai/gemini`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.8, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const data = await r.json();
  const c = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!c) throw new Error('gemini empty');
  return JSON.parse(c);
}
// Tek tekrar hakki: 429 ve kesik-JSON gecici olabiliyor (gen-articles ile ayni).
async function aiJson(system, user) {
  try { return await geminiJson(system, user); } catch (_) { return await geminiJson(system, user); }
}

function slugify(v) {
  return String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

async function ts(params) {
  const qs = new URLSearchParams({ q: '*', query_by: 'name', ...params });
  const r = await fetch(`${TS_URL}/collections/products/documents/search?${qs}`, {
    headers: { 'X-TYPESENSE-API-KEY': TS_KEY },
  });
  if (!r.ok) throw new Error(`typesense ${r.status}`);
  return r.json();
}

// Analiz edilecek urunler. `--product` tek urun; `--category` o kategorinin en
// yuksek techScore'lu, FIYATI OLAN urunleri (fiyatsiz urun hakkinda "alinir mi"
// yazmak anlamsiz).
async function hedefUrunler() {
  if (URUN) {
    const j = await ts({ filter_by: `slug:=${URUN}`, per_page: '1', include_fields: 'id,_raw' });
    const hit = (j.hits || [])[0];
    if (!hit) throw new Error(`urun bulunamadi: ${URUN}`);
    return [JSON.parse(hit.document._raw)];
  }
  if (!KATEGORI) throw new Error('--product=<slug> ya da --category=<kategori> gerekli');
  const j = await ts({
    filter_by: `category:=${KATEGORI} && lowestPriceUSD:>0`,
    sort_by: 'techScore:desc', per_page: String(Math.min(LIMIT, 20)), include_fields: 'id,_raw',
  });
  return (j.hits || []).map((h) => JSON.parse(h.document._raw));
}

// Ayni kategoriden alternatifler — karsilastirma bolumu ve IC LINK icin.
async function alternatifler(raw) {
  try {
    const j = await ts({
      filter_by: `category:=${raw.category} && id:!=${raw.id} && lowestPriceUSD:>0`,
      sort_by: 'techScore:desc', per_page: '5', include_fields: 'id,name,slug,techScore',
    });
    return (j.hits || []).map((h) => h.document);
  } catch (_) { return []; }
}

async function birUrun(raw) {
  const alts = await alternatifler(raw);
  const mevcut = await pb('GET', `/api/collections/analyses/records?perPage=1&filter=${encodeURIComponent(`productId="${raw.id}"`)}`);
  const varOlan = (mevcut.body.items || [])[0];
  if (varOlan && !FORCE) {
    console.log(`  atlandi (kayit var, --force yok): ${raw.name}`);
    return;
  }
  if (varOlan && varOlan.status === 'published' && !process.argv.includes('--force-published')) {
    console.log(`  atlandi (YAYINDA — ezmek icin --force-published): ${raw.name}`);
    return;
  }

  const kayit = {
    productId: raw.id,
    productSlug: raw.slug || slugify(raw.name),
    productName: raw.name,
    productImage: /^https?:\/\//i.test(raw.imageUrl || '') ? raw.imageUrl : '',
    productBrand: raw.brand || '',
    category: raw.category || '',
    techScore: Number(raw.techScore) || 0,
    slug: slugify(raw.slug || raw.name),
    status: 'draft',
    author: 'Qor AI',
    views: 0,
    likes: 0,
  };

  for (const lang of LANGS) {
    // Spec etiketleri dile gore, TEK KAYNAKTAN (admin/js/spec_i18n.js).
    // Almanca yok; spec'ler TR + EN tutuluyor.
    let specs = {};
    try {
      const m = SPEC.localizeProduct(raw, lang === 'tr' ? 'tr' : 'en', {});
      specs = (m && m.keySpecs) || {};
    } catch (_) { specs = {}; }

    const prompt = PROMPT.buildYayinAnaliziPrompt({
      name: raw.name, brand: raw.brand, category: raw.category,
      techScore: raw.techScore, specs,
      alternatives: alts.map((a) => ({ name: a.name, techScore: a.techScore })),
    }, lang);

    const ham = await aiJson('You output only valid JSON. No markdown fences.', prompt);
    const a = PROMPT.normalizeAnaliz(ham);
    if (!a.title || !a.sections.length) throw new Error(`${lang}: bos analiz dondu`);

    kayit[`title_${lang}`] = a.title;
    kayit[`lead_${lang}`] = a.lead;
    kayit[`metaTitle_${lang}`] = a.title;
    kayit[`metaDescription_${lang}`] = a.metaDescription || a.lead.slice(0, 155);
    kayit[`body_${lang}`] = PROMPT.analizHtml(a, lang);
    kayit[`verdict_${lang}`] = a.verdict ? `<p>${a.verdict.replace(/</g, '&lt;')}</p>` : '';
    kayit[`slug_${lang}`] = slugify(`${raw.name}-${lang === 'tr' ? 'analiz' : 'review'}`);
    kayit[`faq_${lang}`] = a.faq;
    console.log(`  ${lang}: ${a.sections.length} bolum · ${a.faq.length} SSS · ${a.strengths.length}+/${a.weaknesses.length}-`);
  }

  const res = varOlan
    ? await pb('PATCH', `/api/collections/analyses/records/${varOlan.id}`, kayit)
    : await pb('POST', '/api/collections/analyses/records', kayit);
  if (res.status >= 400) {
    console.error(`  YAZILAMADI (${res.status}):`, JSON.stringify(res.body).slice(0, 300));
    return;
  }
  console.log(`  ✓ TASLAK yazildi: ${raw.name} → /analiz/${kayit.slug}  (yayin karari admin panelinde)`);
}

(async () => {
  await pbAuth();
  const urunler = await hedefUrunler();
  console.log(`[gen-analysis] ${urunler.length} urun · TASLAK olarak yazilacak (hicbiri yayina alinmaz)`);
  for (const raw of urunler) {
    console.log(`\n${raw.name}`);
    try { await birUrun(raw); } catch (e) { console.error(`  HATA: ${e.message}`); }
  }
})().catch((e) => { console.error('[gen-analysis] fatal:', e.message); process.exit(1); });
