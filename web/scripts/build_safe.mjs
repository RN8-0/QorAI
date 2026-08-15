// Tek komutluk, GERI ALINABILIR build.
//
// SORUN: `npm run build` zinciri su siradaydi
//   prebuild (website/ altindaki 23 bin sayfayi SILER) -> vite -> postbuild ->
//   seo (hepsini yeniden uretir) -> seo-audit
// Yani silme ile yeniden uretme ARASINDA duden her hata calisma agacini
// BOSALTILMIS halde birakiyor. 2026-08-15'te bu UC kez yasandi; sonuncusunda
// rollup Windows'ta `UNKNOWN: open website\index.html` verdi (dosyayi bir an
// icin virus tarayici/indeksleyici kilitliyor) ve geriye product/ 6375 -> 1077,
// compare/ 1289 -> 0 kalmis bir agac dondu. Boyle bir agac commit'lenip deploy
// edilse sitenin TUM SEO sayfalari silinirdi.
//
// prebuild'deki "katalog erisilebilir mi" kapisi yalnizca Typesense'in dustugu
// durumu tutuyor — vite/rollup'in kendi hatasini tutamaz. Bu dosya kalan butun
// durumlari kapatir:
//   1) website/ git'te izleniyor; silme baslamadan ONCE agacin temiz oldugu
//      dogrulanir (kirliyse geri alma birinin isini silebilir -> hic baslama).
//   2) Herhangi bir adim duserse `git restore` + `git clean` ile agac HEAD'e
//      dondurulur. Yani basarisiz build'in kalici bir izi olmaz.
//   3) vite adimi Windows'a ozgu gecici dosya kilitlerinde BIR KEZ yeniden
//      denenir (seo.mjs zaten kendi yazmalarinda ayni seyi yapiyor).

import { execSync } from 'child_process';

const ADIMLAR = [
  ['i18n denetimi', 'node scripts/i18n_audit.mjs'],
  ['prebuild', 'node scripts/prebuild.mjs'],
  ['vite', 'vite build'],
  ['postbuild', 'node scripts/postbuild.mjs'],
  ['seo', 'node scripts/seo.mjs'],
  ['seo denetimi', 'node scripts/seo-audit.mjs'],
];
// Bu adimdan itibaren website/ yarim: hata olursa geri alma SART.
const YIKICI_ADIM = 'prebuild';
const GECICI_KILIT = /UNKNOWN|EBUSY|EPERM|EACCES|ENOTEMPTY/;

const kos = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
const git = (cmd) => execSync(`git ${cmd}`, { stdio: 'inherit', cwd: '..' });

function agacTemizMi() {
  const out = execSync('git status --porcelain website/', { cwd: '..', encoding: 'utf8' });
  return out.trim() === '';
}

if (!agacTemizMi()) {
  console.error('[build] website/ altinda commit\'lenmemis degisiklik var.');
  console.error('[build] Bu build agaci silip yeniden uretecek ve hata halinde HEAD\'e dondurecek,');
  console.error('[build] yani o degisiklikler kaybolur. Once commit\'leyin ya da geri alin.');
  process.exit(1);
}

let yikimBasladi = false;
try {
  for (const [ad, cmd] of ADIMLAR) {
    console.log(`\n[build] ${ad} ...`);
    if (ad === YIKICI_ADIM) yikimBasladi = true;
    try {
      kos(cmd);
    } catch (err) {
      // Windows'ta rollup/vite yazarken dosya bir an kilitlenebiliyor. Tek
      // seferlik, kisa bir bekleyisle tekrar denemek bunu gecici olmaktan
      // cikariyor; kalici hata ikinci denemede de ayni sekilde duser.
      const metin = String(err?.stderr || err?.message || err);
      if (ad !== 'vite' || !GECICI_KILIT.test(metin)) throw err;
      console.warn('[build] vite gecici bir dosya kilidine takildi, 4 sn sonra TEK KEZ yeniden deneniyor...');
      execSync('node -e "setTimeout(()=>{},4000)"');
      kos(cmd);
    }
  }
  console.log('\n[build] tamam.');
} catch (err) {
  console.error(`\n[build] BASARISIZ: ${err?.message || err}`);
  if (yikimBasladi) {
    console.error('[build] website/ yarim kaldi — HEAD\'e geri aliniyor (bu birkac dakika surebilir)...');
    try {
      git('restore website/');
      git('clean -fdq website/');
      console.error('[build] website/ geri alindi; calisma agaci build oncesi haliyle ayni.');
    } catch (geri) {
      console.error(`[build] GERI ALMA DA DUSTU: ${geri?.message || geri}`);
      console.error('[build] ELLE: git restore website/ && git clean -fdq website/');
    }
  }
  process.exit(1);
}
