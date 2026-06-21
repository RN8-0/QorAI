import { useEffect, useRef, useState } from 'react';

// Horizontal product/card rail with edge arrows — shared by the product page
// "Similar products" strip and the blog "Similar products" section so both use
// the exact same UI. Styling lives in styles/global.css (.rail, .pd-rail-*).
export default function ScrollRail({ children }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 8, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [children]); // eslint-disable-line
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * Math.max(320, ref.current.clientWidth * 0.85), behavior: 'smooth' });
  return (
    <div className="pd-rail-wrap">
      {edges.left && (
        <button type="button" className="pd-rail-arr pd-rail-prev" aria-label="‹" onClick={() => scroll(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
      )}
      <div className="rail" ref={ref}>{children}</div>
      {edges.right && (
        <button type="button" className="pd-rail-arr pd-rail-next" aria-label="›" onClick={() => scroll(1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </button>
      )}
    </div>
  );
}
