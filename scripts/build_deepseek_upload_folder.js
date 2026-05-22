#!/usr/bin/env node
/**
 * Create one DeepSeek-uploadable folder with <= 50 JSON attachments.
 * No prompt file is written here.
 */

const fs = require('fs');
const path = require('path');

const desktop = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop');
const src = path.join(desktop, 'epey_translation_terms_deepseek_needed', 'deepseek_needed_terms_master.json');
const outDir = path.join(desktop, 'DEEPSEEK_UPLOAD_EPEY_TERMS');
const chunkSize = Number((process.argv.find(a => a.startsWith('--chunk=')) || '').split('=')[1] || 1500);

const terms = JSON.parse(fs.readFileSync(src, 'utf8'));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let part = 0;
for (let i = 0; i < terms.length; i += chunkSize) {
  part++;
  const chunk = terms.slice(i, i + chunkSize);
  const file = path.join(outDir, `epey_translate_${String(part).padStart(2, '0')}.json`);
  fs.writeFileSync(file, JSON.stringify(chunk, null, 2), 'utf8');
}

fs.writeFileSync(
  path.join(outDir, '_FILES_ONLY_NO_PROMPT.txt'),
  [
    'Upload the JSON files to DeepSeek.',
    'Do not upload more than 50 files at once.',
    `Files: ${part}`,
    `Terms: ${terms.length}`,
    `Chunk size: ${chunkSize}`,
    'Prompt is not included in this folder.',
  ].join('\n'),
  'utf8',
);

console.log(`[upload-folder] terms=${terms.length}, files=${part}, out=${outDir}`);
