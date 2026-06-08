import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthChange, signOut as pbSignOut, refreshUser } from './pocketbase';

const AuthCtx = createContext(null);

// Pulls a fresh user record from PocketBase whenever the tab regains focus or
// becomes visible. The mobile app writes to the same `users` row when the user
// spends Qor coins or upgrades to Premium, so without this sync the website
// would keep showing a stale balance / tier for the duration of the session.
function useUserSync(setUser) {
  useEffect(() => {
    let live = true;
    let inflight = false;
    async function pull() {
      if (inflight) return;
      inflight = true;
      try {
        const rec = await refreshUser();
        if (live && rec) setUser({ ...rec });
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

  useEffect(() => onAuthChange(setUser), []);
  useUserSync(setUser);

  const openAuth = useCallback(() => setModalOpen(true), []);
  const closeAuth = useCallback(() => setModalOpen(false), []);
  const logout = useCallback(() => pbSignOut(), []);
  const refresh = useCallback(async () => {
    const rec = await refreshUser();
    if (rec) setUser({ ...rec });
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
