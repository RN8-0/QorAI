import { useEffect, useState } from 'react';

// Visitor country detection. qorai.net is behind Cloudflare, so /cdn-cgi/trace
// returns `loc=XX` for free with no third-party call. Falls back to ipwho.is,
// then US. Result cached in localStorage for a day and deduped across callers.

const KEY = 'qor-geo-cc';
// Short TTL: the cached value is only an instant-paint seed. We ALWAYS revalidate
// against Cloudflare in the background, so a VPN / real location change is
// reflected within one render instead of being frozen for a day (the bug that
// pinned a German-VPN visitor to a stale TR ship-to default).
const TTL = 60 * 60 * 1000;
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

// Live network probe. Cloudflare /cdn-cgi/trace reflects the CURRENT exit IP
// (VPN-aware) for free with no third-party call; ipwho.is is the fallback. When
// the fresh value differs from what we last served, broadcast qor-geo-change so
// every mounted useGeoCountry() (and the ship-to selector) updates immediately.
function probeCountry() {
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
        const r = await fetch('https://ipwho.is/?fields=country_code', { cache: 'no-store' });
        const j = await r.json();
        cc = (j && j.country_code) || '';
      } catch { /* ignore */ }
    }
    inflight = null;
    cc = String(cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return memo || readCache() || 'US';
    const prev = memo || readCache();
    memo = cc;
    writeCache(cc);
    // Real location change since we last served (e.g. VPN flipped TR→DE): push it
    // to the UI so the ship-to default and Amazon storefront follow along.
    if (prev && prev !== cc) {
      try { window.dispatchEvent(new CustomEvent('qor-geo-change', { detail: cc })); } catch { /* ignore */ }
    }
    return cc;
  })();
  return inflight;
}

export async function detectCountry() {
  const cached = readCache();
  if (cached) {
    memo = cached;
    probeCountry(); // serve instantly, but revalidate in the background
    return cached;
  }
  if (memo) { probeCountry(); return memo; }
  return probeCountry();
}

// User override (Settings → Region). Writes the cache with a fresh timestamp so
// detectCountry() returns it, and broadcasts a `qor-geo-change` event so every
// mounted useGeoCountry() updates the displayed currency/market immediately.
export function setGeoCountry(cc) {
  const code = String(cc || '').toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(code)) return '';
  memo = code;
  writeCache(code);
  try { window.dispatchEvent(new CustomEvent('qor-geo-change', { detail: code })); } catch { /* ignore */ }
  return code;
}

export function useGeoCountry() {
  const [country, setCountry] = useState(() => readCache() || memo || '');
  useEffect(() => {
    let live = true;
    detectCountry().then((cc) => { if (live) setCountry(cc); });
    const onChange = (e) => { if (live) setCountry((e && e.detail) || readCache() || ''); };
    window.addEventListener('qor-geo-change', onChange);
    return () => { live = false; window.removeEventListener('qor-geo-change', onChange); };
  }, []);
  return country;
}
