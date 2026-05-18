import { useCallback, useEffect, useState } from 'react';

// Compare list — product ids kept in localStorage so the selection
// survives navigation and is shared across the detail / compare pages.

const KEY = 'qor-compare';
export const COMPARE_MAX = 4;
const EVT = 'qor-compare-change';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(EVT));
}

export function useCompare() {
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

  // Returns false when the list is already full.
  const toggle = useCallback((id) => {
    const cur = read();
    const i = cur.indexOf(id);
    if (i >= 0) { cur.splice(i, 1); }
    else { if (cur.length >= COMPARE_MAX) return false; cur.push(id); }
    write(cur);
    return true;
  }, []);

  const add = useCallback((id) => {
    const cur = read();
    if (cur.includes(id)) return true;
    if (cur.length >= COMPARE_MAX) return false;
    write([...cur, id]);
    return true;
  }, []);

  const remove = useCallback((id) => write(read().filter((x) => x !== id)), []);
  const clear = useCallback(() => write([]), []);

  return { ids, has, toggle, add, remove, clear, max: COMPARE_MAX };
}
