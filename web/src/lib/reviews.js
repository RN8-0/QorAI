// ═══════════════════════════════════════════════════════════════
//  Product reviews — backed by the same PocketBase `reviews`
//  collection the mobile app uses. Public read; create needs auth.
// ═══════════════════════════════════════════════════════════════

import { pb, currentUser } from './pocketbase';

export async function getReviews(productId, limit = 50) {
  try {
    const res = await pb.collection('reviews').getList(1, limit, {
      filter: `productId = "${productId}"`,
      sort: '-created',
    });
    return res.items.map((r) => ({
      id: r.id,
      rating: Number(r.rating) || 0,
      text: r.text || '',
      author: r.authorDisplayName || '',
      created: r.created,
    }));
  } catch {
    return [];
  }
}

export async function createReview(productId, rating, text) {
  const user = currentUser();
  if (!user) throw new Error('auth required');
  return pb.collection('reviews').create({
    productId,
    userId: user.id,
    rating,
    text: text.trim(),
    helpful: 0,
    reported: false,
    authorDisplayName: user.name || user.email?.split('@')[0] || 'User',
  });
}

export function averageRating(reviews) {
  const rated = reviews.filter((r) => r.rating > 0);
  if (!rated.length) return 0;
  return rated.reduce((s, r) => s + r.rating, 0) / rated.length;
}
