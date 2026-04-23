const { Client } = require('ssh2');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HOST = '46.225.95.201';
const USER = 'root';
const OLD_PASSWORD = process.env.SSH_PASSWORD;
const NEW_PASSWORD = crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, '').slice(0, 28);
const PUBKEY = fs.readFileSync(path.join(__dirname, 'qorai_hetzner.pub'), 'utf8').trim();

if (!OLD_PASSWORD) { console.error('Set SSH_PASSWORD env var'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host: HOST,
      port: 22,
      username: USER,
      password: OLD_PASSWORD,
      readyTimeout: 30000,
      tryKeyboard: true,
    });
    conn.on('keyboard-interactive', (name, instr, lang, prompts, finish) => {
      console.log('[kb-int]', prompts.map(p => p.prompt).join(' | '));
      finish([OLD_PASSWORD]);
    });
  });

  console.log('[+] Connected to', HOST);
  console.log('[+] New password will be:', NEW_PASSWORD);

  // Open interactive shell with PTY
  const stream = await new Promise((resolve, reject) => {
    conn.shell({ pty: true, term: 'xterm' }, (err, s) => {
      if (err) return reject(err);
      resolve(s);
    });
  });

  let buffer = '';
  stream.on('data', (d) => {
    const s = d.toString();
    buffer += s;
    process.stdout.write(s);
  });
  stream.stderr.on('data', (d) => process.stderr.write(d.toString()));

  function waitFor(regex, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (regex.test(buffer)) {
          const b = buffer;
          buffer = '';
          return resolve(b);
        }
        if (Date.now() - start > timeout) return reject(new Error('Timeout waiting for ' + regex));
        setTimeout(check, 100);
      };
      check();
    });
  }

  // Handle forced password change on first login
  // Hetzner expired password flow: Current password -> New password -> Retype new password
  try {
    await waitFor(/[Cc]urrent.*password|UNIX password|WARNING/i, 10000);
    await sleep(300);
    stream.write(OLD_PASSWORD + '\n');

    await waitFor(/[Nn]ew password/i, 10000);
    await sleep(300);
    stream.write(NEW_PASSWORD + '\n');

    await waitFor(/[Rr]etype|[Rr]e-?enter|again/i, 10000);
    await sleep(300);
    stream.write(NEW_PASSWORD + '\n');

    await waitFor(/passwd:.*success|successfully|password updated|#\s*$|\$\s*$/i, 15000);
    console.log('\n[+] Password changed');
  } catch (e) {
    console.error('[!] Password change phase error:', e.message);
  }

  await sleep(500);
  buffer = '';

  // Now we should be at a prompt. Install SSH key.
  stream.write('mkdir -p /root/.ssh && chmod 700 /root/.ssh\n');
  await sleep(500);
  stream.write(`echo "${PUBKEY}" > /root/.ssh/authorized_keys\n`);
  await sleep(500);
  stream.write('chmod 600 /root/.ssh/authorized_keys\n');
  await sleep(500);
  stream.write('echo KEY_INSTALLED_OK\n');
  await waitFor(/KEY_INSTALLED_OK/, 10000);
  console.log('\n[+] SSH key installed');

  stream.write('exit\n');
  await sleep(1000);
  conn.end();

  // Save new password to file (gitignored)
  fs.writeFileSync(path.join(__dirname, '.server-password'), NEW_PASSWORD);
  console.log('\n[+] New password saved to migration/.server-password');
  console.log('[+] SSH key setup complete. Next step: connect with key.');
}

main().catch((e) => {
  console.error('[!] FATAL:', e.message);
  process.exit(1);
});
