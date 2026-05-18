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

export const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2352525b' stroke-width='1.4'%3E%3Crect x='2' y='2' width='20' height='20' rx='3'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";
