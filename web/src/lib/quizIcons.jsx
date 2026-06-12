// Crisp glyphs for the onboarding quiz circles, so every option shows a real
// graphic instead of a bare text mark (the old behaviour that made the web quiz
// look cheap next to the app).
//
//  • ecosystem  → real brand logos (Apple, Android, Samsung, Google, Xiaomi,
//                 Huawei via simpleicons; Windows / Mixed inline) — matches the
//                 app's brand-logo treatment.
//  • everything → clean inline stroke icons (budget, priorities, usage,
//    else        profession) + category fallbacks when a product image is
//                 missing. Icons inherit `currentColor` so the theme controls
//                 the tint.
//
// Category and device steps render real product images first (see Quiz.jsx);
// these icons are only the fallback there, but the *primary* visual for the
// non-catalog steps.

import { useEffect, useState } from 'react';

const BRANDS = {
  apple: { slug: 'apple', color: '111111' },
  android: { slug: 'android', color: '3DDC84' },
  samsung: { slug: 'samsung', color: '1428A0' },
  google: { slug: 'google', color: '4285F4' },
  xiaomi: { slug: 'xiaomi', color: 'FF6900' },
  huawei: { slug: 'huawei', color: 'C7000B' },
};

function Svg({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

// Reusable shapes (so families share one drawing).
const GAMEPAD = (<><rect x="3" y="8" width="18" height="9" rx="4.5" /><path d="M7.5 11v3M6 12.5h3" /><circle cx="15.5" cy="11.5" r="1.05" fill="currentColor" stroke="none" /><circle cx="17.6" cy="13.6" r="1.05" fill="currentColor" stroke="none" /></>);
const CAMERA = (<><rect x="3" y="7" width="18" height="12" rx="2.2" /><path d="M8.2 7l1.4-2.2h4.8L15.8 7" /><circle cx="12" cy="13" r="3.2" /></>);
const CLAPPER = (<><rect x="3" y="8" width="18" height="11" rx="1.8" /><path d="M3.4 8l3-3.6 3.4 3.6M9.4 4.4l3.4 3.6M14.4 4.4 17.8 8" /></>);
const BRIEFCASE = (<><rect x="3" y="7.5" width="18" height="11.5" rx="2" /><path d="M8.5 7.5V5.6c0-.6.4-1 1-1h5c.6 0 1 .4 1 1v1.9M3 12.5h18" /></>);
const BOOK = (<><path d="M12 6.2C10 5 7.4 4.6 5 5.2v12c2.4-.6 5-.2 7 1 2-1.2 4.6-1.6 7-1v-12c-2.4-.6-5-.2-7 1z" /><path d="M12 6.2V18" /></>);
const PLAY = (<><circle cx="12" cy="12" r="8.4" /><path d="M10.4 9 15 12l-4.6 3z" fill="currentColor" stroke="none" /></>);
const BATTERY = (<><rect x="2.6" y="8" width="15.4" height="8" rx="2" /><path d="M20.4 11v2" /><path d="M9.6 9.6 7.4 13.2h2.6l-2.2 3.4" /></>);

const ICONS = {
  _default: (<><path d="M12 3.4l1.9 4.9 5.2.3-4 3.4 1.3 5L12 14.6 7.6 17.4l1.3-5-4-3.4 5.2-.3z" /></>),
  none: (<><circle cx="12" cy="12" r="8.4" /><path d="M6.6 6.6l10.8 10.8" /></>),

  // ── ecosystem inline (brand-coloured) ─────────────────────────────────────
  windows: (<><rect x="3.6" y="3.6" width="7.4" height="7.4" rx="1" /><rect x="13" y="3.6" width="7.4" height="7.4" rx="1" /><rect x="3.6" y="13" width="7.4" height="7.4" rx="1" /><rect x="13" y="13" width="7.4" height="7.4" rx="1" /></>),
  mixed: (<><path d="M12 3 3 7.7l9 4.7 9-4.7z" /><path d="M3 12.3l9 4.7 9-4.7M3 16.6l9 4.7 9-4.7" /></>),

  // ── budget ─────────────────────────────────────────────────────────────────
  low: (<><circle cx="12" cy="12" r="8.2" /><path d="M12 7.4v9.2M14.4 9.3c-.6-.9-1.5-1.3-2.6-1.3-1.4 0-2.5.8-2.5 2 0 2.6 5.2 1.4 5.2 4 0 1.2-1.1 2-2.7 2-1.1 0-2.1-.4-2.7-1.3" /></>),
  mid: (<><path d="M12 4v15M6 19h12M5 8.5h14" /><path d="M5 8.5 2.8 13.5h4.4zM19 8.5l-2.2 5h4.4z" /></>),
  high: (<><path d="M4 15.5l5-5 3 3 6.5-7.5" /><path d="M15 6h5v5" /></>),
  premium: (<><path d="M3.8 8l3.7 3.1L12 5l4.5 6.1L20.2 8l-1.5 11.2H5.3z" /></>),
  any: (<><path d="M4 8h8M19 8h1M4 16h1M11 16h9" /><circle cx="15.5" cy="8" r="2.2" /><circle cx="7.5" cy="16" r="2.2" /></>),

  // ── priorities ──────────────────────────────────────────────────────────────
  price: (<><path d="M4.2 12.6 12.6 4.2H20v7.4l-8.4 8.4z" /><circle cx="16" cy="8" r="1.4" /></>),
  quality: (<><path d="M12 4l2.3 4.9 5.4.5-4.1 3.6 1.2 5.3L12 16.1 7.2 18.3l1.2-5.3L4.3 9.4l5.4-.5z" /></>),
  design: (<><path d="M12 3.2c-5 0-9 3.9-9 8.8 0 4.9 4 6 6 6 1.2 0 1.6-.7 1.6-1.6 0-1.5.9-2.2 2.4-2.2H17c2.2 0 4-1.8 4-4 0-3.9-4-7-9-7z" /><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="11" r="1" fill="currentColor" stroke="none" /></>),
  ecosystem: (<><path d="M9.5 12h5" /><path d="M10 8H7.5a4 4 0 0 0 0 8H10M14 8h2.5a4 4 0 0 1 0 8H14" /></>),
  performance: (<><path d="M13 3 5 13h5l-1 8 8-10.5h-5z" /></>),
  durability: (<><path d="M12 3 5 6v5.2c0 4.4 3 7.4 7 8.8 4-1.4 7-4.4 7-8.8V6z" /><path d="M9.3 12l1.9 1.9 3.4-3.8" /></>),
  battery: BATTERY,
  camera: CAMERA,
  portability: (<><path d="M20 4.2a6 6 0 0 0-8.5 0L4 11.7V20h8.3l7.7-7.5a6 6 0 0 0 0-8.3z" /><path d="M16.5 7.5 8 16M5 19l5-5" /></>),
  gaming: GAMEPAD,
  creator: CLAPPER,
  productivity: (<><rect x="6" y="4" width="12" height="17" rx="2.2" /><path d="M9 4.4h6V7H9z" /><path d="M9.4 13.2l2 2 3.4-4" /></>),

  // ── usage intent ────────────────────────────────────────────────────────────
  gaming_setup: GAMEPAD,
  creator_setup: CLAPPER,
  productivity_setup: BRIEFCASE,
  entertainment_setup: PLAY,
  price_tracking: (<><path d="M4 8l5 5 3-3 6.5 7.5" /><path d="M14.5 17.5H20V12" /></>),
  all: (<><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></>),

  // ── profession ──────────────────────────────────────────────────────────────
  student: (<><path d="M12 5 2.6 9 12 13l9.4-4z" /><path d="M6.2 11v4.1c0 1.4 2.6 2.9 5.8 2.9s5.8-1.5 5.8-2.9V11M21.4 9v5.2" /></>),
  engineer: (<><circle cx="12" cy="12" r="3.1" /><path d="M12 3.2v2.6M12 18.2v2.6M3.2 12h2.6M18.2 12h2.6M5.8 5.8l1.9 1.9M16.3 16.3l1.9 1.9M18.2 5.8l-1.9 1.9M7.7 16.3l-1.9 1.9" /></>),
  designer: (<><path d="M5 19l1.2-4.2L16.5 4.5l3 3L9.2 17.8z" /><path d="M14 7l3 3" /></>),
  developer: (<><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" /></>),
  content_creator: (<><rect x="3" y="7" width="13" height="10" rx="2" /><path d="M16 11.2 21 8v8l-5-3.2z" /></>),
  video_editor: (<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4" /></>),
  photographer: CAMERA,
  gamer: GAMEPAD,
  manager: BRIEFCASE,
  product_manager: (<><circle cx="12" cy="12" r="8.4" /><path d="M15.6 8.4 10.8 11 8.4 15.6 13.2 13z" fill="currentColor" stroke="none" /></>),
  entrepreneur: (<><path d="M12 3.2c3 1.6 5 4.6 5 8.1 0 2-1 3.9-2.4 5.4H9.4C8 15.2 7 13.3 7 11.3c0-3.5 2-6.5 5-8.1z" /><circle cx="12" cy="10" r="1.7" /><path d="M9.4 16.7 8 20M14.6 16.7 16 20" /></>),
  healthcare: (<><path d="M12 20S4.5 15.4 4.5 9.9A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7.5 1.9c0 .8-.2 1.7-.5 2.5" /><path d="M8 12.6h2l1.4-2.4L13 15l1.3-2.4h3" /></>),
  teacher: BOOK,
  finance: (<><path d="M4 20h16" /><path d="M6 18v-5.5M11 18V9M16 18V6" /><path d="M5 13l4-3.5 3 2 5-5" /></>),
  other: (<><circle cx="12" cy="12" r="8.4" /><path d="M3.6 12h16.8M12 3.6c2.5 2.6 2.5 14.2 0 16.8M12 3.6c-2.5 2.6-2.5 14.2 0 16.8" /></>),

  // ── category fallbacks (only when a product image is missing) ────────────────
  smartphones: (<><rect x="7" y="3" width="10" height="18" rx="2.6" /><path d="M11 18h2" /></>),
  tablets: (<><rect x="5" y="3" width="14" height="18" rx="2.4" /><path d="M11 18h2" /></>),
  laptops: (<><rect x="4.5" y="5" width="15" height="10.5" rx="1.8" /><path d="M2.5 19h19" /></>),
  desktops: (<><rect x="4" y="4" width="16" height="11" rx="1.8" /><path d="M9 19h6M10 15v4M14 15v4" /></>),
  monitors: (<><rect x="4" y="4" width="16" height="11" rx="1.8" /><path d="M9 19h6M10 15v4M14 15v4" /></>),
  tvs: (<><rect x="3" y="5" width="18" height="12" rx="1.8" /><path d="M8 21h8M12 17v4" /></>),
  cpus: (<><rect x="7" y="7" width="10" height="10" rx="1.6" /><rect x="10" y="10" width="4" height="4" rx="0.8" /><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" /></>),
  gpus: (<><rect x="3" y="7" width="16" height="10" rx="1.6" /><circle cx="8" cy="12" r="2.2" /><circle cx="14" cy="12" r="2.2" /><path d="M19 9h2v10H6" /></>),
  ram: (<><rect x="3" y="8" width="18" height="8" rx="1.2" /><path d="M7 8v8M11 8v8M15 8v8M5 16v2M9 16v2M13 16v2M17 16v2" /></>),
  ssd: (<><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M8.5 6v12" /><circle cx="14.5" cy="12" r="1.3" /></>),
  motherboards: (<><rect x="4" y="4" width="16" height="16" rx="1.8" /><rect x="7" y="7" width="6" height="6" rx="1" /><path d="M16 7h1M16 10h1M16 13h1M7 16h10" /></>),
  psu: (<><rect x="4" y="6" width="16" height="12" rx="2" /><circle cx="9" cy="12" r="2.6" /><path d="M14.5 10h3.5M14.5 14h3.5" /></>),
  cases: (<><rect x="6" y="3" width="12" height="18" rx="1.8" /><path d="M9 7h6M9 10.5h6" /><circle cx="12" cy="16" r="1.3" /></>),
  coolers: (<><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" /></>),
  keyboards: (<><rect x="3" y="7" width="18" height="10" rx="1.8" /><path d="M6.5 11h.01M10 11h.01M13.5 11h.01M17 11h.01M8 14h8" /></>),
  mice: (<><rect x="8" y="4" width="8" height="16" rx="4" /><path d="M12 4.5v5" /></>),
  webcams: (<><circle cx="12" cy="11" r="6" /><circle cx="12" cy="11" r="2.2" /><path d="M9 19h6" /></>),
  printers: (<><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="7" rx="1.6" /><rect x="7" y="14" width="10" height="6" rx="1" /><path d="M16.5 11.5h.01" /></>),
  projectors: (<><rect x="3" y="8" width="18" height="12" rx="1.8" /><path d="M8 21h8M12 17v3" /></>),
  'media-players': PLAY,
  headphones: (<><path d="M5 13v-1a7 7 0 0 1 14 0v1" /><rect x="3.4" y="13" width="3.6" height="6.2" rx="1.5" /><rect x="17" y="13" width="3.6" height="6.2" rx="1.5" /></>),
  speakers: (<><rect x="6" y="3" width="12" height="18" rx="2" /><circle cx="12" cy="15" r="3" /><circle cx="12" cy="7.5" r="1.2" /></>),
  soundbars: (<><rect x="3" y="9" width="18" height="6" rx="3" /><circle cx="8" cy="12" r="1.3" /><circle cx="16" cy="12" r="1.3" /></>),
  microphones: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" /></>),
  smartwatches: (<><rect x="7" y="7" width="10" height="10" rx="2.6" /><path d="M9 7l.6-3h4.8l.6 3M9 17l.6 3h4.8l.6-3" /></>),
  'smart-rings': (<><circle cx="12" cy="13" r="6" /><circle cx="12" cy="13" r="3.2" /></>),
  cameras: CAMERA,
  'action-cameras': CAMERA,
  'security-cameras': CAMERA,
  'ip-cameras': CAMERA,
  dashcams: CAMERA,
  gimbals: (<><circle cx="12" cy="6" r="2" /><path d="M12 8v5M8 13h8M10 13v6M14 13v6" /></>),
  tripods: (<><circle cx="12" cy="5" r="1.7" /><path d="M12 6.5v6.5M12 13 6.5 20M12 13l5.5 7M8.5 16h7" /></>),
  lenses: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M12 4v3M20 12h-3M12 20v-3M4 12h3" /></>),
  consoles: GAMEPAD,
  gamepads: GAMEPAD,
  'vr-headsets': (<><rect x="3" y="8" width="18" height="9" rx="3" /><path d="M9 17c0-1.5-1-2.5-3-2.5M15 17c0-1.5 1-2.5 3-2.5" /></>),
  routers: (<><path d="M5 12a10 10 0 0 1 14 0M8 15a6 6 0 0 1 8 0" /><circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none" /></>),
  'robot-vacuums': (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M9 5.6 10 8M15 5.6 14 8" /></>),
  powerbanks: BATTERY,
  'e-readers': BOOK,
  drones: (<><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="18" r="2.2" /><rect x="9" y="9" width="6" height="6" rx="1.5" /><path d="M7.6 7.6 9 9M16.4 7.6 15 9M7.6 16.4 9 15M16.4 16.4 15 15" /></>),
};

function BrandLogo({ brand, name }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [name]);
  if (failed) return <Svg>{ICONS._default}</Svg>;
  return (
    <img
      className="quiz-brand-img"
      src={`https://cdn.simpleicons.org/${brand.slug}/${brand.color}`}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

// Returns the inner glyph for a quiz option. Ecosystem brands resolve to real
// logos; every other value resolves to an inline icon (with a sparkle default).
export function QuizGlyph({ field, value }) {
  if (field === 'ecosystem' && BRANDS[value]) {
    return <BrandLogo brand={BRANDS[value]} name={value} />;
  }
  return <Svg>{ICONS[value] || ICONS._default}</Svg>;
}

export function hasGlyph(value) {
  return Boolean(ICONS[value]);
}
