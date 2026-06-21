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

function sameUrlSet(a = [], b = []) {
  const aa = uniq(a.map((x) => String(x || '').trim())).sort();
  const bb = uniq(b.map((x) => String(x || '').trim())).sort();
  return aa.length === bb.length && aa.every((x, i) => x === bb[i]);
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

export async function saveLinkAnalysisHistory({ urls, analysis, type = 'single', result = null }) {
  const user = currentUser();
  const list = (urls || []).map((u) => String(u || '').trim()).filter(Boolean);
  if (!user || !list.length || !analysis) return;
  const now = new Date().toISOString();
  try {
    const created = await pb.collection('saved_analyses').create({
      userId: user.id,
      url: list[0] || '',
      title: list.length > 1 ? list.join(' vs ') : list[0],
      category: 'link_history',
      analysisData: {
        type,
        urls: list,
        url: list[0] || '',
        analysis,
        result,
        timestamp: now,
      },
      aiScore: 0,
      aiSummary: String(analysis).slice(0, 5000),
      savedAt: now,
    });
    await appendAnalyzedProduct({
      savedAnalysisId: created.id,
      title: list.length > 1 ? list.join(' vs ') : list[0],
      category: 'link',
      mode: type,
      url: list[0] || '',
      urls: list,
      score: 0,
      verdict: String(analysis).slice(0, 200),
    });
    return created;
  } catch {
    // Best effort shared history.
    return null;
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
  const payload = {
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
  };
  // One canonical saved analysis per product — update it on re-analyze instead
  // of piling up duplicates (the revisit reader returns the latest anyway).
  // Falls back to create if the update path is unavailable, so a save never
  // silently drops.
  let saved = false;
  try {
    const existing = await pb.collection('saved_analyses').getList(1, 50, {
      filter: `userId = "${user.id}" && category = "product_history"`,
      sort: '-created',
    });
    const match = existing.items.find((a) => String(a?.analysisData?.productId || '') === String(product.id));
    if (match) { await pb.collection('saved_analyses').update(match.id, payload); saved = true; }
  } catch {
    // fall through to create
  }
  if (!saved) {
    try { await pb.collection('saved_analyses').create(payload); } catch { /* best effort */ }
  }
}

// Most recent saved single-product analysis for this product id (the JSON text
// the report renders from), so revisiting a product shows it without re-running.
export async function getSavedProductAnalysis(productId) {
  const user = currentUser();
  const pid = String(productId || '').trim();
  if (!user || !pid) return null;
  try {
    const res = await pb.collection('saved_analyses').getList(1, 100, {
      filter: `userId = "${user.id}" && category = "product_history"`,
      sort: '-created',
    });
    for (const a of res.items) {
      const d = a.analysisData && typeof a.analysisData === 'object' ? a.analysisData : {};
      if (String(d.productId || '') === pid && d.analysis) {
        return { id: a.id, analysis: d.analysis, at: a.savedAt || d.timestamp || a.created };
      }
    }
    return null;
  } catch {
    return null;
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
  const payload = {
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
  };
  // One canonical saved analysis per exact product set — update on re-run, with
  // a create fallback so a save never silently drops.
  let saved = false;
  try {
    const key = comparisonKey(productIds);
    const existing = await pb.collection('saved_analyses').getList(1, 50, {
      filter: `userId = "${user.id}" && category = "comparison_history"`,
      sort: '-created',
    });
    const match = existing.items.find((a) => comparisonKey(a?.analysisData?.productIds || []) === key);
    if (match) { await pb.collection('saved_analyses').update(match.id, payload); saved = true; }
  } catch {
    // fall through to create
  }
  if (!saved) {
    try { await pb.collection('saved_analyses').create(payload); } catch { /* best effort */ }
  }
}

// Most recent saved comparison analysis for this EXACT product-id set (order-
// independent), so revisiting the same comparison shows it without re-running.
export async function getSavedComparisonAnalysis(productIds) {
  const user = currentUser();
  const ids = uniq(productIds);
  if (!user || ids.length < 2) return null;
  const key = comparisonKey(ids);
  try {
    const res = await pb.collection('saved_analyses').getList(1, 100, {
      filter: `userId = "${user.id}" && category = "comparison_history"`,
      sort: '-created',
    });
    for (const a of res.items) {
      const d = a.analysisData && typeof a.analysisData === 'object' ? a.analysisData : {};
      if (comparisonKey(d.productIds || []) === key && d.analysis) {
        return { id: a.id, analysis: d.analysis, at: a.savedAt || d.timestamp || a.created };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSubscriptionHistory({ services, analysis, quiz = {}, scores = {}, result = null }) {
  const user = currentUser();
  const list = (services || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!user || list.length < 1 || !analysis) return;
  const now = new Date().toISOString();
  try {
    const created = await pb.collection('saved_analyses').create({
      userId: user.id,
      title: list.join(' vs '),
      category: 'subscription_history',
      analysisData: {
        type: 'subscription',
        services: list,
        quiz,
        scores,
        analysisResult: analysis,
        result,
        timestamp: now,
      },
      aiScore: 0,
      aiSummary: String(analysis).slice(0, 5000),
      savedAt: now,
    });
    for (const service of list) {
      await appendAnalyzedProduct({
        savedAnalysisId: created.id,
        title: service,
        category: 'subscription',
        mode: 'subscription',
        score: Number(scores?.[service]) || 0,
        verdict: String(analysis).slice(0, 200),
      });
    }
    return created;
  } catch {
    // Best effort shared history.
    return null;
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
          scores: d.scores && typeof d.scores === 'object' ? d.scores : {},
          result: d.result && typeof d.result === 'object' ? d.result : null,
          type: d.type || '',
          productIds: Array.isArray(d.productIds) ? d.productIds : [],
          productId: d.productId || '',
          at: a.savedAt || d.timestamp || a.created,
          category: a.category,
        };
      });
  } catch {
    return [];
  }
}

export async function deleteSavedAnalysisHistory(itemOrId) {
  const user = currentUser();
  const item = typeof itemOrId === 'string' ? { id: itemOrId } : (itemOrId || {});
  if (!user || !item.id) return false;
  let record = null;
  try {
    record = await pb.collection('saved_analyses').getOne(item.id);
  } catch {
    record = null;
  }

  try { await pb.collection('saved_analyses').delete(item.id); } catch { /* already gone or blocked */ }

  try {
    const latest = await pb.collection('users').getOne(user.id);
    const history = Array.isArray(latest.analyzedProducts) ? latest.analyzedProducts : [];
    const data = record?.analysisData && typeof record.analysisData === 'object' ? record.analysisData : {};
    const urls = Array.isArray(item.urls) && item.urls.length ? item.urls : (Array.isArray(data.urls) ? data.urls : []);
    const services = Array.isArray(item.services) && item.services.length ? item.services : (Array.isArray(data.services) ? data.services : []);
    const title = item.title || record?.title || '';
    const kind = item.kind || (record?.category === 'subscription_history' ? 'subscription' : 'link');
    const next = history.filter((entry) => {
      if (!entry) return false;
      if (entry.savedAnalysisId === item.id) return false;
      if (kind === 'link' && urls.length) {
        const entryUrls = Array.isArray(entry.urls) ? entry.urls : (entry.url ? [entry.url] : []);
        if (sameUrlSet(entryUrls, urls)) return false;
        if (entry.url && urls.includes(entry.url)) return false;
      }
      if (kind === 'subscription' && services.length) {
        if (services.includes(entry.title)) return false;
      }
      if (title && entry.title === title) return false;
      return true;
    });
    if (next.length !== history.length) {
      await pb.collection('users').update(user.id, { analyzedProducts: next });
    }
  } catch {
    // saved_analyses deletion is the source of truth; profile mirror cleanup is best effort.
  }
  return true;
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

// Blog articles the signed-in user has liked (article_events, type="like").
export async function getMyLikedArticles(limit = 60) {
  const user = currentUser();
  if (!user) return [];
  try {
    const evs = await pb.collection('article_events').getList(1, limit, {
      filter: `type="like" && userId="${user.id}"`,
      sort: '-created',
      $autoCancel: false,
    });
    const slugs = [...new Set(evs.items.map((e) => e.slug).filter(Boolean))];
    const arts = await Promise.all(slugs.map((s) => pb.collection('articles')
      .getFirstListItem(`slug="${String(s).replace(/"/g, '\\"')}" && status="published"`, { $autoCancel: false })
      .catch(() => null)));
    return arts.filter(Boolean).map((a) => ({
      id: a.id, slug: a.slug, slug_tr: a.slug_tr, slug_en: a.slug_en, slug_de: a.slug_de,
      cover: a.cover, coverFile: a.coverFile, products: a.products, collectionId: a.collectionId, collectionName: a.collectionName,
      title_tr: a.title_tr, title_en: a.title_en, title_de: a.title_de,
    }));
  } catch {
    return [];
  }
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
