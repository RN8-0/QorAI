import { useEffect, useRef, useState } from 'react';

// Scroll-reveal wrapper — fades/slides children in when they enter the
// viewport. Used across pages for the modern entrance feel. Respects
// prefers-reduced-motion via the .rv CSS (animation disabled there).
//
//   <Reveal>…</Reveal>                 fade-up on enter
//   <Reveal delay={120}>…</Reveal>     staggered
//   <Reveal as="section" …>            custom wrapper tag
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setOn(true); return undefined; }
    // ESIKLER OLCULEREK DEGISTI (2026-08-16, canli, 390x844, Yavas 4G + 4x CPU,
    // scripts/_kaydirma_tani.mjs). Eski ayar `threshold: 0.12` +
    // `rootMargin: '0px 0px -36px 0px'` idi: bolum ekrana GIRDIKTEN sonra,
    // ustelik %12'si gorunur olunca aciliyor, sonra 0.65 sn'lik gecis
    // basliyordu. Olculen sonuc — ana sayfada tek bir hizli kaydirmada
    // EKRANIN TAMAMI (844 px) DOM'da ama `opacity: 0`; ayrica bir bolum
    // (162 px) 600 ms sonra bile hala kapaliydi (ekranda %12'yi hic
    // gecmedigi icin gozlemci hic tetiklenmemisti). Kullanicinin
    // "kaydirinca bolumler birkac saniye sonra beliriyor" sikayeti tam olarak
    // buydu — icerik geriden GELMIYOR, SAKLANIYOR.
    //
    // Yeni ayar: `threshold: 0` (bir pikseli yetsin) + 600 px'lik on-marj
    // (~0.7 ekran). Bolum goruntuye GIRMEDEN once acilir, animasyon ekran
    // disinda tamamlanir; kullanici hicbir zaman bos alan gormez. Acilis
    // animasyonu KAYBOLMAZ: ilk ekrandaki ogeler mount aninda kapali
    // basladigi icin girisini yine oynatir.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin: '600px 0px 600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`rv${on ? ' rv-in' : ''}${className ? ` ${className}` : ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>
      {children}
    </Tag>
  );
}
