// Shared formatting + category metadata helpers.

// Icon + display label per category. Labels are intentionally English
// here (category names are universal-ish); the icon is the main signal.
export const CATEGORY_META = {
  smartphones: { icon: '📱', label: 'Smartphones' },
  laptops: { icon: '💻', label: 'Laptops' },
  tablets: { icon: '📟', label: 'Tablets' },
  headphones: { icon: '🎧', label: 'Headphones' },
  earbuds: { icon: '🎧', label: 'Earbuds' },
  gpus: { icon: '🎮', label: 'Graphics Cards' },
  cpus: { icon: '🧠', label: 'Processors' },
  motherboards: { icon: '🔲', label: 'Motherboards' },
  ram: { icon: '💾', label: 'RAM' },
  storage: { icon: '💿', label: 'Storage' },
  ssds: { icon: '💿', label: 'SSDs' },
  psus: { icon: '🔌', label: 'Power Supplies' },
  cases: { icon: '🗄️', label: 'PC Cases' },
  cpu_coolers: { icon: '❄️', label: 'CPU Coolers' },
  coolers: { icon: '❄️', label: 'Coolers' },
  desktops: { icon: '🖥️', label: 'Desktops' },
  monitors: { icon: '🖥️', label: 'Monitors' },
  tvs: { icon: '📺', label: 'TVs' },
  smartwatches: { icon: '⌚', label: 'Smartwatches' },
  cameras: { icon: '📷', label: 'Cameras' },
  speakers: { icon: '🔊', label: 'Speakers' },
  keyboards: { icon: '⌨️', label: 'Keyboards' },
  mice: { icon: '🖱️', label: 'Mice' },
  consoles: { icon: '🎮', label: 'Consoles' },
  printers: { icon: '🖨️', label: 'Printers' },
};

// Turns an unknown slug like "cpu_coolers" into "Cpu Coolers".
function prettifySlug(slug) {
  return String(slug || 'Other')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function catMeta(category) {
  const key = (category || '').toLowerCase();
  return CATEGORY_META[key] || { icon: '📦', label: prettifySlug(category) };
}

export function scoreClass(score) {
  const s = Number(score);
  if (!s || s <= 0) return 'score-na';
  if (s >= 75) return 'score-high';
  if (s >= 55) return 'score-mid';
  return 'score-low';
}

export function scoreLabel(score) {
  const s = Number(score);
  if (!s || s <= 0) return 'N/A';
  return Math.round(s);
}

export function formatCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M+';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K+';
  return String(n || 0);
}

// Lowest tracked price (USD). Returns '' when unknown so cards can hide it.
export function formatPrice(usd) {
  const n = Number(usd);
  if (!n || n <= 0) return '';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const clamp = (n) => Math.max(6, Math.min(100, Math.round(n)));

// Pulls the four headline specs (screen / RAM / storage / battery) from a
// product's Typesense fields — used for the epey-style inline spec rows.
// Each chip carries a 0–100 `pct` so cards can draw a relative mini bar.
export function keySpecChips(p) {
  const tokens = Array.isArray(p.filterTokens) ? p.filterTokens : [];
  const tokenVal = (prefix) => {
    const t = tokens.find((x) => x.startsWith(prefix));
    return t ? t.slice(prefix.length) : null;
  };
  const chips = [];

  if (p.screenSizeValue > 0) {
    chips.push({ labelKey: 'spec.screen', value: `${p.screenSizeValue}"`, pct: clamp((p.screenSizeValue / 7) * 100) });
  }

  const ram = tokenVal('ram:'); // e.g. "8_gb"
  if (ram) {
    const n = parseInt(ram, 10) || 0;
    chips.push({ labelKey: 'spec.ram', value: `${n} GB`, pct: clamp((n / 24) * 100) });
  }

  const storage = tokenVal('storage:'); // "256_gb" | "1_tb"
  if (storage) {
    const isTb = storage.includes('tb');
    const n = parseInt(storage, 10) || 0;
    const gb = isTb ? n * 1024 : n;
    chips.push({ labelKey: 'spec.storage', value: isTb ? `${n} TB` : `${n} GB`, pct: clamp((gb / 1024) * 100) });
  }

  if (p.batteryCapacityValue > 0) {
    chips.push({
      labelKey: 'spec.battery',
      value: `${p.batteryCapacityValue} mAh`,
      pct: clamp((p.batteryCapacityValue / 7000) * 100),
    });
  }
  return chips;
}

export const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2352525b' stroke-width='1.4'%3E%3Crect x='2' y='2' width='20' height='20' rx='3'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";
