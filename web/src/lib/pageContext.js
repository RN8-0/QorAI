// Global "what is the user looking at right now" store. Each page sets a short
// text snapshot (via usePageContext) and the AI chat bubble reads it on every
// message, so the assistant can read and comment on the current page — product,
// category, comparison, blog article, etc. Pages that don't set it fall back to
// the document title + path inside AiBubble.
import { useEffect } from 'react';

let _ctx = '';

export function setPageContext(text) {
  _ctx = String(text || '').slice(0, 4000);
}
export function getPageContext() {
  return _ctx;
}

// Set the page context for as long as the component is mounted; clears on unmount
// so a stale snapshot never leaks into the next page.
export function usePageContext(text) {
  useEffect(() => {
    setPageContext(text || '');
    return () => { setPageContext(''); };
  }, [text]);
}
