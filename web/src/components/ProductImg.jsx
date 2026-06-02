import { useState, useEffect } from 'react';
import { imageCandidates } from '../lib/imageUrl';
import { PLACEHOLDER_IMG } from '../lib/format';

// <img> that shows the sharpest available source variant and steps down through
// fallbacks on error (high-res → big → stored medium → placeholder), so a
// missing high-res variant never leaves a broken/blank image.
export default function ProductImg({ src, alt, className, style, size = 'card', eager = false }) {
  const list = src ? [...imageCandidates(src, size), PLACEHOLDER_IMG] : [PLACEHOLDER_IMG];
  const [i, setI] = useState(0);
  // Reset to the sharpest candidate whenever the source changes.
  useEffect(() => { setI(0); }, [src]);
  return (
    <img
      src={list[Math.min(i, list.length - 1)]}
      alt={alt || ''}
      className={className}
      style={style}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setI((n) => (n < list.length - 1 ? n + 1 : n))}
    />
  );
}
