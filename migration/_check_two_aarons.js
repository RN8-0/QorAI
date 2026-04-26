const { req } = require('./pb');
(async () => {
  // Check both arainunge accounts
  for (const uid of ['doraoppyhbvuy9c', '4s5t9ggpnu7ju54']) {
    const u = await req('GET', '/api/collections/users/records/' + uid);
    console.log('---', uid);
    console.log('email:', u.body.email, '| googleEmail:', u.body.googleEmail, '| verified:', u.body.verified, '| name:', u.body.name, '| dn:', u.body.displayName, '| fcm:', !!u.body.fcmToken);
    const c = await req('GET', '/api/collections/comparisons/records?filter=(userId="' + uid + '")');
    console.log('comparisons:', c.body.totalItems);
    const n = await req('GET', '/api/collections/notifications/records?filter=(recipientId="' + uid + '")');
    console.log('notifications:', n.body.totalItems);
  }
})();
