import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The built SPA is written straight into ../website, the directory Coolify
// serves. emptyOutDir is false so the static privacy.html / terms.html and
// /assets brand images are never wiped. SPA chunks live under /spa.
//
// PREACT DENENDI VE GERI ALINDI (2026-08-16). @preact/preset-vite ile gecis
// ISLEVSEL OLARAK SORUNSUZDU (13 rota + 11 akis testi temiz:
// scripts/_preact_regression.mjs) ve pakette buyuk kazanc vardi:
//   vendor 164,5 -> 47,5 KB ham (gzip 53,7 -> 17,7), kritik yol 348 -> 230 KB
// AMA ASIL HEDEF OLAN TBT'yi KOTULESTIRDI. Ayni kosulda, serpistirilmis,
// gzip'li, Yavas 4G + 4x CPU (scripts/_tbt_ab.mjs):
//   ana sayfa TBT: React 750 ms -> Preact 857 ms (11 kosu medyan; +107 ms.
//   Ayni yon uc ayri turda: +196, +261, +155, +107)
//   FCP/LCP: FARK YOK (1648/1668 <-> 1632/1672)
//   /premium gibi kart YOGUN OLMAYAN rotada Preact hafif ILERIDE (386 -> 342)
// Kok neden trace'te: uzun gorevlerin ic dagiliminda DUZEN (layout) 215 -> 528
// ms. Ana sayfa ~69 karti 9 grid'e basiyor; Preact DOM'u parca parca ekledigi
// icin daha cok layout tetikleniyor. content-visibility SUCLU DEGIL (kapatinca
// Preact'te TBT 725 -> 1328, yani kural isini yapiyor).
// Tekrar denenecekse once ana sayfa kart render'i (sanallastirma/batching)
// ele alinmali; yoksa paket kazanci TBT'de geri veriliyor.
export default defineConfig({
  plugins: [react()],
  build: {
    // Manifest, seo.mjs'in her rota icin DOGRU chunk dosya adini bulmasi icin
    // gerekli (adlar hash'li). Ontanimli konum ../website/.vite/manifest.json.
    manifest: true,
    outDir: '../website',
    emptyOutDir: false,
    assetsDir: 'spa',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Keep the framework (react, router) in its own chunk so it caches
        // across deploys and isn't re-downloaded when only app code changes.
        // App pages are split per-route via React.lazy in App.jsx.
        // pocketbase BURADAN CIKARILDI (2026-08-16): SDK 34,2 KB ile vendor'in
        // en buyuk ikinci parcasiydi ve ilk boyamada hicbir ise yaramiyor —
        // oturum localStorage'dan senkron okunuyor (lib/authSeed.js) ve cikisli
        // ziyaretcide SDK hic gerekmiyor. Artik lib/pbLazy.js ile ilk GERCEK
        // API cagrisinda iniyor; burada birakmak onu zorla kritik yolda
        // tutardi (olculdu: dinamik import'a gecirdikten sonra vendor 198,90 KB
        // olarak AYNI kalmisti).
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // AiText KENDI chunk'ina. Kaynagi 1,1 KB ama rollup onu AI analiz
          // agaciyla AYNI paylasilan chunk'a koyuyordu (109 KB) — cunku ayni
          // rotalar hem AiText'i hem AiAnalysis ailesini import ediyor.
          // Sonuc: yalnizca AiText'e ihtiyaci olan /subscriptions gibi sayfalar
          // 109 KB'lik agaci indirip CALISTIRIYORDU. Olculdu: React 2748 ms'de
          // mount oluyor ama sayfanin lead paragrafi 4183 ms'de boyaniyordu.
          aitext: ['./src/components/AiText.jsx'],
        },
      },
    },
  },
});
