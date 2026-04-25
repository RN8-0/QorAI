// Qor AI — users collection DELETE kuralını ayarla
// Kullanıcının kendi hesabını silebilmesi için gereken kural: @request.auth.id = id
const { req } = require('./pb');

(async () => {
  console.log('=== Qor AI — users collection DELETE rule fix ===\n');

  const r = await req('GET', '/api/collections/users');
  if (r.status !== 200) {
    console.error('Failed to get users collection:', r.status, r.body);
    process.exit(1);
  }

  const col = r.body;
  console.log('Current deleteRule:', JSON.stringify(col.deleteRule));

  const desiredRule = '@request.auth.id = id';
  if (col.deleteRule === desiredRule) {
    console.log('✓ deleteRule is already set correctly. Nothing to do.');
    return;
  }

  const patch = { deleteRule: desiredRule };
  const p = await req('PATCH', `/api/collections/${col.id}`, patch);

  if (p.status === 200 || p.status === 201) {
    console.log('✓ users collection deleteRule updated successfully!');
    console.log('  Old rule:', JSON.stringify(col.deleteRule));
    console.log('  New rule:', desiredRule);
  } else {
    console.error('✗ Failed to update deleteRule:', p.status, JSON.stringify(p.body, null, 2));
    process.exit(1);
  }
})().catch(e => { console.error('Error:', e); process.exit(1); });
