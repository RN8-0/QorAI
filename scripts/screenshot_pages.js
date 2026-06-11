// Screenshot the built website pages for visual review.
// Usage: node scripts/screenshot_pages.js [baseUrl]
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = path.join(__dirname, '..', '.shots');
const PAGES = [
  { route: '/', name: 'home' },
  { route: '/link-analysis', name: 'link-analysis' },
  { route: '/subscriptions', name: 'subscriptions' },
  { route: '/premium', name: 'premium' },
  { route: '/quiz', name: 'quiz' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  for (const p of PAGES) {
    try {
      await page.goto(`${BASE}${p.route}`, { waitUntil: 'networkidle2', timeout: 45000 });
      // Wait until the main stylesheet has actually applied (font swaps off serif).
      await page.waitForFunction(
        () => getComputedStyle(document.body).fontFamily.toLowerCase().includes('jakarta')
          || !getComputedStyle(document.body).fontFamily.toLowerCase().includes('times'),
        { timeout: 8000 },
      ).catch(() => {});
      // Let entrance animations and lazy data settle.
      await new Promise((r) => setTimeout(r, 2200));
      // Scroll a bit so below-the-fold reveals trigger, then back to top.
      await page.evaluate(() => window.scrollTo({ top: 900 }));
      await new Promise((r) => setTimeout(r, 900));
      await page.evaluate(() => window.scrollTo({ top: 0 }));
      await new Promise((r) => setTimeout(r, 700));
      await page.screenshot({ path: path.join(OUT, `${p.name}-top.png`) });
      await page.evaluate(() => window.scrollTo({ top: 850 }));
      await new Promise((r) => setTimeout(r, 900));
      await page.screenshot({ path: path.join(OUT, `${p.name}-mid.png`) });
      console.log(`ok ${p.name}`);
    } catch (e) {
      console.error(`FAIL ${p.name}: ${e.message}`);
    }
  }
  await browser.close();
})();
