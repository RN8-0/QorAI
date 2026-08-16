import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The built SPA is written straight into ../website, the directory Coolify
// serves. emptyOutDir is false so the static privacy.html / terms.html and
// /assets brand images are never wiped. SPA chunks live under /spa.
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
