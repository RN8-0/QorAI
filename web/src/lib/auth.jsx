import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { seedAuth } from './authSeed';
import { pbMod, pbYuklendiginde } from './pbLazy';

const AuthCtx = createContext(null);

// Shallow-merge a refreshed record over the previous user, but return the SAME
// reference when nothing actually changed, so consumers (e.g. the home feed)
// don't re-run effects on every tab-focus refresh that returns identical data.
function mergeUser(prev, rec) {
  if (!rec) return prev;
  if (!prev) return rec;
  const merged = { ...prev, ...rec };
  try {
    if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
  } catch { /* circular / non-serialisable — just use the merged object */ }
  return merged;
}

// Pulls a fresh user record from PocketBase whenever the tab regains focus or
// becomes visible. The mobile app writes to the same `users` row when the user
// spends Qor coins or upgrades to Premium, so without this sync the website
// would keep showing a stale balance / tier for the duration of the session.
function useUserSync(setUser, oturumVar) {
  useEffect(() => {
    // Cikis yapmis ziyaretcide senkronlanacak kayit YOK: SDK'yi hic yukleme.
    // Trafigin buyuk bolumu bu dalda ve 34 KB'lik SDK boyuna iniyordu.
    if (!oturumVar) return undefined;
    let live = true;
    let inflight = false;
    let lastPull = 0;
    async function pull() {
      if (inflight) return;
      // Throttle: at most once per 20s. Returning to the tab fires focus +
      // visibilitychange together, and refetching/re-rendering the whole app on
      // every such event is what made the page appear to "reload" constantly.
      if (Date.now() - lastPull < 20000) return;
      lastPull = Date.now();
      inflight = true;
      try {
        const { refreshUser } = await pbMod();
        const rec = await refreshUser();
        // mergeUser keeps the previous reference when the data is unchanged, so a
        // no-op refresh doesn't churn the user object and re-run dependent effects.
        if (live && rec) setUser((prev) => mergeUser(prev, rec));
      } finally {
        inflight = false;
      }
    }
    // Ilk cekim BOSTA yapilir: SDK'nin inisi+ayristirilmasi ilk boyamanin ve
    // LCP'nin ONUNDE durmasin. Zaten 20 sn'lik throttle var, birkac yuz ms
    // gecikmenin kullaniciya gorunur bir maliyeti yok.
    const bosta = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    const iptal = window.cancelIdleCallback || clearTimeout;
    const id = bosta(() => pull(), { timeout: 4000 });
    const onVisibility = () => { if (!document.hidden) pull(); };
    const onFocus = () => pull();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      live = false;
      try { iptal(id); } catch { /* tarayici destegi yok */ }
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [setUser, oturumVar]);
}

export function AuthProvider({ children }) {
  // Seed from the SYNCHRONOUSLY-available persisted PocketBase session (read from
  // localStorage in the pb constructor) instead of null. Starting null meant the
  // very first render was always "signed-out": the home feed's personalization
  // key (feedKey) computed as anon, so its instant-paint cache — written under the
  // signed-in key — missed on refresh and flashed skeletons before the auth effect
  // populated the user. Seeding here makes feedKey correct on frame one.
  // Oturum SDK'siz, dogrudan localStorage'dan okunuyor (authSeed.js): SDK 34 KB
  // ve ilk render icin GEREKSIZ — ama kullanicinin kim oldugu ilk render'da
  // BILINMEK ZORUNDA (yukaridaki not).
  const [user, setUser] = useState(() => seedAuth());
  const [modalOpen, setModalOpen] = useState(false);

  // Merge auth-store updates over the previous user (clearing only on sign-out)
  // so a partial record never erases a known-good field like the coin balance.
  // Abonelik SDK yuklenir yuklenmez kurulur; cikisli ziyaretcide SDK hic
  // yuklenmedigi icin bu da hic kosmaz — kullanici giris yapinca (AuthModal
  // SDK'yi cagirir) pbYuklendiginde tetiklenir ve abonelik o an kurulur.
  useEffect(() => {
    let off = null;
    const birak = pbYuklendiginde((m) => {
      off = m.onAuthChange((u) => setUser((prev) => (u ? mergeUser(prev, u) : null)));
    });
    return () => { birak(); if (off) off(); };
  }, []);
  useUserSync(setUser, !!user);

  const openAuth = useCallback(() => setModalOpen(true), []);
  const closeAuth = useCallback(() => setModalOpen(false), []);
  const logout = useCallback(async () => {
    const { signOut } = await pbMod();
    return signOut();
  }, []);
  const refresh = useCallback(async () => {
    const { refreshUser } = await pbMod();
    const rec = await refreshUser();
    if (rec) setUser((prev) => mergeUser(prev, rec));
    return rec;
  }, []);

  return (
    <AuthCtx.Provider value={{ user, modalOpen, openAuth, closeAuth, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
