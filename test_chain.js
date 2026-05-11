const http = require('http');

// Test: Product discovery via "similar products" chain
// Start from a known product, follow similar products to discover more

const visited = new Set();
const queue = ['https://geizhals.eu/apple-iphone-16-128gb-schwarz-a3296281.html'];
const foundProducts = [];

function fetchUrl(url) {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3456/?url=' + encodeURIComponent(url), (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(30000, () => resolve(''));
  });
}

async function main() {
  while (queue.length > 0 && foundProducts.length < 10) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    console.log(`\n[${foundProducts.length + 1}/10] Fetching: ${url}`);
    const html = await fetchUrl(url);

    if (!html || html.includes('Nur einen Moment')) {
      console.log('  -> Challenge or empty, skipping');
      continue;
    }

    // Extract name
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const name = h1Match ? h1Match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : 'Unknown';

    // Extract specs count
    const gridMatch = html.match(/<dl[^>]*class=["'][^"]*specs-grid[^"]*["'][^>]*>([\s\S]*?)<\/dl>/i);
    let specCount = 0;
    if (gridMatch) {
      specCount = (gridMatch[1].match(/class="specs-grid__item"/g) || []).length;
    }

    // Extract image
    const imgRe = /src="([^"]*gzhls\.at\/pix[^"]*)"/;
    const imgMatch = html.match(imgRe);
    const image = imgMatch ? imgMatch[1] : 'NONE';

    // Extract price
    const priceRe = /class="gh_price[^"]*"[^>]*>([\s\S]*?)<\/[^>]*>/i;
    const priceMatch = html.match(priceRe);
    const price = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, ' ').trim() : 'NONE';

    console.log(`  -> ${name}`);
    console.log(`     Specs: ${specCount}, Image: ${image ? 'yes' : 'no'}, Price: ${price}`);
    foundProducts.push({ url, name, specCount, image, price });

    // Extract similar products
    const top10Start = html.indexOf('Ähnliche Produkte');
    if (top10Start !== -1) {
      const section = html.substring(top10Start, top10Start + 15000);
      const linkRe = /href=["']([^"']*-a\d+\.html)["']/gi;
      let m;
      let newLinks = 0;
      while ((m = linkRe.exec(section)) !== null) {
        let href = m[1];
        if (!href.startsWith('http')) href = 'https://geizhals.eu' + (href.startsWith('/') ? '' : '/') + href;
        if (!visited.has(href) && !queue.includes(href)) {
          queue.push(href);
          newLinks++;
        }
      }
      console.log(`     Similar products found: ${newLinks} new`);
    }

    // Delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total products discovered: ${foundProducts.length}`);
  foundProducts.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name} (${p.specCount} specs, ${p.price})`);
  });
}

main();
