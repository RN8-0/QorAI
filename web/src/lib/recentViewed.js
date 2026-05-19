// Recently viewed products — kept in localStorage so it works for guests
// and is instant. When signed in it also writes to the PocketBase
// `recently_viewed` collection the mobile app uses, so history syncs.

import { pb, currentUser } from './pocketbase';

const KEY = 'qor-recent';
const MAX = 20;

export function getRecentIds() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function syncToPb(productId) {
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

// Records a product view. Most-recent-first, de-duplicated, capped.
export function pushRecent(productId) {
  if (!productId) return;
  const ids = [productId, ...getRecentIds().filter((x) => x !== productId)].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* noop */ }
  syncToPb(productId);
}
