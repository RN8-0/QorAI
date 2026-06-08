import { useCallback, useEffect, useState } from 'react';
import { pb } from './pocketbase';
import { useAuth } from './auth.jsx';

// Favorites — synced with the mobile app. The app stores favorites as a
// `favorites` string array on the user record (pb_ds.toggleFavorite), so when
// the visitor is signed in we read/write that same field; signed-out visitors
// fall back to localStorage so the heart still works before login.

const KEY = 'qor-favorites';
const EVT = 'qor-favorites-change';

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function writeLocal(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(EVT));
}

export function useFavorites() {
  const { user } = useAuth();
  const loggedIn = !!user;
  const [ids, setIds] = useState(() => (loggedIn ? (user.favorites || []) : readLocal()));

  // Re-sync when auth state or the user's favorites change (login/logout/app edit).
  useEffect(() => {
    setIds(loggedIn ? (user.favorites || []) : readLocal());
  }, [loggedIn, user?.id, (user?.favorites || []).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Signed-out: keep multiple tabs / components in sync via the local event.
  useEffect(() => {
    if (loggedIn) return undefined;
    const sync = () => setIds(readLocal());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [loggedIn]);

  const has = useCallback((id) => ids.includes(id), [ids]);

  const toggle = useCallback((id) => {
    setIds((cur) => {
      const i = cur.indexOf(id);
      const next = i >= 0 ? cur.filter((x) => x !== id) : [...cur, id];
      if (loggedIn) {
        pb.collection('users').update(user.id, { favorites: next }).catch(() => {});
      } else {
        writeLocal(next);
      }
      return next;
    });
  }, [loggedIn, user?.id]);

  return { ids, has, toggle };
}
