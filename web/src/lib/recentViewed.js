// Recently viewed products — kept in localStorage so it works for guests
// and is instant. A light snapshot of each product is stored so the home
// page can render the "Recently Viewed" row without extra requests. When
// signed in it also writes to the PocketBase `recently_viewed` collection
// the mobile app uses, so history syncs across web + app.

// Bu modul Home.jsx'ten statik iniyor ama PocketBase'i YALNIZ syncToPb()
// kullaniyor (oturum acikken, urune tiklandiginda). SDK'yi statik cekmek onu
// kritik yolda tutuyordu — bkz. lib/pbLazy.js.
import { pbMod } from './pbLazy';
import { seedAuth } from './authSeed';

const KEY = 'qor-recent';        // legacy id-only list (kept for migration)
const ITEMS_KEY = 'qor-recent-items';
const MAX = 20;

// Light fields the home grid card needs — never the full spec blob.
function lightSnapshot(p) {
  return {
    id: p.id, name: p.name, brand: p.brand, category: p.category,
    subcategory: p.subcategory, slug: p.slug, imageUrl: p.imageUrl,
    techScore: p.techScore, trendScore: p.trendScore,
    price_segment: p.price_segment, lowestPriceUSD: p.lowestPriceUSD,
    filterTokens: p.filterTokens, screenSizeValue: p.screenSizeValue,
    batteryCapacityValue: p.batteryCapacityValue, weightValueKg: p.weightValueKg,
  };
}

export function getRecentProducts() {
  try {
    const v = JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((p) => p && p.id) : [];
  } catch {
    return [];
  }
}

export function getRecentIds() {
  return getRecentProducts().map((p) => p.id);
}

// Distinct recently-viewed categories — drives the "For You" personalisation.
export function getRecentCategories() {
  const seen = [];
  for (const p of getRecentProducts()) {
    const c = (p.category || '').toLowerCase();
    if (c && !seen.includes(c)) seen.push(c);
  }
  return seen.slice(0, 5);
}

async function syncToPb(productId) {
  // Once SDK'siz bak: cikisli ziyaretcide 34 KB'yi bosuna indirmeyelim.
  if (!seedAuth()) return;
  const { pb, currentUser } = await pbMod();
  const user = currentUser();
  if (!user) return;
  try {
    const existing = await pb.collection('recently_viewed').getList(1, 50, {
      filter: `userId = "${user.id}" && productId = "${productId}"`,
    });
    for (const r of existing.items) {
      await pb.collection('recently_viewed').delete(r.id);
    }
    await pb.collection('recently_viewed').create({ userId: user.id, productId });
  } catch {
    // best effort — never block product viewing
  }
}

// Records a product view. Accepts a product object (preferred) or a bare id.
// Most-recent-first, de-duplicated, capped.
export function pushRecent(product) {
  const p = typeof product === 'string' ? { id: product } : product;
  if (!p || !p.id) return;
  const items = [lightSnapshot(p), ...getRecentProducts().filter((x) => x.id !== p.id)]
    .slice(0, MAX);
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    localStorage.setItem(KEY, JSON.stringify(items.map((x) => x.id)));
  } catch { /* noop */ }
  syncToPb(p.id);
}
