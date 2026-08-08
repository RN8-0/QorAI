// ═══════════════════════════════════════════════════════════════════════════
// AI rapor şemalarını ORTAK rapor şekline çevirir.
//
// Link ve abonelik analizleri zaten "enhanced" şeklini üretiyor; ürün
// (`product_full_report`) ve karşılaştırma (`compare_full_report`) raporları
// tarihsel olarak başka bir şema kullanıyordu. Bu dosya ikisini de tek şekle
// indirir, böylece dört akış da `components/AiReportView.jsx` ile render edilir.
// ═══════════════════════════════════════════════════════════════════════════

const int = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()) : []);

function firstSentence(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const m = s.match(/[^.!?]+[.!?]?/);
  return (m ? m[0] : s).trim();
}

function decisionOf(score, explicit) {
  const d = String(explicit || '').toLowerCase();
  if (d === 'buy' || d === 'consider' || d === 'skip') return d;
  return score >= 75 ? 'buy' : score >= 55 ? 'consider' : 'skip';
}

// priceForecast (ürün şeması) → priceOutlook (ortak şema)
export function forecastToOutlook(f = {}) {
  if (!f || typeof f !== 'object') return null;
  const trend = String(f.trend || '').toLowerCase();
  const out = {
    trend: ['up', 'down', 'stable'].includes(trend) ? trend : '',
    bestTime: String(f.bestTimeToBuy || f.bestTime || '').trim(),
    expectedChange: String(f.expectedChange || '').trim(),
    note: String(f.analysis || f.note || '').trim(),
    drivers: arr(f.drivers),
  };
  return (out.bestTime || out.note || out.expectedChange || out.drivers.length) ? out : null;
}

// Bir ürün gövdesi (ürün raporundaki `product`, karşılaştırmadaki bir products[]
// girdisi) + topluluk bloğu → ortak şekil.
function bodyToUnified(p = {}, community = {}, extra = {}) {
  const score = int(p.matchScore || p.overallScore || p.score);
  const c = community && typeof community === 'object' ? community : {};
  return {
    enhancedScore: score,
    decision: decisionOf(score, p.decision),
    headline: String(p.headline || '').trim() || firstSentence(p.matchComment),
    researched: !!extra.researched,
    confidence: int(p.confidence),
    base: {
      title: String(p.name || extra.title || '').trim(),
      siteName: String(extra.siteName || '').trim(),
      url: String(extra.url || p.url || '').trim(),
    },
    url: String(extra.url || p.url || '').trim(),

    factors: arr(p.factors),
    criticalPoints: arr(p.criticalPoints),
    quizInsights: arr(p.quizInsights),
    prosForUser: arr(p.strengths).length ? arr(p.strengths) : arr(p.pros),
    consForUser: arr(p.weaknesses).length ? arr(p.weaknesses) : arr(p.cons),
    featureMatches: arr(p.featureMatches),
    reliabilityNotes: arr(p.reliabilityNotes),

    personaAnalysis: String(p.matchComment || '').trim(),
    personaScore: score,
    verdict: String(p.analysis || '').trim(),
    overallVerdict: String(p.overallVerdict || extra.overallVerdict || '').trim(),
    bestFor: String(p.bestFor || '').trim(),
    notFor: String(p.notFor || '').trim(),

    communityScore: int(c.satisfaction),
    sentimentBreakdown: c.sentimentBreakdown || c.sentiment_breakdown || null,
    communityThemes: arr(c.themes),
    communityAnalysis: String(c.summary || '').trim(),
    praisePoints: arr(c.pros),
    complaintPoints: arr(c.cons),
    sources: arr(c.sources),
    verificationNotes: arr(c.verificationNotes),

    priceOutlook: forecastToOutlook(p.priceForecast || extra.priceForecast),
    catalogMatch: extra.catalogMatch || null,
  };
}

/** `product_full_report` → ortak şekil. */
export function productReportToUnified(data = {}, extra = {}) {
  const p = data.product || {};
  return bodyToUnified(p, data.community, {
    ...extra,
    title: extra.title || data.name,
    researched: extra.researched ?? !!data.researched,
    priceForecast: data.priceForecast,
  });
}

/** `compare_full_report` içindeki BİR ürün girdisi → ortak şekil. */
export function compareProductToUnified(entry = {}, extra = {}) {
  return bodyToUnified(entry, entry.community, {
    ...extra,
    url: extra.url || entry.url,
    priceForecast: entry.priceForecast,
  });
}

/** Karşılaştırmanın genel hükmü → ortak şekil (kazananın raporunun üstünde). */
export function compareVerdictToUnified(cmp = {}, entries = [], extra = {}) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const winner = entries.find((e) => norm(e.name) === norm(cmp.winner)) || entries[0] || {};
  const score = int(cmp.winnerScore) || int(winner.matchScore);
  return {
    enhancedScore: score,
    decision: decisionOf(score),
    headline: firstSentence(cmp.recommendation || cmp.headToHead),
    researched: !!extra.researched,
    base: { title: String(cmp.winner || winner.name || '').trim(), siteName: '' },
    factors: arr(cmp.factorMatrix)
      .map((row) => {
        const scores = arr(row.scores);
        const win = scores.find((s) => norm(s.name) === norm(cmp.winner)) || scores[0];
        return win ? { label: row.label, score: int(win.score), detail: '' } : null;
      })
      .filter(Boolean),
    criticalPoints: arr(cmp.criticalPoints),
    quizInsights: arr(cmp.quizInsights),
    prosForUser: arr(cmp.decisiveDifferences),
    consForUser: [],
    verdict: String(cmp.headToHead || '').trim(),
    overallVerdict: String(cmp.recommendation || '').trim(),
    communityScore: int(winner.community?.satisfaction),
    sentimentBreakdown: winner.community?.sentimentBreakdown || null,
    communityThemes: arr(winner.community?.themes),
    sources: arr(winner.community?.sources),
  };
}

export { int as reportInt, arr as reportArr, firstSentence as reportFirstSentence };
