const http = require('http');

// Test with a known working product URL
const testUrl = 'https://geizhals.eu/apple-iphone-16-128gb-schwarz-a3296281.html';
console.log('Testing product URL:', testUrl);

const req = http.get('http://localhost:3456/?url=' + encodeURIComponent(testUrl), (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode, 'Len:', data.length);
    console.log('Challenge?', data.includes('Nur einen Moment'));
    console.log('Title:', (data.match(/<title>([^<]+)<\/title>/i) || [])[1]);
    
    // Parse specs
    const gridMatch = data.match(/<dl[^>]*class=["'][^"]*specs-grid[^"]*["'][^>]*>([\s\S]*?)<\/dl>/i);
    if (gridMatch) {
      const itemRe = /<div class="specs-grid__item">\s*<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>\s*<\/div>/g;
      const specs = {};
      let item;
      while ((item = itemRe.exec(gridMatch[1])) !== null) {
        specs[item[1].trim()] = item[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      console.log('\nSpecs count:', Object.keys(specs).length);
      Object.entries(specs).slice(0, 10).forEach(([k,v]) => console.log('  ', k, '=', v.substring(0, 60)));
    } else {
      console.log('No specs-grid found');
    }
    
    // Parse image
    const imgRe = /src="([^"]*gzhls\.at\/pix[^"]*)"/;
    const imgMatch = data.match(imgRe);
    console.log('\nFirst image:', imgMatch ? imgMatch[1] : 'NONE');
    
    // Parse price
    const priceRe = /class="gh_price[^"]*"[^>]*>([\s\S]*?)<\/[^>]*>/i;
    const priceMatch = data.match(priceRe);
    console.log('Price:', priceMatch ? priceMatch[1].replace(/<[^>]+>/g, ' ').trim() : 'NONE');
    
    // Parse name from h1
    const h1Match = data.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      const name = h1Match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log('H1 Name:', name.substring(0, 80));
    }
    
    // Check for similar products
    const top10Start = data.indexOf('Ähnliche Produkte');
    if (top10Start !== -1) {
      const section = data.substring(top10Start, top10Start + 15000);
      const linkRe = /href=["']([^"']*-a\d+\.html)["']/gi;
      const links = new Set();
      let m;
      while ((m = linkRe.exec(section)) !== null) {
        let href = m[1];
        if (!href.startsWith('http')) href = 'https://geizhals.eu' + (href.startsWith('/') ? '' : '/') + href;
        links.add(href);
      }
      console.log('\nSimilar products:', links.size);
      Array.from(links).slice(0, 5).forEach(l => console.log('  ', l));
    }
  });
});
req.on('error', e => console.log('Error:', e.message));
req.setTimeout(30000, () => console.log('Timeout'));
