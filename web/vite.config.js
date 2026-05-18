import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The built SPA is written straight into ../website, the directory Coolify
// serves. emptyOutDir is false so the static privacy.html / terms.html and
// /assets brand images are never wiped. SPA chunks live under /spa.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../website',
    emptyOutDir: false,
    assetsDir: 'spa',
    chunkSizeWarningLimit: 1200,
  },
});
