// Eski blog.js'teki (commit 6716ebd9) prompt metinlerini ALTIN KOPYA olarak
// çıkarır. Bir kez koşturulup `scripts/fixtures/blog_prompt_golden.json`
// üretilir; gerileme testi bundan sonra bu dosyaya karşı denetler.
//
//   node scripts/_blog_prompt_golden_cikar.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const src = execSync('git show 6716ebd9d47a:admin/js/blog.js', { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });

// Bir template literal'i, iç içe ${} sayarak sonuna kadar oku.
function lit(startIdx) {
  let i = src.indexOf('`', startIdx) + 1;
  let out = '';
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { out += c + src[i + 1]; i++; continue; }
    if (c === '$' && src[i + 1] === '{') { depth++; out += '${'; i++; continue; }
    if (c === '}' && depth > 0) { depth--; out += '}'; continue; }
    if (c === '`' && depth === 0) break;
    out += c;
  }
  return out;
}
const idx = (s, from = 0) => src.indexOf(s, from);

const golden = {
  konu: lit(idx('const prompt = `', idx('async function blogTopicFetch'))),
  arastirma: lit(idx("grounded('Topic:") + 9),
  yazar: lit(idx('return `', idx('function yazarPrompt('))),
  komut: lit(idx('const prompt = `', idx('async function blogAiCommandRun'))),
  autoSchema: lit(idx('const AUTO_SCHEMA_PROMPT = `')),
  claude: lit(idx('return `', idx('function buildClaudePrompt'))),
  qa: lit(idx('const prompt = `', idx('async function blogAiQa'))),
  junk: lit(idx('const prompt = `', idx('async function classifyJunkLines'))),
  ceviri: lit(idx('const prompt = `', idx('async function blogTranslate'))),
  markaAlan: lit(idx('const ITEM_IMAGE_PROMPT = `')),
};

// `arastirma` template literal değil, tek tırnaklı birleşik string — ayrı al.
{
  const bas = idx("grounded('Topic:");
  const son = src.indexOf(", 4096)", bas);
  golden.arastirma = src.slice(bas + 9, son)
    .replace(/'\s*\+\s*'/g, '')      // '...' + '...' birleşimleri
    .replace(/^'|'$/g, '');
}

fs.mkdirSync('scripts/fixtures', { recursive: true });
fs.writeFileSync('scripts/fixtures/blog_prompt_golden.json', JSON.stringify(golden, null, 1));
for (const [k, v] of Object.entries(golden)) {
  console.log(String(k).padEnd(12), String(v.length).padStart(6), JSON.stringify(v.slice(0, 70)));
}
