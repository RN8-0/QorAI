// Shared formatting + category metadata helpers.

export const CATEGORY_META = {
  smartphones: { icon: '📱', label: 'Akıllı Telefon' },
  laptops: { icon: '💻', label: 'Laptop' },
  tablets: { icon: '📟', label: 'Tablet' },
  headphones: { icon: '🎧', label: 'Kulaklık' },
  gpus: { icon: '⚙️', label: 'Ekran Kartı' },
  cpus: { icon: '🧠', label: 'İşlemci' },
  monitors: { icon: '🖥️', label: 'Monitör' },
  tvs: { icon: '📺', label: 'TV' },
  smartwatches: { icon: '⌚', label: 'Akıllı Saat' },
  cameras: { icon: '📷', label: 'Kamera' },
  speakers: { icon: '🔊', label: 'Hoparlör' },
  keyboards: { icon: '⌨️', label: 'Klavye' },
  mice: { icon: '🖱️', label: 'Fare' },
};

export function catMeta(category) {
  const key = (category || '').toLowerCase();
  return CATEGORY_META[key] || { icon: '📦', label: category || 'Diğer' };
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
