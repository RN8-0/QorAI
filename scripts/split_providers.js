/**
 * Split providers.dart (5006 lines) into 6 part files + main file
 * using Dart's part/part of system (zero breaking changes).
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'lib', 'presentation', 'providers', 'providers.dart');
const DIR = path.join(__dirname, '..', 'lib', 'presentation', 'providers');

const content = fs.readFileSync(SRC, 'utf8');
const lines = content.split('\n');
const totalLines = lines.length;

console.log(`Read ${totalLines} lines from providers.dart`);

// ────────────────────────────────────────────
// LINE RANGE ASSIGNMENTS (1-indexed, inclusive)
// ────────────────────────────────────────────

// Each entry: [startLine, endLine, targetFile]
// targetFile: 'main' keeps in providers.dart, others become part files
const assignments = [
  // ─── MAIN: library, imports, core services, repositories ───
  [1, 261, 'main'],         // library; imports; core providers through calculateScoreUseCaseProvider

  // ─── AUTH: auth state, user profile, country init ───
  [262, 307, 'auth_providers.dart'],  // section header through countryInitProvider

  // ─── UI: state providers (category, country, locale, theme, etc.) ───
  [308, 588, 'ui_providers.dart'],    // section header through _categoryCacheMap comment/line before products

  // ─── PRODUCT: productsByCategory, trends ───
  [589, 778, 'product_providers.dart'], // productsByCategoryProvider through trendsProvider

  // ─── COMPARE: comparison state, link analysis, quiz, subscriptions ───
  [779, 1995, 'compare_providers.dart'], // section header through linkAnalysisNotifierProvider alias

  // ─── CACHE: 7 cache notifiers + gemini match ───
  [1996, 2891, 'cache_providers.dart'], // section header through end of gemini match

  // ─── UI (cont): recent searches ───
  [2892, 2898, 'ui_providers.dart'],  // search section header + recentSearchesProvider

  // ─── PRODUCT (cont): search results ───
  [2899, 3019, 'product_providers.dart'], // searchResultsProvider

  // ─── PRODUCT (cont): HomeFeed, home feed provider, trending/featured/etc ───
  [3020, 3845, 'product_providers.dart'], // HomeFeed class through categoryCoversProvider

  // ─── PRODUCT (cont): AI daily trending, personalized, category, fit score, etc ───
  [3846, 4266, 'product_providers.dart'], // aiDailyTrending through userProfileVectorProvider

  // ─── COMPARE (cont): user comparisons, predefined, reviews, favorites ───
  [4267, 4321, 'compare_providers.dart'], // userComparisons through isFavorite

  // ─── PRODUCT (cont): viewed, freemium, spec direction, variants ───
  [4322, 4446, 'product_providers.dart'], // viewedProductsProvider through end of variants

  // ─── AI: chat session ───
  [4447, 4793, 'ai_providers.dart'],  // section header through chatHistoryProvider

  // ─── PRODUCT (cont): similar products + helpers ───
  [4794, totalLines, 'product_providers.dart'], // "End of file" comment through end
];

// ────────────────────────────────────────────
// VERIFY: every line is assigned exactly once
// ────────────────────────────────────────────
const covered = new Set();
for (const [start, end, target] of assignments) {
  for (let i = start; i <= end; i++) {
    if (covered.has(i)) {
      console.error(`ERROR: Line ${i} assigned to multiple targets! (second: ${target})`);
      process.exit(1);
    }
    covered.add(i);
  }
}
for (let i = 1; i <= totalLines; i++) {
  if (!covered.has(i)) {
    console.error(`ERROR: Line ${i} not assigned to any target!`);
    process.exit(1);
  }
}
console.log(`All ${totalLines} lines assigned. No gaps, no overlaps.`);

// ────────────────────────────────────────────
// COLLECT lines per target file
// ────────────────────────────────────────────
const fileContents = {};  // filename -> array of line strings

for (const [start, end, target] of assignments) {
  if (!fileContents[target]) fileContents[target] = [];
  for (let i = start; i <= end; i++) {
    fileContents[target].push(lines[i - 1]); // 0-indexed
  }
}

// ────────────────────────────────────────────
// PART FILE NAMES (order matters for part directives)
// ────────────────────────────────────────────
const partFiles = [
  'auth_providers.dart',
  'ui_providers.dart',
  'product_providers.dart',
  'compare_providers.dart',
  'cache_providers.dart',
  'ai_providers.dart',
];

// ────────────────────────────────────────────
// WRITE MAIN FILE
// ────────────────────────────────────────────
const mainLines = fileContents['main'];

// Find where imports end (last import line)
let lastImportIdx = 0;
for (let i = 0; i < mainLines.length; i++) {
  if (mainLines[i].startsWith('import ') || mainLines[i].startsWith("import '")) {
    lastImportIdx = i;
  }
}

// Insert part directives right after last import
const partDirectives = partFiles.map(f => `part '${f}';`);
const mainOutput = [
  ...mainLines.slice(0, lastImportIdx + 1),
  '',
  '// ── Part files ──',
  ...partDirectives,
  '',
  ...mainLines.slice(lastImportIdx + 1),
].join('\n');

fs.writeFileSync(SRC, mainOutput);
console.log(`  providers.dart (main): ${mainOutput.split('\n').length} lines`);

// ────────────────────────────────────────────
// WRITE PART FILES
// ────────────────────────────────────────────
for (const partFile of partFiles) {
  const partContent = [
    `part of 'providers.dart';`,
    '',
    ...fileContents[partFile],
  ].join('\n');

  const outPath = path.join(DIR, partFile);
  fs.writeFileSync(outPath, partContent);
  console.log(`  ${partFile}: ${partContent.split('\n').length} lines`);
}

console.log('\nDone! providers.dart split into 7 files.');
