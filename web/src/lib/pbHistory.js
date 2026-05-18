import { currentUser, pb } from './pocketbase';

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function comparisonKey(ids) {
  return uniq(ids).sort().join('|');
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
  } catch {
    // Best effort shared history.
  }
}

export async function saveSubscriptionHistory({ services, analysis }) {
  const user = currentUser();
  const list = (services || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!user || list.length < 2 || !analysis) return;
  const now = new Date().toISOString();
  try {
    await pb.collection('saved_analyses').create({
      userId: user.id,
      title: list.join(' vs '),
      category: 'subscription_history',
      analysisData: {
        type: 'subscription',
        services: list,
        analysisResult: analysis,
        timestamp: now,
      },
      aiScore: 0,
      aiSummary: String(analysis).slice(0, 5000),
      savedAt: now,
    });
  } catch {
    // Best effort shared history.
  }
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
