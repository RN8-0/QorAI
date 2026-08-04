#!/usr/bin/env node
/**
 * Qor AI — KIRIK İLK GÖRSEL ONARIMI (Epey uzantı hatası)
 * ══════════════════════════════════════════════════════════════════
 * KÖK NEDEN (ölçüldü 2026-08-05): Epey'in `z_` adresleri bir BOYUT katmanı
 * değil, AYRI FORMAT dosyasıdır. Aynı fotoğrafın master'ı `.png` iken `z_`
 * varyantı `.jpg` olabiliyor. Scraper tier ön ekini soyup uzantıyı olduğu
 * gibi bırakınca var olmayan bir adres üretiyordu:
 *     z_huawei-nova-y74-1.jpg → 200   ·   huawei-nova-y74-1.jpg → 404
 *     m_huawei-nova-y74-1.png → 200   ·   huawei-nova-y74-1.png → 200
 * og:image genelde `z_` verdiği için bozulan hep İLK (hero) görsel oluyordu:
 * kartlarda ve ürün sayfasında kırık görsel, küçük resimler sağlam.
 *
 * Scraper tarafı düzeltildi (normalizeEpeyImageUrl). Bu script MEVCUT
 * kayıtları onarır: ilk görseli HEAD ile dener, 404 ise diğer uzantıyı dener,
 * o da olmazsa dizideki ilk ÇALIŞAN görseli başa alır.
 *
 * Kullanım:
 *   node scripts/repair_epey_image_ext.mjs --dry-run --limit=200
 *   node scripts/repair_epey_image_ext.mjs --confirm
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const DRY = !argv.includes('--confirm');
const LIMIT = Number((argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0) || Infinity;
const CONCURRENCY = Number((argv.find(a => a.startsWith('--concurrency=')) || '').split('=')[1] || 0) || 6;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const env = Object.fromEntries(
  fs.readFileSync(path.join(rootDir, 'migration', '.env'), 'utf8').split(/\r?\n/)
    .filter(l => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const PB = String(env.POCKETBASE_URL || '').replace(/\/$/, '');

const FIXED_IDS_FILE = path.join(process.env.USERPROFILE || process.env.HOME || rootDir, 'qorai-image-repair-ids.txt');
const log = (m) => console.log(`[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] ${m}`);

async function pbFetch(pathname, opts = {}) {
  const r = await fetch(`${PB}${pathname}`, opts);
  const text = await r.text();
  let body = text; try { body = JSON.parse(text); } catch { /* düz metin */ }
  return { status: r.status, body };
}

let token = '';
async function auth() {
  const r = await pbFetch('/api/collections/_superusers/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (r.status !== 200) throw new Error(`PB girişi ${r.status}`);
  token = r.body.token;
}

// Epey CDN'i Node'un TLS parmak izini 403'lüyor → curl (repo genelinde aynı yöntem)
function headStatus(url) {
  return new Promise((resolve) => {
    execFile('curl', ['-sS', '-I', '--max-time', '15', '-A', UA, '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-w', '%{http_code}', url], { windowsHide: true }, (err, stdout = '') => {
      const code = Number(String(stdout).trim().slice(-3));
      resolve(Number.isFinite(code) ? code : 0);
    });
  });
}

const swapExt = (u) => /\.png$/i.test(u) ? u.replace(/\.png$/i, '.jpg') : u.replace(/\.jpe?g$/i, '.png');

async function repairOne(p) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  if (!images.length) return null;
  const first = String(images[0]);
  if (!/resim\.epey\.com/i.test(first)) return null;

  const code = await headStatus(first);
  if (code === 200) return null;              // sağlam
  if (code === 0 || code >= 500) return null; // geçici hata — dokunma

  // 1) aynı fotoğrafın diğer uzantısı
  const alt = swapExt(first);
  if (alt !== first && await headStatus(alt) === 200) {
    const next = [alt, ...images.slice(1)];
    return { images: next, imageUrl: alt, how: 'uzanti' };
  }
  // 2) dizideki ilk çalışan görseli başa al
  for (let i = 1; i < images.length; i++) {
    if (await headStatus(images[i]) === 200) {
      const next = [images[i], ...images.filter((_, j) => j !== i && j !== 0)];
      return { images: next, imageUrl: images[i], how: 'sirala' };
    }
  }
  return { images: images.slice(1), imageUrl: images[1] || '', how: 'dusur' };
}

(async () => {
  if (!PB) throw new Error('POCKETBASE_URL yok');
  await auth();
  log(`${DRY ? 'KURU KOŞU' : 'ONARIM'} · paralel=${CONCURRENCY}${LIMIT !== Infinity ? ` · limit=${LIMIT}` : ''}`);

  let cursor = '';
  let seen = 0, checked = 0, fixed = 0, failed = 0;
  const byHow = { uzanti: 0, sirala: 0, dusur: 0 };

  for (;;) {
    const filter = encodeURIComponent(cursor ? `source~"epey" && id > "${cursor}"` : 'source~"epey"');
    const r = await pbFetch(`/api/collections/products/records?perPage=200&sort=id&skipTotal=1&fields=id,slug,images,imageUrl&filter=${filter}`,
      { headers: { Authorization: token } });
    if (r.status !== 200) { log(`PB ${r.status} — durduruldu`); break; }
    const items = r.body.items || [];
    if (!items.length) break;
    cursor = items[items.length - 1].id;

    // Yalnız ilk görseli master .jpg/.png olanları dene; ön ekli (z_) adresler
    // zaten var olduğu bilinen dosyalardır.
    const candidates = items.filter((p) => {
      const f = String((p.images || [])[0] || '').split('/').pop() || '';
      return f && !/^[a-z]_/i.test(f) && /\.(jpe?g|png)$/i.test(f);
    });
    seen += items.length;

    const queue = [...candidates];
    const worker = async () => {
      for (;;) {
        const p = queue.shift();
        if (!p) return;
        if (checked >= LIMIT) return;
        checked++;
        let res = null;
        try { res = await repairOne(p); } catch { failed++; continue; }
        if (!res) continue;
        byHow[res.how] = (byHow[res.how] || 0) + 1;
        fixed++;
        log(`  ${res.how.padEnd(6)} ${p.slug} → ${String(res.imageUrl).split('/').pop() || '(bos)'}`);
        if (DRY) continue;
        const up = await pbFetch(`/api/collections/products/records/${p.id}`, {
          method: 'PATCH',
          headers: { Authorization: token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: res.images, imageUrl: res.imageUrl }),
        });
        if (up.status !== 200) { failed++; log(`    ! PB yazma ${up.status}`); }
        // Onarılan id'leri sakla: PB'ye yazmak yetmiyor, site Typesense'ten
        // okuyor ve typesense_sync hook'u kırık. Bitince:
        //   TS_FAST_IDS=$(cat ...) node scripts/ts_fast_upsert_products.js
        else { try { fs.appendFileSync(FIXED_IDS_FILE, p.id + '\n'); } catch { /* önemsiz */ } }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (checked >= LIMIT) break;
    if (seen % 2000 < 200) log(`… ${seen} ürün tarandı · ${checked} kontrol · ${fixed} onarıldı`);
  }

  log('───────────────────────────────');
  log(`taranan=${seen} kontrol=${checked} onarilan=${fixed} hata=${failed}`);
  log(`  uzanti takasi=${byHow.uzanti} siralama=${byHow.sirala} dusurulen=${byHow.dusur}`);
  if (DRY) log('KURU KOŞU — hiçbir şey yazılmadı. Uygulamak için --confirm');
  else log('Typesense: node scripts/ts_fast_upsert_products.js ile yansıt (ya da gece backfill)');
})().catch(e => { log(`HATA: ${e.message}`); process.exit(1); });
