const { req } = require('./pb');
(async () => {
  const r = await req('GET', '/api/collections/comparisons/records?filter=(userId="4s5t9ggpnu7ju54")&sort=-updated&perPage=20');
  console.log('total:', r.body.totalItems);
  for (const it of r.body.items || []) {
    const ids = it.productIds || it.items || [];
    console.log(it.id, '| created:', it.created, '| len:', Array.isArray(ids) ? ids.length : '?', '| title:', (it.title || '').slice(0, 60));
  }
  // notification list
  const n = await req('GET', '/api/collections/notifications/records?sort=-created&perPage=10&filter=(recipientId="4s5t9ggpnu7ju54")');
  console.log('---NOTIF total:', n.body.totalItems);
  for (const it of n.body.items || []) {
    console.log(it.id, '|', it.created, '|', it.title, '|', (it.body || '').slice(0, 50));
  }
})();
