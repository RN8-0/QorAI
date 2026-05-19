import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT } from '../lib/ads';
import './AdSlot.css';

// A single responsive AdSense display unit. Renders nothing until a real
// ad-unit `slot` ID is supplied (see lib/ads.js) — Auto Ads still run via
// the loader script in index.html, so monetisation works regardless.
export default function AdSlot({ slot, className = '' }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!slot || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch { /* adblock or script not ready — ignore */ }
  }, [slot]);

  if (!slot) return null;

  return (
    <div className={`adslot ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
