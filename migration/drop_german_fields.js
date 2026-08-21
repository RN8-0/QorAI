// ═══════════════════════════════════════════════════════════════════════════
//  ALMANCA ALANLARI PocketBase'DEN KALDIR.
//
//  Almanca destegi 2026-08-21'de siteden, uygulamadan, admin panelinden ve
//  SEO'dan kaldirildi. Ama VERI ve SEMA yerinde kalmisti: 10 blog yazisinin
//  hepsinde `title_de`/`lead_de`/`body_de`... doluydu ve admin editoru bu
//  alanlari gordugu surece "DE Deutsch" sekmesi anlamli gorunuyordu.
//
//  Kaldirilan bir dil HER YERDEN kaldirilmali; yarim birakilan alanlar bir
//  sonraki gelistiricinin (ya da ajanin) "demek ki hala destekleniyor"
//  varsayimina yol acar.
//
//  Once DEGERLERI temizler, sonra ALANLARI semadan siler. Iki asama ayri:
//  alan silinince veri de gider ama once bosaltmak, silme adimi yarida
//  kalirsa geride Almanca METIN kalmamasini garantiler.
//
//   node migration/drop_german_fields.js --dry   # sadece rapor
//   node migration/drop_german_fields.js
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');

function loadEnv() {
  const env = { ...process.env };
  const p = path.resolve(__dirname, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i < 0 || line.startsWith('#')) continue;
      const k = line.slice(0, i).trim();
      if (!(k in env)) env[k] = line.slice(i + 1).trim();
    }
  }
  return env;
}

// `_de` ile biten HER alan. Sabit liste yerine desen: ileride eklenmis bir
// Almanca alan varsa o da yakalanir.
const DE_RE = /_de$/;

(async () => {
  const env = loadEnv();
  const B = String(env.POCKETBASE_URL || '').replace(/\/+$/, '');
  const auth = await fetch(`${B}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!auth.ok) { console.error('superuser auth basarisiz:', auth.status); process.exit(1); }
  const { token } = await auth.json();
  const H = { Authorization: token, 'Content-Type': 'application/json' };

  const cols = await (await fetch(`${B}/api/collections?perPage=200`, { headers: H })).json();
  let toplamAlan = 0;
  let toplamKayit = 0;

  for (const col of (cols.items || [])) {
    if (col.type !== 'base') continue;
    const fields = col.fields || col.schema || [];
    const deFields = fields.filter((f) => DE_RE.test(f.name));
    if (!deFields.length) continue;

    console.log(`\n[${col.name}] Almanca alan: ${deFields.map((f) => f.name).join(', ')}`);
    toplamAlan += deFields.length;

    // 1) DEGERLERI temizle
    const recs = await (await fetch(`${B}/api/collections/${col.name}/records?perPage=500`, { headers: H })).json();
    let dolu = 0;
    for (const r of (recs.items || [])) {
      const patch = {};
      for (const f of deFields) {
        const v = r[f.name];
        const bosMu = v == null || v === '' || (Array.isArray(v) && !v.length);
        if (!bosMu) patch[f.name] = (f.type === 'json' ? null : '');
      }
      if (!Object.keys(patch).length) continue;
      dolu += 1;
      if (DRY) continue;
      const res = await fetch(`${B}/api/collections/${col.name}/records/${r.id}`, {
        method: 'PATCH', headers: H, body: JSON.stringify(patch),
      });
      if (!res.ok) console.error(`  kayit ${r.id} temizlenemedi: ${res.status}`);
    }
    console.log(`  ${dolu}/${(recs.items || []).length} kayitta Almanca veri ${DRY ? 'VAR' : 'temizlendi'}`);
    toplamKayit += dolu;

    // 2) ALANLARI semadan sil
    if (DRY) continue;
    const kalan = fields.filter((f) => !DE_RE.test(f.name));
    const res = await fetch(`${B}/api/collections/${col.name}`, {
      method: 'PATCH', headers: H, body: JSON.stringify({ fields: kalan }),
    });
    if (!res.ok) {
      console.error(`  SEMA guncellenemedi: ${res.status} ${(await res.text()).slice(0, 300)}`);
    } else {
      console.log(`  ${deFields.length} alan semadan silindi`);
    }
  }

  console.log(`\n[toplam] ${toplamAlan} Almanca alan · ${toplamKayit} kayitta veri${DRY ? ' (DRY — hicbir sey degismedi)' : ''}`);
})().catch((e) => { console.error('hata:', e.message); process.exit(1); });
