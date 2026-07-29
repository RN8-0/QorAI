import { useState, useEffect } from 'react';
import { imageCandidates, imageSrcSet } from '../lib/imageUrl';
import { PLACEHOLDER_IMG } from '../lib/format';

// Her slot için tarayıcıya "bu görsel ekranda kaç piksel olacak" bilgisi.
// `srcset` ile birlikte, cihaz piksel oranına göre EN KÜÇÜK yeterli dosya
// indirilir — mobilde masaüstü boyutunda görsel inmesi böylece biter.
// Değerler CANLIDA ÖLÇÜLDÜ (kart görseli 375px viewport'ta 114px = ~30vw,
// masaüstünde 136px). `sizes` gerçekten geniş verilirse tarayıcı gereğinden
// büyük basamağı indirir — ilk denemede 45vw yazdığım için mobilde 260 yerine
// 420 iniyordu. Ölçülen orana çekildi.
const SIZES = {
  thumb: '40px',
  list: '(max-width: 640px) 96px, 140px',
  card: '(max-width: 640px) 31vw, (max-width: 1024px) 24vw, 150px',
  full: '(max-width: 900px) 92vw, 420px',
};
// NOT: `width`/`height` attribute'u BİLEREK verilmiyor. global.css yalnızca
// `img { max-width: 100% }` tanımlıyor; bazı slotlarda (Compare thumb, Home
// rail, CompareBar, Profile) konteyner img'e width/height dayatmıyor, dolayısıyla
// attribute vermek görselleri o ölçüye SABİTLEYİP düzeni bozuyordu. CLS'i
// düzeltmenin doğru yolu bu slotlara CSS kutusu vermek — ayrı iş.

// <img> that shows the sharpest available source variant and steps down through
// fallbacks on error (high-res -> big -> stored medium -> placeholder), so a
// missing high-res variant never leaves a broken/blank image.
export default function ProductImg({ src, alt, className, style, size = 'card', eager = false }) {
  const list = src ? [...imageCandidates(src, size), PLACEHOLDER_IMG] : [PLACEHOLDER_IMG];
  const [i, setI] = useState(0);
  // Reset to the sharpest candidate whenever the source changes.
  useEffect(() => { setI(0); }, [src]);
  const current = list[Math.min(i, list.length - 1)];
  // srcset SADECE proxy adayı kullanılırken anlamlı: basamakları wsrv.nl
  // üretiyor. Doğrudan Epey URL'i kullanılıyorsa (normal durum) srcset
  // verilmez — verilse tarayıcı çalışmayan proxy basamağını seçip yine
  // hataya düşerdi. Proxy'ye gerçekten düşüldüğünde devreye girer.
  const srcSet = src && String(current).includes('wsrv.nl') ? imageSrcSet(src, size) : '';
  return (
    <img
      src={current}
      {...(srcSet ? { srcSet, sizes: SIZES[size] || SIZES.card } : {})}
      alt={alt || ''}
      className={className}
      style={style}
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager ? 'high' : 'auto'}
      decoding="async"
      onError={() => setI((n) => (n < list.length - 1 ? n + 1 : n))}
    />
  );
}
