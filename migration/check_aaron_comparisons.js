const PocketBase = require('pocketbase/cjs');
const pb = new PocketBase('https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io');
(async () => {
  await pb.collection('_superusers').authWithPassword('admin@compair.local', 'mx6I0zPE3HSaqbjlAY0p');
  const list = await pb.collection('comparisons').getList(1, 20, {
    filter: 'userId = "4s5t9ggpnu7ju54"',
    sort: '-updated',
  });
  console.log('TOTAL', list.totalItems);
  for (const r of list.items) {
    console.log('---', r.id);
    console.log('  userId   =', r.userId);
    console.log('  productIds=', JSON.stringify(r.productIds));
    console.log('  items    =', JSON.stringify(r.items));
    console.log('  category =', r.category);
    console.log('  notes    =', JSON.stringify(r.notes));
    console.log('  created  =', r.created, ' updated=', r.updated);
  }
  // Notifications
  const nlist = await pb.collection('notifications').getList(1, 20, {
    filter: 'recipientId = "4s5t9ggpnu7ju54"',
    sort: '-created',
  });
  console.log('\nNOTIF TOTAL', nlist.totalItems);
  for (const n of nlist.items) {
    console.log('---', n.id, n.type, n.title, '| read=', n.read, '| recipient=', n.recipientId);
  }
})().catch(e => {
  console.error('ERR', e);
  process.exit(1);
});
