// ═══════════════════════════════════════════════════════════════════════════
//  `analyses` koleksiyonu — yayinlanabilir URUN ANALIZLERI.
//
//  NE ISE YARAR: sitenin tek OZGUN varligi AI analizi ve Tech Score. Spec
//  tablosu ve fiyat Epey'den geliyor ve onlarca Turk sitesinde birebir ayni
//  duruyor; Google'in spec tablosu icin bizi tercih etmesi icin sebep yok.
//  Ama baska hicbir yerde bulunmayan bir HUKUM icin sebep var. Bugune kadar
//  bu analizler `saved_analyses` icinde KULLANICIYA OZEL ve gizli uretiliyordu,
//  yani sitenin en degerli icerigi dizine hic girmiyordu.
//
//  KURAL — bu koleksiyon URUN BASINA OTOMATIK DOLDURULMAZ. 107k urune AI metni
//  basmak, spec sayfalarindaki olcekli-icerik problemini bu sefer AI metniyle
//  yeniden kurar (Google'in spam politikasi bunu adiyla sayar). Kayitlar admin
//  panelinden TEK TEK, insan onayiyla yayina alinir. Fark hacimde degil,
//  editoryal kapida.
//
//  Kurallar `articles` ile ayni desende:
//    listRule = yalniz yayinda olanlar · viewRule = herkese acik
//    create/update/delete = null (yalniz superuser / admin paneli)
//
//  Diller: TR + EN. Almanca YOK (specs zaten TR+EN tutuluyor).
//
//  Idempotent: koleksiyon varsa EKSIK ALANLARI ekler, var olani ezmez.
//  KOSTUR:  node migration/create_analyses_collection.js
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const env = { ...process.env };
  const p = path.resolve(__dirname, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      if (!(k in env)) env[k] = line.slice(i + 1).trim();
    }
  }
  return env;
}

const ALANLAR = [
  // ── kimlik ──
  { name: 'slug', type: 'text', required: true },
  { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['draft', 'published'] },
  { name: 'publishedAt', type: 'text' },
  { name: 'author', type: 'text' },
  { name: 'views', type: 'number' },
  { name: 'likes', type: 'number' },

  // ── analiz EDILEN urun ──
  // Urun kaydina `productId` ile baglaniyor ama ad/gorsel/slug KOPYALANIYOR:
  // analiz yayinlandigi ANDAKI urunu anlatir; katalog kaydi sonradan degisirse
  // (yeniden adlandirma, gorsel degisimi) yayinlanmis metin yalan olmamali.
  { name: 'productId', type: 'text' },
  { name: 'productSlug', type: 'text' },
  { name: 'productName', type: 'text' },
  { name: 'productImage', type: 'text' },
  { name: 'productBrand', type: 'text' },
  { name: 'category', type: 'text' },
  { name: 'techScore', type: 'number' },

  // ── metin (TR + EN) ──
  { name: 'title_tr', type: 'text' },
  { name: 'title_en', type: 'text' },
  { name: 'lead_tr', type: 'text' },
  { name: 'lead_en', type: 'text' },
  { name: 'body_tr', type: 'editor' },
  { name: 'body_en', type: 'editor' },
  { name: 'verdict_tr', type: 'editor' },
  { name: 'verdict_en', type: 'editor' },
  { name: 'slug_tr', type: 'text' },
  { name: 'slug_en', type: 'text' },
  { name: 'metaTitle_tr', type: 'text' },
  { name: 'metaTitle_en', type: 'text' },
  { name: 'metaDescription_tr', type: 'text' },
  { name: 'metaDescription_en', type: 'text' },

  // ── yapilandirilmis cikti ──
  // `report`: sitenin AiReportView bilesenine giden HAM rapor JSON'u. Admin
  //   paneli bunu URETIR, site bunu CIZER — iki taraf ayni veriyi kullanir,
  //   ikinci bir render kopyasi yazilmaz.
  // `quiz` : analizi ureten quiz sorulari + secilen cevaplar (kullaniciya
  //   "bu analiz su varsayimlarla yapildi" diyebilmek icin).
  // `faq_*`: [{q,a}] — FAQPage JSON-LD'sini besler.
  { name: 'report', type: 'json' },
  { name: 'quiz', type: 'json' },
  { name: 'faq_tr', type: 'json' },
  { name: 'faq_en', type: 'json' },
];

(async () => {
  const env = loadEnv();
  const B = String(env.POCKETBASE_URL || '').replace(/\/+$/, '');
  if (!B) { console.error('POCKETBASE_URL yok'); process.exit(1); }

  const auth = await fetch(`${B}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!auth.ok) { console.error('superuser auth basarisiz:', auth.status); process.exit(1); }
  const { token } = await auth.json();
  const H = { Authorization: token, 'Content-Type': 'application/json' };

  const mevcutRes = await fetch(`${B}/api/collections/analyses`, { headers: H });

  if (mevcutRes.status === 404) {
    const body = {
      name: 'analyses',
      type: 'base',
      listRule: 'status = "published"',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: ALANLAR.map((f) => ({ ...f })),
    };
    const r = await fetch(`${B}/api/collections`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    if (!r.ok) { console.error('olusturulamadi:', r.status, (await r.text()).slice(0, 500)); process.exit(1); }
    console.log(`[analyses] koleksiyon OLUSTURULDU · ${ALANLAR.length} alan`);
    return;
  }

  if (!mevcutRes.ok) { console.error('okunamadi:', mevcutRes.status); process.exit(1); }
  const mevcut = await mevcutRes.json();
  const varOlan = new Set((mevcut.fields || mevcut.schema || []).map((f) => f.name));
  const eksik = ALANLAR.filter((f) => !varOlan.has(f.name));
  if (!eksik.length) {
    console.log(`[analyses] koleksiyon zaten guncel · ${varOlan.size} alan, eklenecek yok`);
    return;
  }
  const yeniAlanlar = [...(mevcut.fields || mevcut.schema || []), ...eksik.map((f) => ({ ...f }))];
  const r = await fetch(`${B}/api/collections/analyses`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ fields: yeniAlanlar }),
  });
  if (!r.ok) { console.error('guncellenemedi:', r.status, (await r.text()).slice(0, 500)); process.exit(1); }
  console.log(`[analyses] ${eksik.length} eksik alan eklendi: ${eksik.map((f) => f.name).join(', ')}`);
})().catch((e) => { console.error('[analyses] hata:', e.message); process.exit(1); });
