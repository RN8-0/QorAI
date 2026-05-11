const http = require('http');

// Test 1: Proxy health check
http.get('http://localhost:3456/health', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('=== PROXY HEALTH ===');
    console.log(data);
    
    // Test 2: Search page
    console.log('\n=== SEARCH TEST ===');
    const req2 = http.get('http://localhost:3456/?url=' + encodeURIComponent('https://geizhals.eu/?fs=smartphone'), (res2) => {
      let data2 = '';
      res2.on('data', chunk => data2 += chunk);
      res2.on('end', () => {
        console.log('Status:', res2.statusCode, 'Len:', data2.length);
        console.log('Challenge?', data2.includes('Nur einen Moment'));
        const linkRe = /href=["']([^"']*-a\d+\.html)["']/gi;
        const links = new Set();
        let m;
        while ((m = linkRe.exec(data2)) !== null) {
          let href = m[1];
          if (!href.startsWith('http')) href = 'https://geizhals.eu' + (href.startsWith('/') ? '' : '/') + href;
          links.add(href);
        }
        console.log('Product links:', links.size);
        Array.from(links).slice(0, 5).forEach(l => console.log('  ', l));
        
        // Test 3: Product detail page
        if (links.size > 0) {
          const firstLink = Array.from(links)[0];
          console.log('\n=== PRODUCT DETAIL TEST ===');
          console.log('Fetching:', firstLink);
          const req3 = http.get('http://localhost:3456/?url=' + encodeURIComponent(firstLink), (res3) => {
            let data3 = '';
            res3.on('data', chunk => data3 += chunk);
            res3.on('end', () => {
              console.log('Status:', res3.statusCode, 'Len:', data3.length);
              console.log('Challenge?', data3.includes('Nur einen Moment'));
              
              // Parse specs
              const gridMatch = data3.match(/<dl[^>]*class=["'][^"]*specs-grid[^"]*["'][^>]*>([\s\S]*?)<\/dl>/i);
              if (gridMatch) {
                const itemRe = /<div class="specs-grid__item">\s*<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>\s*<\/div>/g;
                const specs = {};
                let item;
                while ((item = itemRe.exec(gridMatch[1])) !== null) {
                  specs[item[1].trim()] = item[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                }
                console.log('Specs count:', Object.keys(specs).length);
                Object.entries(specs).slice(0, 5).forEach(([k,v]) => console.log('  ', k, '=', v.substring(0, 60)));
              }
              
              // Parse image
              const imgRe = /src="([^"]*gzhls\.at\/pix[^"]*)"/;
              const imgMatch = data3.match(imgRe);
              console.log('First image:', imgMatch ? imgMatch[1] : 'NONE');
              
              // Parse price
              const priceRe = /class="gh_price[^"]*"[^>]*>([\s\S]*?)<\/[^>]*>/i;
              const priceMatch = data3.match(priceRe);
              console.log('Price:', priceMatch ? priceMatch[1].replace(/<[^>]+>/g, ' ').trim() : 'NONE');
              
              // Parse name
              const h1Match = data3.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
              if (h1Match) {
                const name = h1Match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                console.log('Name:', name.substring(0, 80));
              }
            });
          });
          req3.on('error', e => console.log('Product error:', e.message));
          req3.setTimeout(30000, () => console.log('Product timeout'));
        }
      });
    });
    req2.on('error', e => console.log('Search error:', e.message));
    req2.setTimeout(30000, () => console.log('Search timeout'));
  });
});
