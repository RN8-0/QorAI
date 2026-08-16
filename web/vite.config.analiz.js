// SADECE OLCUM. Giris paketinin icinde NE VAR? Rollup'in kendi modul tablosunu
// doker. website/ agacina DOKUNMAZ (ayri outDir) — `npm run build` disinda
// website/ uretmek SEO head'ini dusurur.
//   npx vite build --config vite.config.analiz.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const rapor = () => ({
  name: 'qor-modul-raporu',
  generateBundle(_o, bundle) {
    const satir = [];
    for (const [ad, c] of Object.entries(bundle)) {
      if (c.type !== 'chunk') continue;
      const mods = Object.entries(c.modules || {})
        .map(([yol, m]) => ({ yol: yol.replace(process.cwd().replace(/\\/g, '/'), '').replace(/\\/g, '/'), b: m.renderedLength }))
        .filter((m) => m.b > 0)
        .sort((a, b) => b.b - a.b);
      satir.push({ chunk: ad, toplam: c.code.length, giris: c.isEntry, mods });
    }
    fs.writeFileSync('modul_raporu.json', JSON.stringify(satir, null, 1));
  },
});

export default defineConfig({
  plugins: [react(), rapor()],
  build: {
    outDir: '../.analiz_build',
    emptyOutDir: true,
    assetsDir: 'spa',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          aitext: ['./src/components/AiText.jsx'],
        },
      },
    },
  },
});
