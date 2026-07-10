// Global "what is the user looking at right now" store. Each page sets a short
// text snapshot (via usePageContext) plus optional STRUCTURED metadata, and the
// AI chat bubble reads both: the text feeds the model as grounding, the metadata
// drives the page-aware greeting ("You're on the X page — ask me about …") and
// tells the chat which on-site products to ground answers on. Pages that don't
// set it fall back to the document title + path inside AiBubble.
import { useEffect } from 'react';

let _ctx = '';
// { kind, title, productIds?: string[], category?: string }
//   kind: 'product' | 'category' | 'categories' | 'compare' | 'blog'
//         | 'subscriptions' | 'link' | 'home' | 'quiz' | 'premium' | ''
let _meta = null;
const subs = new Set();

function emit() {
  subs.forEach((fn) => { try { fn(); } catch { /* listener errors are non-fatal */ } });
}

export function setPageContext(text, meta = null) {
  _ctx = String(text || '').slice(0, 4000);
  _meta = meta && typeof meta === 'object' ? meta : null;
  emit();
}
export function getPageContext() {
  return _ctx;
}
export function getPageMeta() {
  return _meta;
}

// Subscribe to any page-context change (text or meta). Returns an unsubscribe fn.
export function subscribePageContext(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Set the page context for as long as the component is mounted; clears on unmount
// so a stale snapshot never leaks into the next page.
export function usePageContext(text, meta = null) {
  const metaKey = meta ? JSON.stringify(meta) : '';
  useEffect(() => {
    setPageContext(text || '', meta || null);
    return () => setPageContext('', null);
    // metaKey captures deep meta changes without re-running on every render.
  }, [text, metaKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
