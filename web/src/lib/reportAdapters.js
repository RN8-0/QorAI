// ═══════════════════════════════════════════════════════════════════════════
// AI rapor şemalarını ORTAK rapor şekline çevirir.
//
// Link ve abonelik analizleri zaten "enhanced" şeklini üretiyor; ürün
// (`product_full_report`) ve karşılaştırma (`compare_full_report`) raporları
// tarihsel olarak başka bir şema kullanıyordu. Bu dosya ikisini de tek şekle
// indirir, böylece dört akış da `components/AiReportView.jsx` ile render edilir.
// ═══════════════════════════════════════════════════════════════════════════

// Urun kodu ekrana cikmaz — temizlik TEK KAYNAK (admin/js/qor_ai_prompts.js).
import { cleanProductName } from './productNames.js';
// Puan kalibrasyonu TEK KAYNAK (admin/js/qor_ai_prompts.js).
import { calibratedScore, scoreBasisNote, segmentTier } from './aiPrompts.js';
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
    // `confidence` ve `buyOrWait` EKLENDI (2026-09-02). Ikisi de sema'da
    // vardi ama ortak sekle hic tasinmiyordu: kart guven yuzdesini ve
    // "al / bekle / takip et" hukmunu HIC goremiyordu. Eski grafik de
    // `outlook.buyOrWait` okuyup daima bos buluyordu — sessiz kayipti.
    confidence: Number(f.confidence) > 0 ? Math.round(Number(f.confidence)) : 0,
    buyOrWait: String(f.buyOrWait || '').trim().toLowerCase(),
  };
  return (out.bestTime || out.note || out.expectedChange || out.drivers.length) ? out : null;
}

// Bir ürün gövdesi (ürün raporundaki `product`, karşılaştırmadaki bir products[]
// girdisi) + topluluk bloğu → ortak şekil.
function bodyToUnified(p = {}, community = {}, extra = {}) {
  // HAM AI PUANI. Depoda duran deger bu; asagida kalibre ediliyor.
  const rawScore = int(p.matchScore || p.overallScore || p.score);
  // Katalog puani: kayittan (extra.techScore) ya da raporun icinden.
  const techScore = int(extra.techScore ?? p.techScore ?? 0);
  // GOSTERILEN PUAN = 0.60 x techScore + 0.40 x ham AI puani.
  // Olculdu 2026-08-28: ham puan 14 raporun hepsinde 75-95 arasina sikismis
  // ve yer yer TERSINE donmustu (tech 66 -> 92, tech 89 -> 75). Katalog puani
  // mutlak donanim seviyesini olcuyor ve iyi dagilmis; bilesim hem siralamayi
  // duzeltiyor hem araligi aciyor. Gerekce ve olcum: qor_ai_prompts.js.
  const score = calibratedScore(rawScore, techScore) ?? rawScore;
  const c = community && typeof community === 'object' ? community : {};
  const lang = extra.lang || 'tr';
  return {
    enhancedScore: score,
    // Puanin NE OLDUGUNU sayfada soylemek icin — okuyucu "bu telefon nasil
    // iPhone ile yakin puan aldi" diye sormasin.
    rawScore,
    techScore,
    segmentLabel: (segmentTier(techScore, lang) || {}).label || '',
    scoreBasis: scoreBasisNote(techScore, lang),
    decision: decisionOf(score, p.decision),
    headline: String(p.headline || '').trim() || firstSentence(p.matchComment),
    researched: !!extra.researched,
    confidence: int(p.confidence),
    base: {
      // Hero basligi rapordaki HAM urun adini basiyordu; katalog adlarinin
      // bir kismi satici SKU'su tasiyor (`(SM-A175F)`, `(MHFE4TU/A)`).
      // Ayni temizlik urun kartinda ve analiz listesinde de var.
      title: cleanProductName(String(p.name || extra.title || '').trim()),
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
    // FORUM BULGULARI — YALNIZCA yeni alanlardan okunur.
    //
    // Burada `arr(c.pros)` / `arr(c.cons)` geri donusu VARDI ve tam da
    // gidermeye calistigi tekrari URETIYORDU: eski semadaki `community.pros`
    // ve `community.cons` jenerik arti/eksi listeleridir, yani
    // `product.strengths` / `product.weaknesses` ile neredeyse ayni maddeler.
    // Geri donus onlari "Sahiplerin en cok sevdigi" / "Kronik sorunlar" diye
    // YENIDEN ETIKETLIYOR, okuyucu da ayni cumleleri iki bolumde goruyordu
    // (canli S23 Ultra kaydinda birebir boyleydi: 6 ve 5 madde, ayni metin).
    //
    // Eski kayitta bu bolumun HIC cikmamasi, sahte bir bolum cikmasindan
    // iyidir; kayit yeniden uretildiginde gercek forum bulgulariyla doner.
    lovedFeatures: arr(c.lovedFeatures),
    chronicIssues: arr(c.chronicIssues),
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
    // Katalog puani rapora uretim aninda yaziliyor; yayinlanmis ESKI
    // kayitlarda yok, orada `analysisUnified` kaydin techScore'unu geciyor.
    techScore: extra.techScore ?? data.techScore,
    title: extra.title || data.name,
    researched: extra.researched ?? !!data.researched,
    priceForecast: data.priceForecast,
  });
}

/** `compare_full_report` içindeki BİR ürün girdisi → ortak şekil. */
export function compareProductToUnified(entry = {}, extra = {}) {
  return bodyToUnified(entry, entry.community, {
    ...extra,
    techScore: extra.techScore ?? entry.techScore,
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
    base: { title: cleanProductName(String(cmp.winner || winner.name || '').trim()), siteName: '' },
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
    lovedFeatures: arr(winner.community?.lovedFeatures),
    chronicIssues: arr(winner.community?.chronicIssues),
    sources: arr(winner.community?.sources),
  };
}

export { int as reportInt, arr as reportArr, firstSentence as reportFirstSentence };
