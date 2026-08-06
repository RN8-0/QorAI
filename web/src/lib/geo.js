import { useSyncExternalStore } from 'react';

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
// Sayfa yüklemesi başına TEK doğrulama. `inflight` yalnız EŞZAMANLI çağrıları
// birleştiriyordu: probe bitince null'a döndüğü için sonraki her çağrı YENİ bir
// istek açıyordu ve useGeoCountry() her ürün kartında çağrıldığından ölçümde tek
// bir ana sayfa yüklemesi 8 kez /cdn-cgi/trace istiyordu (2026-08-06).
let revalidated = false;

function probeCountry() {
  if (inflight) return inflight;
  revalidated = true;
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
    if (!revalidated) probeCountry(); // serve instantly, revalidate ONCE per load
    return cached;
  }
  if (memo) { if (!revalidated) probeCountry(); return memo; }
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

// ── Paylaşılan abonelik ────────────────────────────────────────────────────
// useGeoCountry() ürün kartı BAŞINA çağrılıyor (ana sayfada ~66 kez). Eskiden her
// örnek kendi useState'ini, kendi effect'ini, kendi detectCountry() promise'ını ve
// kendi window listener'ını kuruyordu. Artık tek bir modül deposu var: tespit bir
// kez koşar, snapshot kararlı bir string olduğu için değişmeyen ülke yeniden
// render tetiklemez.
let current = null;
const listeners = new Set();
let started = false;

function emit(cc) {
  const v = String(cc || '');
  if (v === current) return;
  current = v;
  listeners.forEach((f) => { try { f(); } catch { /* ignore */ } });
}

function getSnapshot() {
  if (current === null) current = readCache() || memo || '';
  return current;
}

function subscribe(cb) {
  listeners.add(cb);
  if (!started) {
    started = true;
    try {
      window.addEventListener('qor-geo-change', (e) => emit((e && e.detail) || readCache() || ''));
    } catch { /* ignore */ }
    detectCountry().then(emit).catch(() => {});
  }
  return () => { listeners.delete(cb); };
}

export function useGeoCountry() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
