// Nuke ALL tr_translation_dict__part_N and de_translation_dict__part_N
// shards from PocketBase. Used to force a fresh dict on the next scrape
// after pipeline changes invalidate the cached translations.
const fs = require('fs');
const path = require('path');

function loadEnv(p) {
  const env = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const env = { ...loadEnv(path.join(__dirname, '..', 'migration', '.env')), ...process.env };
const PB_URL = (env.POCKETBASE_URL || '').replace(/\/$/, '');
const PB_EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_PASSWORD = env.POCKETBASE_ADMIN_PASSWORD;

(async () => {
  if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
    console.error('PB env missing'); process.exit(1);
  }
  console.log('Auth →', PB_URL);
  const auth = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  if (!auth.ok) { console.error('auth fail', auth.status); process.exit(2); }
  const { token } = await auth.json();

  for (const prefix of ['tr_translation_dict__part_', 'de_translation_dict__part_',
                         'tr_translation_dict_manifest', 'de_translation_dict_manifest',
                         'tr_translation_dict', 'de_translation_dict']) {
    let totalDeleted = 0;
    while (true) {
      const r = await fetch(
        `${PB_URL}/api/collections/public_config/records?perPage=200&filter=${encodeURIComponent(`key~"${prefix}"`)}&fields=id,key`,
        { headers: { Authorization: token } },
      );
      const json = await r.json();
      if (!json.items?.length) break;
      for (const it of json.items) {
        const d = await fetch(`${PB_URL}/api/collections/public_config/records/${it.id}`, {
          method: 'DELETE', headers: { Authorization: token },
        });
        if (d.ok) {
          totalDeleted++;
          process.stdout.write(`\r  ${prefix}*: ${totalDeleted} deleted (${it.key})  `);
        }
      }
      if (json.items.length < 200) break;
    }
    console.log(`\n  ${prefix}*: ${totalDeleted} total deleted`);
  }
  console.log('Done.');
})();
