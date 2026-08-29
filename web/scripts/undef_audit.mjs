/* EKSIK IMPORT DENETIMI — sifir bagimlilik.
   2026-08-29: ProductDetail.jsx `getProduct(baseId)` cagiriyordu ama o adi HIC
   import etmemisti. Vite/rollup bunu YAKALAMAZ: bagsiz bir tanimlayici derleme
   zamaninda global sayilir, hata ancak tarayicida ReferenceError olarak cikar.
   Somut sonuc: karsilastirma havuzu dolu olan HER ziyaretci icin butun urun
   sayfalari BEYAZ ekrandi — etkinin icinde atilan hata React kokunu soker.
   Projede ESLint yok; yeni bagimlilik eklemeden ayni hata sinifini kapatmak
   icin bu denetim yazildi.

   YONTEM (bilerek dar tutuldu, yanlis alarm uretmemesi icin):
   web/src altindaki modullerin adlandirilmis export'lari toplanir; her dosyada
   `AD(` bicimindeki cagrilar taranir. Bir ad BASKA bir modulun export'uysa ve
   dosyada ne import edilmis ne de yerel olarak tanimlanmissa hata verilir.
   Yani genel bir no-undef degil: yalnizca "bu proje bu ismi bir yerde export
   ediyor ama burada baglanmamis" durumunu yakalar. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function dosyalar(dir) {
  const out = [];
  for (const ad of readdirSync(dir)) {
    const yol = join(dir, ad);
    if (statSync(yol).isDirectory()) out.push(...dosyalar(yol));
    else if (/\.(jsx?|mjs)$/.test(ad)) out.push(yol);
  }
  return out;
}

/* Yorumlari ve dize iceriklerini dusur: yorumda gecen bir ad (bu dosyalarda
   YOGUN olarak var) yanlis alarm uretmesin.
   SATIR SATIR calisir. Once tek parca metin uzerinde denendi ve SESSIZCE
   yanlis calisti: dize kalibi satir sonunu asip iki ayri `import` satirini tek
   eslesmeye baglayinca aradaki `import X from` yok oluyor, o dosyanin butun
   import'lari kayboluyor ve denetim 96 SAHTE hata uretiyordu. Satir bazinda
   bir dizenin satir sonunu asmasi mumkun degil. */
function temizle(s) {
  // CRLF ONCE dusuruluyor. Kalirsa satir sonundaki `\r` yuzunden `//` yorum
  // kalibi HIC eslesmez: JS'te `.` satir sonlandiricilari (`\r` dahil) atlar,
  // yani `.*$` `\r`'nin onunde takilip basarisiz olur. Somut sonuc: CRLF
  // dosyalarda yorumlar temizlenmeden kaliyor ve yorumda gecen her `ad()`
  // sahte hata uretiyordu (categoryFilters.js, Go.jsx bu yuzden isaretlendi).
  const duz = s.replace(/\r\n?/g, '\n');
  // Blok yorumlar SATIR SAYISI KORUNARAK dusuruluyor. Tek bosluga cevirmek
  // sonraki her hatanin satir numarasini kaydiriyordu (rapor edilen satirda
  // aranan cagri hic yoktu, teshis edilemez hale geliyordu).
  const govde = duz.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(1) + '\n'.repeat((m.match(/\n/g) || []).length));
  return govde.split('\n').map((satir) => satir
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/(^|[^:])\/\/[^\n]*$/, '$1 ')).join('\n');
}

const hepsi = dosyalar(SRC);

// 1) Projenin adlandirilmis export'lari: ad -> onu export eden dosyalar
const exportlar = new Map();
for (const f of hepsi) {
  const s = temizle(readFileSync(f, 'utf8'));
  for (const re of [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  ]) {
    for (const m of s.matchAll(re)) {
      if (!exportlar.has(m[1])) exportlar.set(m[1], []);
      exportlar.get(m[1]).push(f);
    }
  }
}

const ANAHTAR = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function',
  'await', 'new', 'delete', 'void', 'in', 'of', 'do', 'else', 'yield', 'super', 'this', 'import']);

let hata = 0;
for (const f of hepsi) {
  const ham = readFileSync(f, 'utf8');
  const s = temizle(ham);

  // Bu dosyaya bagli adlar: import edilenler + yerel tanimlar.
  const bagli = new Set();
  for (const m of s.matchAll(/import\s+([\s\S]*?)\s+from\s*'[^']*'/g)) {
    for (const p of m[1].split(/[{},]/)) {
      const ad = p.trim().split(/\s+as\s+/).pop().replace(/^\*\s*/, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(ad)) bagli.add(ad);
    }
  }
  for (const re of [
    /(?:^|\s)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=;]/g,
    /class\s+([A-Za-z_$][\w$]*)/g,
    /(?:const|let|var)\s*\{([^}]*)\}\s*=/g,   // yikimlama
    /\(([^()]*)\)\s*=>/g,                      // ok fonksiyon parametreleri
    /function\s*\w*\s*\(([^()]*)\)/g,          // klasik fonksiyon parametreleri
  ]) {
    for (const m of s.matchAll(re)) {
      for (const p of m[1].split(',')) {
        const ad = p.trim().split(/[:=\s]/)[0].replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(ad)) bagli.add(ad);
      }
    }
  }

  // `AD(` bicimindeki cagrilar — nokta erisimi (`x.AD(`) haric.
  for (const m of s.matchAll(/(^|[^\w$.?])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const ad = m[2];
    if (ANAHTAR.has(ad) || bagli.has(ad) || !exportlar.has(ad)) continue;
    if (exportlar.get(ad).includes(f)) continue; // kendi dosyasindan
    // Satir numarasi TEMIZLENMIS metinden sayiliyor; `temizle` satir sayisini
    // korudugu icin kaynak dosyayla birebir ortusur.
    const satir = s.slice(0, m.index).split('\n').length;
    console.error(`[undef] ${f.replace(SRC, 'src')}:${satir}  ${ad}() cagriliyor ama import edilmemis`
      + ` (export eden: ${exportlar.get(ad).map((x) => x.replace(SRC, 'src')).join(', ')})`);
    hata += 1;
  }
}

if (hata) {
  console.error(`\n[undef] ${hata} baglanmamis cagri — build DURDURULDU.`);
  process.exit(1);
}
console.log(`[undef] temiz — ${hepsi.length} dosyada baglanmamis modul cagrisi yok`);
