// ═══════════════════════════════════════════════════════════════
//  Product reviews + replies — backed by the same PocketBase
//  `reviews` / `review_replies` collections the mobile app uses.
//  Public read; create / vote / reply need auth.
// ═══════════════════════════════════════════════════════════════

import { pb, currentUser } from './pocketbase';

function asArr(v) {
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

export async function getReviews(productId, limit = 50) {
  try {
    const res = await pb.collection('reviews').getList(1, limit, {
      filter: `productId = "${productId}"`,
      sort: '-created',
    });
    return res.items.map((r) => ({
      id: r.id,
      userId: r.userId || '',
      rating: Number(r.rating) || 0,
      text: r.text || '',
      author: r.authorDisplayName || '',
      likedBy: asArr(r.likedBy),
      dislikedBy: asArr(r.dislikedBy),
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
    likedBy: [],
    dislikedBy: [],
    authorDisplayName: user.name || user.displayName || user.email?.split('@')[0] || 'User',
  });
}

export async function deleteReview(id) {
  return pb.collection('reviews').delete(id);
}

export function averageRating(reviews) {
  const rated = reviews.filter((r) => r.rating > 0);
  if (!rated.length) return 0;
  return rated.reduce((s, r) => s + r.rating, 0) / rated.length;
}

// ─── Like / dislike — shared toggle for reviews and replies ───────
function applyVote(liked, disliked, userId, kind) {
  const L = new Set(liked);
  const D = new Set(disliked);
  if (kind === 'like') {
    if (L.has(userId)) L.delete(userId);
    else { L.add(userId); D.delete(userId); }
  } else {
    if (D.has(userId)) D.delete(userId);
    else { D.add(userId); L.delete(userId); }
  }
  return { likedBy: [...L], dislikedBy: [...D] };
}

async function toggleVote(collection, id, kind) {
  const user = currentUser();
  if (!user) throw new Error('auth required');
  const rec = await pb.collection(collection).getOne(id);
  const next = applyVote(asArr(rec.likedBy), asArr(rec.dislikedBy), user.id, kind);
  await pb.collection(collection).update(id, next);
  return next;
}

export const toggleReviewLike = (id) => toggleVote('reviews', id, 'like');
export const toggleReviewDislike = (id) => toggleVote('reviews', id, 'dislike');
export const toggleReplyLike = (id) => toggleVote('review_replies', id, 'like');
export const toggleReplyDislike = (id) => toggleVote('review_replies', id, 'dislike');

// ─── Replies ──────────────────────────────────────────────────────
export async function getReplies(reviewId) {
  try {
    const res = await pb.collection('review_replies').getList(1, 100, {
      filter: `reviewId = "${reviewId}"`,
      sort: 'created',
    });
    return res.items.map((r) => ({
      id: r.id,
      reviewId: r.reviewId,
      userId: r.userId || '',
      author: r.displayName || '',
      text: r.text || '',
      likedBy: asArr(r.likedBy),
      dislikedBy: asArr(r.dislikedBy),
      created: r.created,
    }));
  } catch {
    return [];
  }
}

export async function addReply(reviewId, text) {
  const user = currentUser();
  if (!user) throw new Error('auth required');
  return pb.collection('review_replies').create({
    reviewId,
    userId: user.id,
    displayName: user.name || user.displayName || user.email?.split('@')[0] || 'User',
    text: text.trim(),
    likedBy: [],
    dislikedBy: [],
  });
}

export async function deleteReply(id) {
  return pb.collection('review_replies').delete(id);
}
