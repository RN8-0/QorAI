import { useCallback, useEffect, useState } from 'react';

// Compare list — product ids kept in localStorage so the selection
// survives navigation and is shared across the detail / compare pages.

const KEY = 'qor-compare';
const CAT_KEY = 'qor-compare-cat';
// No hard cap on the compare pool — users can stack as many same-category
// products as they like. Kept exported (large value) for any legacy callers
// that still read a max.
export const COMPARE_MAX = 999;
const EVT = 'qor-compare-change';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function readCat() {
  try { return localStorage.getItem(CAT_KEY) || ''; } catch { return ''; }
}
function write(ids, cat) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  // The pool is single-category: the first product sets it, an empty pool
  // clears it so the next product can start a fresh category.
  if (cat !== undefined) {
    if (cat) localStorage.setItem(CAT_KEY, cat);
    else localStorage.removeItem(CAT_KEY);
  }
  if (!ids.length) localStorage.removeItem(CAT_KEY);
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
  const clear = useCallback(() => write([], ''), []);

  // Category-aware add used by the card + button. The compare pool only holds
  // one category at a time (you can't compare a phone against a TV), so adding
  // a product from a different category is rejected with reason 'category'.
  const tryAdd = useCallback((product) => {
    const id = product && product.id;
    if (!id) return { ok: false, reason: 'invalid' };
    const cat = String(product.category || '').trim();
    const cur = read();
    if (cur.includes(id)) return { ok: true, already: true };
    const poolCat = readCat();
    if (cur.length && poolCat && cat && poolCat !== cat) {
      return { ok: false, reason: 'category', poolCat, cat };
    }
    if (cur.length >= COMPARE_MAX) return { ok: false, reason: 'full' };
    write([...cur, id], cat);
    return { ok: true };
  }, []);

  return { ids, has, toggle, add, tryAdd, remove, clear, max: COMPARE_MAX, category: readCat() };
}

// Replaces the whole compare selection — used to open a saved comparison.
export function setCompareList(ids) {
  write((ids || []).filter(Boolean).slice(0, COMPARE_MAX));
}
