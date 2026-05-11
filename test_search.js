const http = require('http');

// Test search page and look for product links with different patterns
const req = http.get('http://localhost:3456/?url=' + encodeURIComponent('https://geizhals.eu/?fs=smartphone'), (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode, 'Len:', data.length);
    console.log('Challenge?', data.includes('Nur einen Moment'));
    console.log('Title:', (data.match(/<title>([^<]+)<\/title>/i) || [])[1]);
    
    // Look for all .html links
    const allLinkRe = /href=["']([^"']*\.html)["']/gi;
    const allLinks = new Set();
    let m;
    while ((m = allLinkRe.exec(data)) !== null) allLinks.add(m[1]);
    console.log('All .html links:', allLinks.size);
    Array.from(allLinks).slice(0, 20).forEach(l => console.log('  ', l));
    
    // Look for product list structure
    console.log('Has product-list?', data.includes('product-list'));
    console.log('Has listview?', data.includes('listview'));
    console.log('Has offer?', data.includes('offer'));
    console.log('Has search result?', data.includes('suchergebnis') || data.includes('ergebnis'));
    
    // Look for data attributes with product IDs
    const dataIdRe = /data-id=["'](\d+)["']/gi;
    const dataIds = [];
    while ((m = dataIdRe.exec(data)) !== null) dataIds.push(m[1]);
    console.log('Data IDs found:', dataIds.length);
    dataIds.slice(0, 10).forEach(id => console.log('  ', id));
  });
});
req.on('error', e => console.log('Error:', e.message));
req.setTimeout(60000, () => console.log('Timeout'));
