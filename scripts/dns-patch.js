'use strict';
// Local DNS override: router blocks external DNS (port 53), sslip.io can't resolve.
// Patches dns.lookup so Node can reach the Hetzner server without modifying hosts file.
const dns = require('dns');
const origLookup = dns.lookup.bind(dns);
const OVERRIDES = {
  'yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io': '46.225.95.201',
  'lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io': '46.225.95.201',
};
dns.lookup = function patchedLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  const ip = OVERRIDES[hostname];
  if (ip) {
    const family = ip.includes(':') ? 6 : 4;
    if (options && options.all) return setImmediate(() => cb(null, [{ address: ip, family }]));
    return setImmediate(() => cb(null, ip, family));
  }
  return origLookup(hostname, options, cb);
};
// TLS verification stays ON: we only override the A-record lookup, the SNI
// hostname is preserved so the server's Let's Encrypt cert validates normally.
