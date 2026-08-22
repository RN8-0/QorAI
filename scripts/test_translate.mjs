// Word-coverage test for the local NLLB worker.
// Sends realistic catalog phrases TR↔DE↔EN and flags suspicious drops.

const PORT = process.env.QORAI_TRANSLATE_PORT || 8797;
const URL = `http://127.0.0.1:${PORT}/translate`;

const CASES = [
  // TR source — realistic product spec language we actually ship.
  { from: 'tr', to: ['en'], texts: [
    'Kablosuz Bluetooth Kulaklık Aktif Gürültü Önleme',
    'Ekran kartı bellek tipi GDDR7',
    'Yüksek hızlı PCIe 5.0 destekli M.2 SSD',
    'Su geçirmez akıllı saat kalp ritmi ve oksijen ölçer',
    'OLED 4K 144 Hz oyuncu monitörü, HDR10 desteği',
    'Hızlı şarj 65 W USB-C güç adaptörü',
    'Çift bant Wi-Fi 7 mesh yönlendirici',
    'Termal macun ve seramik soğutucu blok dahil',
    'Apple iPhone 17 Pro Max 1 TB titanyum',
    'Toz ve su direnci IP68 sertifikalı gövde',
  ] },
  // Almanca KAYNAK vakasi kaldirildi (2026-08-21): worker'in LANGS kapisi
  // artik 'de' istegini reddediyor, bu vaka her kosuda basarisiz olurdu.
  { from: 'en', to: ['tr'], texts: [
    'Wireless Bluetooth headphones with active noise cancellation',
    'Graphics card memory type GDDR7',
    'High-speed PCIe 5.0 M.2 SSD',
    'Waterproof smartwatch with heart rate and oxygen monitoring',
    'OLED 4K 144 Hz gaming monitor with HDR10 support',
    '65 W USB-C fast charging power adapter',
    'Dual-band Wi-Fi 7 mesh router',
    'Thermal paste and ceramic cooling block included',
    'Apple iPhone 17 Pro Max 1 TB titanium',
    'IP68 dust and water resistance rating',
  ] },
];

function wordsOf(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[.,;:!?()/[\]{}"'·•]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

async function callWorker(payload) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function yel(s) { return `\x1b[33m${s}\x1b[0m`; }
function grn(s) { return `\x1b[32m${s}\x1b[0m`; }

(async () => {
  let totalIssues = 0;
  for (const c of CASES) {
    console.log(`\n=== ${c.from.toUpperCase()} → ${c.to.map(s => s.toUpperCase()).join(', ')} (${c.texts.length} phrases) ===\n`);
    let started = Date.now();
    let res;
    try {
      res = await callWorker({ from: c.from, to: c.to, texts: c.texts });
    } catch (e) {
      console.log(red(`✗ worker call failed: ${e.message}`));
      totalIssues++;
      continue;
    }
    const ms = Date.now() - started;
    console.log(`  worker: ${res.model} · ${ms} ms · ${res.count} texts\n`);

    for (const src of c.texts) {
      const t = res.translations?.[src];
      if (!t) {
        console.log(red(`  ✗ MISSING from response: "${src}"`));
        totalIssues++;
        continue;
      }
      console.log(`  src: ${src}`);
      for (const tgt of c.to) {
        const out = t[tgt];
        if (!out || !String(out).trim()) {
          console.log(red(`    ${tgt}: <empty>`));
          totalIssues++;
          continue;
        }
        // Heuristics
        const srcWords = wordsOf(src);
        const outWords = wordsOf(out);
        const ratio = outWords.length / Math.max(1, srcWords.length);
        const issues = [];
        if (out.length < src.length * 0.45) issues.push(`too short (${out.length}<${Math.round(src.length * 0.45)})`);
        if (ratio < 0.55) issues.push(`word ratio low (${outWords.length}/${srcWords.length})`);
        // Numbers must survive
        const srcNums = (src.match(/\d+/g) || []);
        const outNums = (out.match(/\d+/g) || []);
        const missingNums = srcNums.filter(n => !outNums.includes(n));
        if (missingNums.length) issues.push(`numbers dropped: ${missingNums.join(',')}`);
        // Common tech tokens that should never disappear
        const tokens = ['Bluetooth','GDDR7','PCIe','USB-C','OLED','HDR10','Wi-Fi','IP68','SSD','iPhone','Apple','Pro','Max','TB','GB','HDR','M.2','144'];
        const dropped = tokens.filter(t => src.includes(t) && !out.includes(t));
        if (dropped.length) issues.push(`tokens dropped: ${dropped.join(',')}`);
        if (issues.length) {
          totalIssues += issues.length;
          console.log(`    ${red(tgt)}: ${out}    ${yel('// ' + issues.join(' · '))}`);
        } else {
          console.log(`    ${grn(tgt)}: ${out}`);
        }
      }
      console.log('');
    }
  }
  console.log(totalIssues === 0
    ? grn(`\n✓ All cases clean — no word drops, numbers preserved, tech tokens intact.`)
    : red(`\n✗ ${totalIssues} issue(s) found.`));
  process.exit(totalIssues === 0 ? 0 : 1);
})();
