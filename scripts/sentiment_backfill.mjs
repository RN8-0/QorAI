// ═══════════════════════════════════════════════════════════════════════════
//  ESKI ANALIZLERE DUYGU ETIKETI — TEK SEFERLIK GOC
//
//  Kosum:  node scripts/sentiment_backfill.mjs            (deneme, yazmaz)
//          node scripts/sentiment_backfill.mjs --yaz      (PB'ye yazar)
//          node scripts/sentiment_backfill.mjs --yaz --slug=apple-iphone-17
//
//  NEDEN GEREKLI: on yuz artik duygu TAHMIN ETMIYOR (bkz. web/src/lib/
//  sentiment.jsx). Yeni analizlerde etiketi AI raporla birlikte yaziyor;
//  YAYINDAKI eski kayitlarda o alan yok. Etiketsiz kayit tamamen notr
//  gorunurdu — yani yesil/kirmizi hukumler kaybolurdu. Bu betik onlari bir
//  kez etiketleyip kayda gomer.
//
//  ON YUZDE KELIME YEDEGI YOK ve olmayacak: yanlis renk, renksizlikten kotu.
//
//  AYNI SOZLESME: siniflandirici scripts/sentiment_lib.mjs — 30 cumlelik
//  fixture testinden gecen prompt'un ta kendisi (scripts/sentiment_test.mjs).
//  Uretim ve goc ayni kurallari kullanir, ayrisamazlar.
// ═══════════════════════════════════════════════════════════════════════════
import { etiketle, PB_URL } from './sentiment_lib.mjs';
import { paragraphKey } from '../web/src/lib/sentiment.js';
// AYNI BOLUCU: on yuz de bunu kullanir (components/AiCharts.jsx).
// Metni farkli bolersek etiket anahtarlari hic tutmaz — olculdu 2026-09-02.
import { proseBlocks } from '../web/src/lib/prose.js';

const YAZ = process.argv.includes('--yaz');
const SLUG = (process.argv.find((a) => a.startsWith('--slug=')) || '').split('=')[1] || '';

/* Rapordaki NESIR alanlarini topla. Sadece cok cumleli metinler: tek satirlik
   etiketler (spec adi, magaza adi) duygu tasimaz ve etiketlenirse harita
   gereksiz sisyor. */
const NESIR_ALANLARI = [
  'analysis', 'summary', 'matchComment', 'bestFor', 'notFor', 'overallVerdict',
  'detail', 'comment', 'note', 'recommendation', 'verdict', 'headline',
];

function paragraflariTopla(dugum, out = [], derinlik = 0) {
  if (!dugum || derinlik > 6) return out;
  if (Array.isArray(dugum)) { dugum.forEach((x) => paragraflariTopla(x, out, derinlik + 1)); return out; }
  if (typeof dugum !== 'object') return out;
  for (const [k, v] of Object.entries(dugum)) {
    if (k === 'paragraphSentiment') continue;
    if (typeof v === 'string') {
      if (!NESIR_ALANLARI.includes(k)) continue;
      // EKRANDAKI BOLME ILE BIREBIR AYNI. Kendi basina satir sonlarina gore
      // bolmek yetmiyordu: on yuz uzun tek satirlik metni UC CUMLELIK
      // paragraflara yeniden paketliyor, dolayisiyla anahtarlar ayrisiyordu.
      for (const b of proseBlocks(v)) {
        if (b.kind === 'head') continue;          // baslik hukum tasimaz
        const par = String(b.text || '').trim();
        if (par.length < 40) continue;            // cok kisa: hukum yok
        out.push(par);
      }
    } else paragraflariTopla(v, out, derinlik + 1);
  }
  return out;
}

/* YAZMA ADMIN YETKISI ISTER (analyses.updateRule kapali; guvenlik denetiminde
   bilerek kapatildi). Kimlik migration/.env icinden okunur — proje genelindeki
   betiklerin kullandigi ayni kalip (bkz. scripts/build_seed_from_harvest.js). */
let TOKEN = '';
async function girisYap() {
  const { readFileSync } = await import('fs');
  const env = Object.fromEntries(readFileSync(new URL('../migration/.env', import.meta.url), 'utf8')
    .split(/[\r\n]+/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`PB girisi basarisiz (${r.status}) — migration/.env kontrol et`);
  TOKEN = (await r.json()).token;
}

async function pb(yol, secenek = {}) {
  const h = { ...(secenek.headers || {}) };
  if (TOKEN) h.Authorization = TOKEN;
  const r = await fetch(`${PB_URL}${yol}`, { ...secenek, headers: h });
  if (!r.ok) throw new Error(`PB ${r.status} ${yol}`);
  return r.json();
}

const main = async () => {
  if (YAZ) await girisYap();
  const filtre = SLUG ? `slug="${SLUG}"` : 'status="published"';
  const liste = await pb(`/api/collections/analyses/records?perPage=200&filter=${encodeURIComponent(filtre)}`);
  const kayitlar = liste.items || [];
  console.log(`[goc] ${kayitlar.length} kayit${YAZ ? '' : '  (DENEME — yazilmayacak)'}\n`);

  let toplamPar = 0; let yazilan = 0;
  for (const a of kayitlar) {
    const yama = {};
    for (const lang of ['tr', 'en']) {
      const rapor = a[`report_${lang}`];
      if (!rapor || typeof rapor !== 'object') continue;
      if (!process.argv.includes('--zorla') && rapor.paragraphSentiment && Object.keys(rapor.paragraphSentiment).length) {
        console.log(`  · ${a.slug} [${lang}] zaten etiketli, atlandi`);
        continue;
      }
      const paragraflar = [...new Set(paragraflariTopla(rapor))];
      if (!paragraflar.length) continue;
      toplamPar += paragraflar.length;
      const etiketler = await etiketle(paragraflar);
      const harita = {};
      paragraflar.forEach((p, i) => {
        // NOTR SAKLANMAZ: varsayilan zaten notr, haritayi sismenin anlami yok.
        if (etiketler[i] === 'positive' || etiketler[i] === 'negative') {
          harita[paragraphKey(p)] = etiketler[i];
        }
      });
      const p = etiketler.filter((x) => x === 'positive').length;
      const n = etiketler.filter((x) => x === 'negative').length;
      console.log(`  · ${a.slug} [${lang}] ${paragraflar.length} paragraf → +${p} / −${n} / ${paragraflar.length - p - n} nötr`);
      yama[`report_${lang}`] = { ...rapor, paragraphSentiment: harita };
    }
    // KAYITLAR ARASI NEFES. Bir kayit ~5 AI cagrisi; arka arkaya gidince
    // dakikalik kota penceresi doluyor ve goc ortada oluyordu.
    await new Promise((r) => setTimeout(r, 8000));
    if (YAZ && Object.keys(yama).length) {
      await pb(`/api/collections/analyses/records/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(yama),
      });
      yazilan += 1;
    }
  }
  console.log(`\n[goc] ${toplamPar} paragraf siniflandirildi, ${yazilan} kayit yazildi.`);
  if (!YAZ) console.log('[goc] Yazmak icin: node scripts/sentiment_backfill.mjs --yaz');
};

main().catch((e) => { console.error('[goc] hata:', e.message); process.exit(1); });
