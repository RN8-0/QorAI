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
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' },
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
