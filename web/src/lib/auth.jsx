import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthChange, signOut as pbSignOut, refreshUser } from './pocketbase';

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
function useUserSync(setUser) {
  useEffect(() => {
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
        const rec = await refreshUser();
        // mergeUser keeps the previous reference when the data is unchanged, so a
        // no-op refresh doesn't churn the user object and re-run dependent effects.
        if (live && rec) setUser((prev) => mergeUser(prev, rec));
      } finally {
        inflight = false;
      }
    }
    pull();
    const onVisibility = () => { if (!document.hidden) pull(); };
    const onFocus = () => pull();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [setUser]);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Merge auth-store updates over the previous user (clearing only on sign-out)
  // so a partial record never erases a known-good field like the coin balance.
  useEffect(() => onAuthChange((u) => setUser((prev) => (u ? mergeUser(prev, u) : null))), []);
  useUserSync(setUser);

  const openAuth = useCallback(() => setModalOpen(true), []);
  const closeAuth = useCallback(() => setModalOpen(false), []);
  const logout = useCallback(() => pbSignOut(), []);
  const refresh = useCallback(async () => {
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
