import { useEffect } from 'react';

// Shared deep-link scroll for review threads. When the URL carries a
// `#rev-<id>` hash (set by "Yorumlarım" links in the Profile) and that review is
// present in the loaded list, scroll it into view and flash it once. Runs after
// the async review fetch resolves so the target row already exists in the DOM.
// `flashedRef` guards against re-flashing when the list is re-fetched.
export function useScrollToReviewHash(reviews, flashedRef) {
  useEffect(() => {
    if (!reviews || !reviews.length) return;
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const m = hash.match(/^#rev-(.+)$/);
    if (!m) return;
    const id = m[1];
    if (flashedRef.current === id) return;
    if (!reviews.some((r) => r.id === id)) return;
    flashedRef.current = id;
    requestAnimationFrame(() => {
      const el = document.getElementById(`rev-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('rv-flash');
      setTimeout(() => { el.classList.remove('rv-flash'); }, 2200);
    });
  }, [reviews]); // eslint-disable-line react-hooks/exhaustive-deps
}
