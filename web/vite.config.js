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
        // Keep the framework (react, router, pocketbase) in its own chunk so
        // it caches across deploys and isn't re-downloaded when only app code
        // changes. App pages are split per-route via React.lazy in App.jsx.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'pocketbase'],
        },
      },
    },
  },
});
