// ═══════════════════════════════════════════════════════════════════════════
//  YAYINLANMIS ANALIZLERDEKI CEVRILMIS USD FIYATLARINI ONAR
//
//  Kosum:  node scripts/fix_usd_prices.mjs          (deneme, yazmaz)
//          node scripts/fix_usd_prices.mjs --yaz    (PB'ye yazar)
//
//  NEDEN: rapor metinlerinde "yaklasik 1973 USD'lik fiyatiyla amiral gemisi
//  segmentinde" gibi cumleler var. O sayi katalogun `lowestPriceUSD` alanindan
//  geliyordu: yerel fiyatin ELLE guncellenen bir kur tablosundan (FX_VERSION
//  2026.05, 1 USD = 34,97 TL) gecirilmis hali. 68.999 TL x 0,0286 = 1973,37.
//
//  KURAL (kullanici): kur ile islem YAPILMAZ. Her ulkede vergi ayni degil;
//  bir Turkiye fiyatini kurla bolup "USD fiyati" demek iki pazarin
//  fiyatlandirmasini ayni saymaktir ve cikan sayi hicbir yerde gecerli degil.
//  Uretim tarafi duzeltildi (qor_ai_prompts.js: modele artik yerel fiyat
//  pazariyla birlikte gidiyor). Bu betik ZATEN YAZILMIS metinleri onarir.
//
//  MALIYET: kayit basina TEK cagri — etkilenen cumleler toplu gonderilir.
//  Analizi bastan uretmek gerekmez (o kayit basina ~8 cagri olurdu).
//
//  UYDURMA YOK: dogru fiyat katalogdan (`lowestPrice` + `lowestPriceCurrency`)
//  okunur. Katalogda fiyat yoksa cumleden fiyat iddiasi CIKARILIR, tahmin
//  edilmez.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';

const YAZ = process.argv.includes('--yaz');
const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';

const env = Object.fromEntries(fs.readFileSync(new URL('../migration/.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => l && l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

// Bir sayi + USD/dolar iceren TAM cumle.
const USD_RE = /[^.!?]*?\b\d[\d.,]*\s*(USD|ABD\s*Dolar[ıi]?|dolar)\b[^.!?]*[.!?]/gi;

const T = (await (await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
})).json()).token;
const H = { Authorization: T };

async function gemini(prompt, maxOut = 4096) {
  const B = [30000, 70000, 130000];
  for (let i = 0; i < 4; i += 1) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 120000);
    let r;
    try {
      r = await fetch(`${PB_URL}/api/ai/gemini`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: c.signal,
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1, maxOutputTokens: maxOut,
            responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });
    } catch (e) { clearTimeout(t); if (i < 3) { await new Promise((x) => setTimeout(x, B[i])); continue; } return null; }
    clearTimeout(t);
    const j = await r.json().catch(() => null);
    if (!r.ok) { if (i < 3) { console.log(`     (HTTP ${r.status} — bekleniyor)`); await new Promise((x) => setTimeout(x, B[i])); continue; } return null; }
    const txt = j?.candidates?.[0]?.content?.parts?.map((x) => x.text).filter(Boolean).join('') || '';
    try { return JSON.parse(txt); } catch (_) { const m = txt.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (__) { /* */ } } }
    if (i < 3) { await new Promise((x) => setTimeout(x, B[i])); continue; }
    return null;
  }
  return null;
}

/** Raporun icindeki TUM dizeleri gezer; `fn` doner ise degistirir. */
function dizeleriDegistir(dugum, fn, derinlik = 0) {
  if (!dugum || derinlik > 8) return dugum;
  if (typeof dugum === 'string') { const y = fn(dugum); return y == null ? dugum : y; }
  if (Array.isArray(dugum)) return dugum.map((x) => dizeleriDegistir(x, fn, derinlik + 1));
  if (typeof dugum !== 'object') return dugum;
  const out = {};
  for (const k of Object.keys(dugum)) {
    out[k] = k === 'paragraphSentiment' ? dugum[k] : dizeleriDegistir(dugum[k], fn, derinlik + 1);
  }
  return out;
}

const liste = await (await fetch(`${PB_URL}/api/collections/analyses/records?perPage=200`, { headers: H })).json();
let cagri = 0; let yazilan = 0; const kalan = [];

for (const rec of liste.items) {
  // 1) Etkilenen cumleleri topla
  const cumleler = new Set();
  for (const lang of ['tr', 'en']) {
    const rep = rec[`report_${lang}`]; if (!rep) continue;
    dizeleriDegistir(rep, (s) => { const m = s.match(USD_RE); if (m) m.forEach((c) => cumleler.add(c.trim())); return null; });
  }
  if (!cumleler.size) continue;

  // 2) DOGRU fiyati KATALOGDAN oku — tahmin yok
  let fiyat = '';
  if (rec.productId) {
    try {
      const pr = await (await fetch(`${PB_URL}/api/collections/products/records/${rec.productId}`, { headers: H })).json();
      if (Number(pr.lowestPrice) > 0) {
        fiyat = `${Number(pr.lowestPrice).toLocaleString('tr-TR')} ${pr.lowestPriceCurrency || ''}`.trim();
      }
    } catch (_) { /* fiyat bos kalir */ }
  }

  const dizi = [...cumleler];
  console.log(`\n### ${rec.slug} — ${dizi.length} cümle · katalog fiyatı: ${fiyat || '(YOK)'}`);

  const out = await gemini(`Aşağıdaki cümleler bir ürün analizinden alındı ve HATALI bir fiyat içeriyor.

HATANIN KAYNAĞI: yerel fiyat, bayat bir kur tablosundan geçirilip "USD fiyatı"
gibi yazılmış. Ülkeler arasında vergi ve fiyatlandırma farklı olduğu için
çevrilmiş sayı hiçbir pazarda geçerli değil.

ÜRÜN: ${rec.productName || rec.slug}
DOĞRU FİYAT (katalog, kendi para biriminde): ${fiyat || 'BİLİNMİYOR'}

GÖREV: Her cümleyi yeniden yaz.
${fiyat
    ? `- USD tutarını "${fiyat}" ile değiştir ve cümlenin geri kalanını buna göre düzelt.
- Bu bir TÜRKİYE fiyatı; gerekiyorsa "Türkiye'de" diye belirt.
- Çevrilmiş USD/dolar tutarı YAZMA, parantez içinde bile.`
    : `- Katalogda fiyat YOK. Fiyat iddiasını cümleden TAMAMEN ÇIKAR; cümlenin
  kalan anlamı korunsun. Sayı UYDURMA.`}
- Cümleden çıkan HÜKÜM de düzelsin: yanlış sayıya dayanan "amiral gemisi
  segmentinde", "yüksek maliyet" gibi yargılar doğru fiyata göre yeniden
  değerlendirilmeli.
- Cümlenin dili DEĞİŞMESİN (Türkçe cümle Türkçe kalsın, İngilizce İngilizce).
- Uzunluk benzer olsun; başka hiçbir şeyi değiştirme.

SADECE geçerli JSON döndür — dizinin sırası girdiyle AYNI olacak:
{"cumleler":[{"eski":"<girdideki cümle aynen>","yeni":"<düzeltilmiş cümle>"}]}

CÜMLELER:
${dizi.map((c, i) => `${i + 1}. ${c}`).join('\n')}`, 4096);
  cagri += 1;

  const ciftler = out && Array.isArray(out.cumleler) ? out.cumleler.filter((x) => x && x.eski && x.yeni) : [];
  if (!ciftler.length) { console.log('   ! düzeltilemedi'); kalan.push(rec.slug); continue; }

  const harita = new Map(ciftler.map((x) => [String(x.eski).trim(), String(x.yeni).trim()]));
  const yama = {};
  for (const lang of ['tr', 'en']) {
    const rep = rec[`report_${lang}`]; if (!rep) continue;
    let n = 0;
    const yeni = dizeleriDegistir(rep, (s) => {
      let d = s; let degisti = false;
      for (const [eski, yeniC] of harita) {
        if (d.includes(eski)) { d = d.split(eski).join(yeniC); degisti = true; n += 1; }
      }
      return degisti ? d : null;
    });
    if (n) { yama[`report_${lang}`] = yeni; console.log(`   ${lang}: ${n} yerde değiştirildi`); }
  }
  ciftler.slice(0, 3).forEach((x) => console.log(`     ESKİ: ${x.eski.slice(0, 90)}\n     YENİ: ${x.yeni.slice(0, 90)}`));

  // 3) DOGRULAMA: yamada hala cevrilmis USD var mi?
  const kalanUsd = Object.values(yama).map((v) => JSON.stringify(v).match(USD_RE) || []).flat();
  if (kalanUsd.length) { console.log(`   ! hâlâ ${kalanUsd.length} USD cümlesi var — yazılmadı`); kalan.push(rec.slug); continue; }

  if (YAZ && Object.keys(yama).length) {
    const w = await fetch(`${PB_URL}/api/collections/analyses/records/${rec.id}`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(yama),
    });
    console.log(`   yazıldı: ${w.status}`);
    yazilan += 1;
  }
  await new Promise((r) => setTimeout(r, 2500));
}

console.log(`\n${cagri} AI çağrısı · ${yazilan} kayıt${YAZ ? ' güncellendi' : ' güncellenecek (DENEME)'}`);
if (kalan.length) { console.log('DÜZELTİLEMEYEN:', kalan.join(', ')); process.exitCode = 1; }
else console.log('KALAN YOK.');
