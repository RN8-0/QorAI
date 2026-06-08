// ───────────────────────────────────────────────────────────────────────────
//  Comparison reviews — same `comparison_reviews` PocketBase collection the
//  mobile app uses. One unified thread per comparison, keyed by docKey =
//  sorted productIds joined with "_" (mirrors spec_comparison_widget.dart).
//  A review left in the app on the same set of products shows up here, and
//  vice-versa.
// ───────────────────────────────────────────────────────────────────────────
import { pb, currentUser } from './pocketbase';

export function comparisonDocKey(productIds) {
  return [...(productIds || [])].map((x) => String(x || '').trim()).filter(Boolean).sort().join('_');
}

function esc(v) { return String(v || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function asArr(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }

export async function getComparisonReviews(productIds) {
  const docKey = comparisonDocKey(productIds);
  if (!docKey) return [];
  try {
    const res = await pb.collection('comparison_reviews').getList(1, 50, {
      filter: `docKey = "${esc(docKey)}"`,
      sort: '-timestamp',
    });
    return res.items.map((r) => ({
      id: r.id,
      userId: r.userId || '',
      author: r.displayName || '',
      rating: Number(r.rating) || 0,
      text: r.reviewText || '',
      likedBy: asArr(r.likedBy),
      dislikedBy: asArr(r.dislikedBy),
      created: r.timestamp || r.created || '',
    }));
  } catch {
    return [];
  }
}

export async function createComparisonReview(productIds, rating, text) {
  const user = currentUser();
  if (!user) throw new Error('auth required');
  const ids = [...(productIds || [])].map((x) => String(x || '').trim()).filter(Boolean).sort();
  const docKey = ids.join('_');
  return pb.collection('comparison_reviews').create({
    docKey,
    userId: user.id,
    displayName: user.name || user.displayName || user.email?.split('@')[0] || 'User',
    reviewText: String(text || '').trim(),
    timestamp: new Date().toISOString(),
    productIds: ids,
    rating: Number(rating) || 0,
    likedBy: [],
    dislikedBy: [],
  });
}

export async function deleteComparisonReview(id) {
  return pb.collection('comparison_reviews').delete(id);
}

function applyVote(liked, disliked, userId, kind) {
  const L = new Set(liked); const D = new Set(disliked);
  if (kind === 'like') { if (L.has(userId)) L.delete(userId); else { L.add(userId); D.delete(userId); } }
  else { if (D.has(userId)) D.delete(userId); else { D.add(userId); L.delete(userId); } }
  return { likedBy: [...L], dislikedBy: [...D] };
}

async function toggleVote(id, kind) {
  const user = currentUser();
  if (!user) throw new Error('auth required');
  const rec = await pb.collection('comparison_reviews').getOne(id);
  const next = applyVote(asArr(rec.likedBy), asArr(rec.dislikedBy), user.id, kind);
  await pb.collection('comparison_reviews').update(id, next);
  return next;
}

export const toggleComparisonLike = (id) => toggleVote(id, 'like');
export const toggleComparisonDislike = (id) => toggleVote(id, 'dislike');

export function averageRating(reviews) {
  const rated = (reviews || []).filter((r) => r.rating > 0);
  if (!rated.length) return 0;
  return rated.reduce((s, r) => s + r.rating, 0) / rated.length;
}
