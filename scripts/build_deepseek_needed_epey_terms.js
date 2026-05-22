#!/usr/bin/env node
/**
 * Build the smallest practical DeepSeek set: only terms that appear to need
 * translation from Turkish/source mixed text.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'epey_translation_terms');
const OUT_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'epey_translation_terms_deepseek_needed');
const CHUNK_SIZE = Number((process.argv.find(a => a.startsWith('--chunk=')) || '').split('=')[1] || 300);

const NEEDS_TR_RE = /[ığşçöüİĞŞÇÖÜ]|\b(var|yok|evet|hayir|hayır|adet|akilli|akıllı|oyuncu|kablolu|kablosuz|sarj|şarj|kulaklik|kulaklık|telefon|saat|monitor|monitör|kamera|yazici|yazıcı|hoparlor|hoparlör|klavye|mouse|fare|supurge|süpürge|televizyon|ekran|cozunurluk|çözünürlük|cekirdek|çekirdek|frekans|destek|destegi|desteği|hizli|hızlı|gövde|govde|oran|sayisi|sayısı|renk|siyah|beyaz|mavi|gri|yesil|yeşil|kirmizi|kırmızı|altin|altın|gumus|gümüş|dakika|saat|gun|gün|ay|yil|yıl|cikis|çıkış|giris|giriş|baglanti|bağlantı|agirlik|ağırlık|boyut|genislik|genişlik|yukseklik|yükseklik|derinlik|malzeme|pil|batarya|islemci|işlemci|bellek|depolama|guvenlik|güvenlik|suya|dayanikli|dayanıklı|toza|katlanabilir|dokunmatik)\b/i;

function isNeeded(item) {
  const source = String(item.source || '');
  if (!NEEDS_TR_RE.test(source)) return false;
  if (item.type === 'product_name') {
    return /[ığşçöüİĞŞÇÖÜ]|\b(akilli|akıllı|oyuncu|kablolu|kablosuz|sarj|şarj|kulaklik|kulaklık|monitor|monitör|kamera|yazici|yazıcı|hoparlor|hoparlör|klavye|supurge|süpürge|televizyon)\b/i.test(source);
  }
  return true;
}

function writePrompt(outDir) {
  const basePrompt = fs.readFileSync(path.join(BASE_DIR, 'DEEPSEEK_PROMPT.txt'), 'utf8');
  fs.writeFileSync(path.join(outDir, 'DEEPSEEK_PROMPT.txt'), basePrompt, 'utf8');
}

const all = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'all_terms_master.json'), 'utf8'));
const needed = all.filter(isNeeded);
needed.forEach((item, idx) => {
  item.id = `term_${String(idx + 1).padStart(6, '0')}`;
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'deepseek_needed_terms_master.json'), JSON.stringify(needed, null, 2), 'utf8');
fs.writeFileSync(
  path.join(OUT_DIR, 'deepseek_needed_terms_master.txt'),
  needed.map(x => `${x.id}\t${x.type}\t${x.source}`).join('\n'),
  'utf8',
);

let part = 0;
for (let i = 0; i < needed.length; i += CHUNK_SIZE) {
  part++;
  const chunk = needed.slice(i, i + CHUNK_SIZE);
  const suffix = String(part).padStart(3, '0');
  fs.writeFileSync(path.join(OUT_DIR, `epey_terms_needed_part_${suffix}.json`), JSON.stringify(chunk, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `epey_terms_needed_part_${suffix}.txt`), chunk.map(x => `${x.id}\t${x.type}\t${x.source}`).join('\n'), 'utf8');
}

writePrompt(OUT_DIR);
fs.writeFileSync(path.join(OUT_DIR, 'README.txt'), [
  'DeepSeek-needed Epey translation export',
  `Source full terms: ${all.length}`,
  `Terms needing translation: ${needed.length}`,
  `Chunk size: ${CHUNK_SIZE}`,
  '',
  'This is the folder to use first.',
  'It includes only Turkish-looking terms and important Turkish boolean/common words.',
  'Original product specs are not modified by this export.',
].join('\n'), 'utf8');

console.log(`[needed] source=${all.length}, needed=${needed.length}, out=${OUT_DIR}`);
