import { currentUser, pb } from './pocketbase';

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function comparisonKey(ids) {
  return uniq(ids).sort().join('|');
}

async function appendAnalyzedProduct(entry) {
  const user = currentUser();
  if (!user || !entry) return;
  try {
    const latest = await pb.collection('users').getOne(user.id);
    const history = Array.isArray(latest.analyzedProducts) ? latest.analyzedProducts : [];
    await pb.collection('users').update(user.id, {
      analyzedProducts: [
        { timestamp: new Date().toISOString(), ...entry },
        ...history,
      ].slice(0, 200),
    });
  } catch {
    // Best effort shared analytics/history mirror.
  }
}

export async function saveSearchHistory(query, productId = '') {
  const user = currentUser();
  const term = String(query || '').trim();
  if (!user || !term) return;
  try {
    const latest = await pb.collection('users').getOne(user.id);
    const history = Array.isArray(latest.searchHistory) ? latest.searchHistory : [];
    const next = [
      { query: term, productId, createdAt: new Date().toISOString() },
      ...history.filter((x) => String(x?.query || '').toLowerCase() !== term.toLowerCase()),
    ].slice(0, 30);
    await pb.collection('users').update(user.id, { searchHistory: next });
  } catch {
    // History sync must never block navigation.
  }
}

export async function saveComparisonHistory(productIds, products = []) {
  const user = currentUser();
  const ids = uniq(productIds);
  if (!user || ids.length < 2) return;

  const key = comparisonKey(ids);
  const now = new Date().toISOString();
  const title = products
    .filter((p) => ids.includes(p.id))
    .map((p) => p.name)
    .slice(0, 3)
    .join(' vs ');
  const category = products.find((p) => p.category)?.category || '';

  try {
    const existing = await pb.collection('comparisons').getList(1, 50, {
      filter: `userId = "${user.id}"`,
      sort: '-updated',
    });
    const match = existing.items.find((item) => comparisonKey(item.productIds || item.items || []) === key);

    if (match) {
      const notes = match.notes && typeof match.notes === 'object' ? match.notes : {};
      await pb.collection('comparisons').update(match.id, {
        userId: user.id,
        productIds: ids,
        title: title || match.title || 'Comparison',
        notes: {
          ...notes,
          category,
          firstComparedAt: notes.firstComparedAt || notes.createdAt || match.created || now,
          lastComparedAt: now,
          occurrenceCount: Number(notes.occurrenceCount || 1) + 1,
        },
        isShared: false,
        shareCode: match.shareCode || match.id,
      });
      return;
    }

    const created = await pb.collection('comparisons').create({
      userId: user.id,
      productIds: ids,
      title: title || 'Comparison',
      notes: {
        category,
        createdAt: now,
        firstComparedAt: now,
        lastComparedAt: now,
        occurrenceCount: 1,
      },
      isShared: false,
    });
    await pb.collection('comparisons').update(created.id, { shareCode: created.id }).catch(() => {});

    const latestUser = await pb.collection('users').getOne(user.id);
    const count = Number(latestUser.comparisonsCount || 0);
    await pb.collection('users').update(user.id, { comparisonsCount: count + 1 });
  } catch {
    // PB history is best effort; compare UI remains local and instant.
  }
}

export async function saveLinkAnalysisHistory({ urls, analysis, type = 'single' }) {
  const user = currentUser();
  const list = (urls || []).map((u) => String(u || '').trim()).filter(Boolean);
  if (!user || !list.length || !analysis) return;
  const now = new Date().toISOString();
  try {
    await pb.collection('saved_analyses').create({
      userId: user.id,
      url: list[0] || '',
      title: list.length > 1 ? list.join(' vs ') : list[0],
      category: 'link_history',
      analysisData: {
        type,
        urls: list,
        url: list[0] || '',
        analysis,
        timestamp: now,
      },
      aiScore: 0,
      aiSummary: String(analysis).slice(0, 5000),
      savedAt: now,
    });
    appendAnalyzedProduct({
      title: list.length > 1 ? list.join(' vs ') : list[0],
      category: 'link',
      mode: type,
      url: list[0] || '',
      urls: list,
      score: 0,
      verdict: String(analysis).slice(0, 200),
    });
  } catch {
    // Best effort shared history.
  }
}

export async function saveProductAnalysisHistory({ product, analysis }) {
  const user = currentUser();
  if (!user || !product?.id || !analysis) return;
  const now = new Date().toISOString();
  appendAnalyzedProduct({
    productId: product.id,
    title: product.name || 'Product analysis',
    category: product.category || 'product',
    mode: 'detail_ai',
    score: Number(product.techScore) || 0,
    verdict: String(analysis).slice(0, 200),
  });
  try {
    await pb.collection('saved_analyses').create({
      userId: user.id,
      title: product.name || 'Product analysis',
      category: 'product_history',
      analysisData: {
        type: 'product',
        productId: product.id,
        productName: product.name || '',
        category: product.category || '',
        analysis,
        timestamp: now,
      },
      aiScore: Number(product.techScore) || 0,
      aiSummary: String(analysis).slice(0, 5000),
      savedAt: now,
    });
  } catch {
    // Best effort shared history.
  }
}

export async function saveComparisonAnalysisHistory({ products = [], analysis }) {
  const user = currentUser();
  const list = Array.isArray(products) ? products.filter((p) => p?.id) : [];
  if (!user || list.length < 2 || !analysis) return;
  const now = new Date().toISOString();
  const productIds = uniq(list.map((p) => p.id));
  const title = list.map((p) => p.name).slice(0, 4).join(' vs ') || 'Comparison analysis';
  appendAnalyzedProduct({
    productIds,
    title,
    category: list[0]?.category || 'comparison',
    mode: 'compare_ai',
    score: Math.round(list.reduce((sum, p) => sum + (Number(p.techScore) || 0), 0) / list.length),
    verdict: String(analysis).slice(0, 200),
  });
  try {
    await pb.collection('saved_analyses').create({
      userId: user.id,
      title,
      category: 'comparison_history',
      analysisData: {
        type: 'comparison',
        productIds,
        productNames: list.map((p) => p.name || ''),
        category: list[0]?.category || '',
        analysis,
        timestamp: now,
      },
      aiScore: Math.round(list.reduce((sum, p) => sum + (Number(p.techScore) || 0), 0) / list.length),
      aiSummary: String(analysis).slice(0, 5000),
      savedAt: now,
    });
  } catch {
    // Best effort shared history.
  }
}

export async function saveSubscriptionHistory({ services, analysis, quiz = {}, scores = {} }) {
  const user = currentUser();
  const list = (services || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!user || list.length < 1 || !analysis) return;
  const now = new Date().toISOString();
  try {
    await pb.collection('saved_analyses').create({
      userId: user.id,
      title: list.join(' vs '),
      category: 'subscription_history',
      analysisData: {
        type: 'subscription',
        services: list,
        quiz,
        scores,
        analysisResult: analysis,
        timestamp: now,
      },
      aiScore: 0,
      aiSummary: String(analysis).slice(0, 5000),
      savedAt: now,
    });
    list.forEach((service) => {
      appendAnalyzedProduct({
        title: service,
        category: 'subscription',
        mode: 'subscription',
        score: Number(scores?.[service]) || 0,
        verdict: String(analysis).slice(0, 200),
      });
    });
  } catch {
    // Best effort shared history.
  }
}

// ─── Readers — surface the shared history back in the Profile ─────

// Saved comparisons (same `comparisons` collection the app writes).
export async function getComparisons(limit = 40) {
  const user = currentUser();
  if (!user) return [];
  try {
    const res = await pb.collection('comparisons').getList(1, limit, {
      filter: `userId = "${user.id}"`,
      sort: '-updated',
    });
    return res.items.map((c) => {
      const notes = c.notes && typeof c.notes === 'object' ? c.notes : {};
      return {
        id: c.id,
        productIds: uniq(c.productIds || c.items || []),
        title: c.title || 'Comparison',
        category: notes.category || '',
        count: Number(notes.occurrenceCount || 1),
        at: notes.lastComparedAt || c.updated || c.created,
      };
    });
  } catch {
    return [];
  }
}

// Saved link / subscription analyses (`saved_analyses` collection).
export async function getSavedAnalyses(limit = 40) {
  const user = currentUser();
  if (!user) return [];
  try {
    const res = await pb.collection('saved_analyses').getList(1, limit, {
      filter: `userId = "${user.id}"`,
      sort: '-created',
    });
    return res.items
      .filter((a) => ['link_history', 'subscription_history', 'product_history', 'comparison_history'].includes(a.category))
      .map((a) => {
        const d = a.analysisData && typeof a.analysisData === 'object' ? a.analysisData : {};
        return {
          id: a.id,
          title: a.title || d.url || '',
          kind: a.category === 'subscription_history'
            ? 'subscription'
            : a.category === 'comparison_history'
              ? 'comparison'
            : a.category === 'product_history'
              ? 'product'
              : 'link',
          analysis: d.analysis || d.analysisResult || a.aiSummary || '',
          urls: Array.isArray(d.urls) ? d.urls : [],
          services: Array.isArray(d.services) ? d.services : [],
          productIds: Array.isArray(d.productIds) ? d.productIds : [],
          productId: d.productId || '',
          at: a.savedAt || d.timestamp || a.created,
        };
      });
  } catch {
    return [];
  }
}

// Reviews written by the signed-in user.
export async function getMyReviews(limit = 50) {
  const user = currentUser();
  if (!user) return [];
  try {
    const res = await pb.collection('reviews').getList(1, limit, {
      filter: `userId = "${user.id}"`,
      sort: '-created',
    });
    return res.items.map((r) => ({
      id: r.id,
      productId: r.productId || '',
      rating: Number(r.rating) || 0,
      text: r.text || '',
      created: r.created,
    }));
  } catch {
    return [];
  }
}

export async function deleteMyReview(id) {
  return pb.collection('reviews').delete(id);
}

// Search / quiz history live as arrays on the user record itself.
export function readSearchHistory(user) {
  return Array.isArray(user?.searchHistory) ? user.searchHistory : [];
}
export function readQuizHistory(user) {
  return Array.isArray(user?.quizHistory) ? user.quizHistory : [];
}

export async function saveQuizHistory({ answers, result }) {
  const user = currentUser();
  if (!user || !answers || !result) return;
  const now = new Date().toISOString();
  try {
    const latest = await pb.collection('users').getOne(user.id);
    const history = Array.isArray(latest.quizHistory) ? latest.quizHistory : [];
    await pb.collection('users').update(user.id, {
      quizHistory: [
        {
          answers,
          result,
          recommendation: result,
          timestamp: now,
        },
        ...history,
      ].slice(0, 30),
    });
  } catch {
    // Best effort shared history.
  }
}
