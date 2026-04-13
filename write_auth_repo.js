const fs = require('fs');
const py = fs.readFileSync('write_auth_repo.py', 'utf8');
const m = py.match(/r"""([\s\S]*?)"""/);
if (!m) { console.log('no match'); process.exit(1); }
fs.writeFileSync('lib/data/repositories/auth_repo.dart', m[1], 'utf8');
console.log('Done, bytes: ' + m[1].length);
