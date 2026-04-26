const PocketBase = require('pocketbase/cjs');
const pb = new PocketBase('https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io');
(async () => {
  await pb.collection('_superusers').authWithPassword('admin@compair.local', 'mx6I0zPE3HSaqbjlAY0p');
  const newPwd = 'Aaron2026!';
  const updated = await pb.collection('users').update('4s5t9ggpnu7ju54', {
    password: newPwd,
    passwordConfirm: newPwd,
    verified: true,
  });
  console.log('OK email=', updated.email, 'verified=', updated.verified);
  console.log('PASSWORD =', newPwd);
})().catch(e => { console.error('ERR', e?.response || e); process.exit(1); });
