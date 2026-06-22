import { useEffect, useState } from 'react';

// Visitor country detection. qorai.net is behind Cloudflare, so /cdn-cgi/trace
// returns `loc=XX` for free with no third-party call. Falls back to ipwho.is,
// then US. Result cached in localStorage for a day and deduped across callers.

const KEY = 'qor-geo-cc';
const TTL = 24 * 60 * 60 * 1000;
let memo = '';
let inflight = null;

function readCache() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && o.c && Date.now() - o.t < TTL) return o.c;
  } catch { /* ignore */ }
  return '';
}
function writeCache(cc) {
  try { localStorage.setItem(KEY, JSON.stringify({ c: cc, t: Date.now() })); } catch { /* ignore */ }
}

export async function detectCountry() {
  const cached = readCache();
  if (cached) { memo = cached; return cached; }
  if (memo) return memo;
  if (inflight) return inflight;
  inflight = (async () => {
    let cc = '';
    try {
      const r = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
      const txt = await r.text();
      cc = (txt.match(/^loc=([A-Z]{2})/m) || [])[1] || '';
    } catch { /* ignore */ }
    if (!cc) {
      try {
        const r = await fetch('https://ipwho.is/?fields=country_code');
        const j = await r.json();
        cc = (j && j.country_code) || '';
      } catch { /* ignore */ }
    }
    cc = (cc || 'US').toUpperCase();
    memo = cc;
    writeCache(cc);
    inflight = null;
    return cc;
  })();
  return inflight;
}

export function useGeoCountry() {
  const [country, setCountry] = useState(() => readCache() || memo || '');
  useEffect(() => {
    let live = true;
    detectCountry().then((cc) => { if (live) setCountry(cc); });
    return () => { live = false; };
  }, []);
  return country;
}
