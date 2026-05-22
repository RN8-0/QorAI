#!/usr/bin/env node
/**
 * Build a smaller DeepSeek-friendly translation set from all_terms_master.json.
 * Keeps all spec keys/values/sections, but keeps product names only when they
 * contain Turkish/descriptive words.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'epey_translation_terms');
const OUT_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'epey_translation_terms_recommended');
const CHUNK_SIZE = Number((process.argv.find(a => a.startsWith('--chunk=')) || '').split('=')[1] || 350);

const TURKISH_NAME_RE = /[ığşçöüİĞŞÇÖÜ]|\b(akilli|akıllı|oyuncu|kablolu|kablosuz|sarj|şarj|kulaklik|kulaklık|telefon|saat|monitor|monitör|kamera|yazici|yazıcı|hoparlor|hoparlör|klavye|mouse|fare|supurge|süpürge|televizyon|beyaz|siyah|mavi|gri|yesil|yeşil|kirmizi|kırmızı)\b/i;

function writePrompt(outDir) {
  const src = path.join(BASE_DIR, 'DEEPSEEK_PROMPT.txt');
  fs.copyFileSync(src, path.join(outDir, 'DEEPSEEK_PROMPT.txt'));
}

const all = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'all_terms_master.json'), 'utf8'));
const recommended = all.filter(item => {
  if (item.type !== 'product_name') return true;
  return TURKISH_NAME_RE.test(String(item.source || ''));
});

recommended.forEach((item, idx) => {
  item.id = `term_${String(idx + 1).padStart(6, '0')}`;
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'recommended_terms_master.json'), JSON.stringify(recommended, null, 2), 'utf8');
fs.writeFileSync(
  path.join(OUT_DIR, 'recommended_terms_master.txt'),
  recommended.map(x => `${x.id}\t${x.type}\t${x.source}`).join('\n'),
  'utf8',
);

let part = 0;
for (let i = 0; i < recommended.length; i += CHUNK_SIZE) {
  part++;
  const chunk = recommended.slice(i, i + CHUNK_SIZE);
  const suffix = String(part).padStart(3, '0');
  fs.writeFileSync(path.join(OUT_DIR, `epey_terms_recommended_part_${suffix}.json`), JSON.stringify(chunk, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `epey_terms_recommended_part_${suffix}.txt`), chunk.map(x => `${x.id}\t${x.type}\t${x.source}`).join('\n'), 'utf8');
}

writePrompt(OUT_DIR);
fs.writeFileSync(path.join(OUT_DIR, 'README.txt'), [
  'Recommended Epey translation export',
  `Source full terms: ${all.length}`,
  `Recommended terms: ${recommended.length}`,
  `Chunk size: ${CHUNK_SIZE}`,
  '',
  'This set keeps all spec keys, spec values, key specs, and section titles.',
  'Product names are included only if they contain Turkish/descriptive words.',
  'Use DEEPSEEK_PROMPT.txt with each JSON part.',
].join('\n'), 'utf8');

console.log(`[recommended] source=${all.length}, recommended=${recommended.length}, out=${OUT_DIR}`);
