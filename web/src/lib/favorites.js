import { useCallback, useEffect, useState } from 'react';

// Favorites — product ids in localStorage, shared across pages via a custom
// event (same pattern as the compare list).

const KEY = 'qor-favorites';
const EVT = 'qor-favorites-change';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(EVT));
}

export function useFavorites() {
  const [ids, setIds] = useState(read);

  useEffect(() => {
    const sync = () => setIds(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const has = useCallback((id) => ids.includes(id), [ids]);
  const toggle = useCallback((id) => {
    const cur = read();
    const i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1); else cur.push(id);
    write(cur);
  }, []);
  const remove = useCallback((id) => write(read().filter((x) => x !== id)), []);
  const clear = useCallback(() => write([]), []);

  return { ids, has, toggle, remove, clear };
}
