const PB = require('pocketbase/cjs');
const fs = require('fs');
const env = Object.fromEntries(
  fs.readFileSync(__dirname + '/.env', 'utf8')
    .split(/\r?\n/).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const targetEmail = process.argv[2] || 'araingamex@gmail.com';
(async () => {
  const pb = new PB(env.POCKETBASE_URL);
  await pb.collection('_superusers').authWithPassword(env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD);
  console.log('Checking', targetEmail);
  try {
    const u = await pb.collection('users').getFirstListItem(`email="${targetEmail}"`);
    console.log('USER:', { id: u.id, email: u.email, verified: u.verified, created: u.created });
  } catch (e) { console.log('USER NOT FOUND:', e.message); }
  try {
    await pb.collection('users').requestVerification(targetEmail);
    console.log('requestVerification OK');
  } catch (e) {
    console.error('requestVerification FAIL:', e.message, JSON.stringify(e.response || {}));
  }
})();
