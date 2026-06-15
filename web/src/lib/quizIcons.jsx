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
  data_scientist: (<><path d="M4 4v15a1 1 0 0 0 1 1h15" /><circle cx="8" cy="14" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" /><circle cx="18" cy="7" r="1" fill="currentColor" stroke="none" /></>),
  it_admin: (<><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><circle cx="7.6" cy="7" r=".9" fill="currentColor" stroke="none" /><circle cx="7.6" cy="17" r=".9" fill="currentColor" stroke="none" /><path d="M14 7h3M14 17h3" /></>),
  marketer: (<><path d="M3 10.5v3l3 .7 1.4 3.8h2l-1.1-3.4 8.7 2.1V6.3L6 8.5 3 10.5z" /><path d="M19.4 10a2.6 2.6 0 0 1 0 4" /></>),
  sales: (<><path d="M6 8h12l-1 11H7z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /><path d="M12 16.5v-4.5M10 14l2-2 2 2" /></>),
  consultant: (<><path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.1 1.2 1.3 2.4h5c.2-1.2.6-1.8 1.3-2.4A6 6 0 0 0 12 3z" /></>),
  architect: (<><circle cx="12" cy="5" r="1.7" /><path d="M12 6.7a1.7 1.7 0 0 1 1.5 2.4L17 17.8M12 6.7a1.7 1.7 0 0 0-1.5 2.4L7 17.8" /><path d="M9 14.5h6" /></>),
  scientist: (<><path d="M9.5 3h5M10.6 3v5L5.7 18.2A1.6 1.6 0 0 0 7.1 20.6h9.8a1.6 1.6 0 0 0 1.4-2.4L13.4 8V3" /><path d="M8.4 13h7.2" /></>),
  lawyer: (<><path d="M12 3.4V20M7 20h10M5 7h14" /><path d="M5 7 3 12a3 3 0 0 0 4 0zM19 7l-2 5a3 3 0 0 0 4 0z" /><circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" /></>),
  writer: (<><path d="M20 4c-7 1-11 5-13 11l-2 5" /><path d="M7 15c5-1 9-4 11-8M5.5 19.5 9 16" /></>),
  artist: (<><path d="M15.5 3.5 20.5 8.5 13 12 11 10z" /><path d="M9.6 11.4 4.9 16.1a2.5 2.5 0 1 0 3 3l4.7-4.7z" /></>),
  musician: (<><path d="M10 17V4l8-1.6" /><ellipse cx="7.4" cy="17.2" rx="2.6" ry="2.1" /><path d="M10 8l8-1.6" /></>),
  streamer: (<><circle cx="12" cy="12" r="2.6" /><path d="M7.7 7.7a6.2 6.2 0 0 0 0 8.6M16.3 7.7a6.2 6.2 0 0 1 0 8.6M5 5a9.9 9.9 0 0 0 0 14M19 5a9.9 9.9 0 0 1 0 14" /></>),
  other: (<><circle cx="12" cy="12" r="8.4" /><path d="M3.6 12h16.8M12 3.6c2.5 2.6 2.5 14.2 0 16.8M12 3.6c-2.5 2.6-2.5 14.2 0 16.8" /></>),

  // ── hobbies (each a distinct glyph — no repeated stars) ───────────────────────
  photography: CAMERA,
  video: CLAPPER,
  music: (<><circle cx="7" cy="17" r="2.4" /><circle cx="17.4" cy="15" r="2.4" /><path d="M9.4 17V6l10-2v11" /></>),
  coding: (<><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.4 5l-3 14" /></>),
  pc_building: (<><path d="M15.6 7.6a3.4 3.4 0 0 1-4.6 4.2L5 17.8 6.2 19l5.9-5.9a3.4 3.4 0 0 0 4.2-4.6l-2.1 2.1-1.6-.4-.3-1.6z" /></>),
  streaming: PLAY,
  fitness: (<><path d="M6.4 6.4v11M17.6 6.4v11M3.8 9v5M20.2 9v5M6.4 12h11.2" /></>),
  travel: (<><path d="M21 5 3 11.4l6.2 2 2 6.2 3.2-5.2z" /><path d="M9.2 13.4 14.4 9.8" /></>),
  reading: BOOK,
  smart_home: (<><path d="M4 11l8-6.6 8 6.6" /><path d="M6 9.6V20h12V9.6" /><path d="M9.8 13.9a3.2 3.2 0 0 1 4.4 0" /><circle cx="12" cy="16.7" r="1" fill="currentColor" stroke="none" /></>),
  diy: (<><path d="M14.2 7.2 17.4 4l2.6 2.6-3.2 3.2-1.3-1.3-7.6 7.6-1.4-1.4 7.6-7.6z" /><path d="M4.6 16.8 7 19.2" /></>),
  cooking: (<><path d="M4 12h12a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M16 12h2.4a2 2 0 1 0 0-4H18" /><path d="M7.6 8.6c0-1.4 1-2 1-3.2M11 8.6c0-1.4 1-2 1-3.2" /></>),
  esports: (<><path d="M8 4h8v4a4 4 0 0 1-8 0z" /><path d="M8 5.5H5.2v1.3A2.8 2.8 0 0 0 8 9.6M16 5.5h2.8v1.3A2.8 2.8 0 0 1 16 9.6" /><path d="M12 12v3M10.2 20h3.6l-.7-3h-2.2z" /></>),
  cars: (<><path d="M4 16v-2.4l1.8-4.2A2 2 0 0 1 7.6 8h8.8a2 2 0 0 1 1.8 1.4L20 13.6V16" /><path d="M3.5 16h17" /><circle cx="7.5" cy="16.4" r="1.6" /><circle cx="16.5" cy="16.4" r="1.6" /></>),
  outdoors: (<><path d="M3 19h18L14 8l-3 4.5L9 10z" /><circle cx="7" cy="6.6" r="2" /></>),
  cycling: (<><circle cx="6" cy="16.5" r="3.2" /><circle cx="18" cy="16.5" r="3.2" /><path d="M6 16.5l4-7.5h4.6M9 9h4.2M14.6 9 18 16.5M13.2 9l1.6 3.8-5 3.7" /></>),
  investing: (<><path d="M4 4v15a1 1 0 0 0 1 1h15" /><rect x="7" y="9" width="2.4" height="5" rx=".5" /><path d="M8.2 6.6v2.4M8.2 14v2.4" /><rect x="14" y="11" width="2.4" height="5" rx=".5" /><path d="M15.2 8v3M15.2 16v2" /></>),
  anime: (<><path d="M4 5h16v11h-7l-4 3v-3H4z" /><path d="M12 8l1 2 2 .2-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 10.2l2-.2z" /></>),
  board_games: (<><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" /></>),
  podcasting: (<><rect x="9.5" y="3" width="5" height="9" rx="2.5" /><path d="M7 10.5a5 5 0 0 0 10 0M12 15.5V19M9.5 19h5" /><path d="M4.6 9v1.6M19.4 9v1.6" /></>),
  gardening: (<><path d="M12 21v-7" /><path d="M12 14c0-2.8 1.9-4.8 4.8-4.8 0 2.8-1.9 4.8-4.8 4.8zM12 16c0-2.8-1.9-4.8-4.8-4.8 0 2.8 1.9 4.8 4.8 4.8z" /><path d="M8.5 21h7" /></>),
  fashion: (<><path d="M9 4 4.5 7l2.2 3.2L9 9.2V20h6V9.2l2.3 1L19.5 7 15 4a3 3 0 0 1-6 0z" /></>),

  // ── category fallbacks (only when a product image is missing) ────────────────
  smartphones: (<><rect x="7" y="3" width="10" height="18" rx="2.6" /><path d="M11 18h2" /></>),
  tablets: (<><rect x="5" y="3" width="14" height="18" rx="2.4" /><path d="M11 18h2" /></>),
  laptops: (<><rect x="4.5" y="5" width="15" height="10.5" rx="1.8" /><path d="M2.5 19h19" /></>),
  desktops: (<><rect x="2.5" y="4.5" width="12" height="8.6" rx="1.4" /><path d="M8.5 13.1v2M5.5 16h6" /><rect x="16.5" y="4.5" width="5" height="14" rx="1.2" /><path d="M18 7h2M18 9.5h2" /><circle cx="19" cy="15.6" r="1" /></>),
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
  'action-cameras': (<><rect x="5" y="7" width="12" height="10" rx="2" /><circle cx="10" cy="12" r="3" /><path d="M17 9.5l3-1.5v8l-3-1.5z" /></>),
  'security-cameras': (<><path d="M3.5 8.6l13-3.6 1.3 4.3-13 3.6z" /><circle cx="9" cy="9.3" r="1.4" /><path d="M5.4 13.6v3.4M8.6 17H2.9" /></>),
  'ip-cameras': (<><path d="M4 6h16" /><path d="M6 6a6 6 0 0 0 12 0" /><circle cx="12" cy="9.4" r="2.1" /><path d="M9.6 18.4a4 4 0 0 1 4.8 0" /></>),
  dashcams: (<><rect x="4.5" y="8" width="11" height="8.4" rx="2" /><circle cx="10" cy="12.2" r="2.6" /><path d="M15.5 10.4h3.6v4h-3.6" /><path d="M8 8V6.2h6.4" /></>),
  gimbals: (<><circle cx="12" cy="6" r="2" /><path d="M12 8v5M8 13h8M10 13v6M14 13v6" /></>),
  tripods: (<><circle cx="12" cy="5" r="1.7" /><path d="M12 6.5v6.5M12 13 6.5 20M12 13l5.5 7M8.5 16h7" /></>),
  lenses: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M12 4v3M20 12h-3M12 20v-3M4 12h3" /></>),
  consoles: (<><rect x="3" y="6.5" width="18" height="11" rx="2.5" /><circle cx="8" cy="12" r="2.2" /><path d="M14 10.5h4M14 13.5h4M11 9.6v4.8" /></>),
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
