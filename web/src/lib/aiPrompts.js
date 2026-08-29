// ═══════════════════════════════════════════════════════════════════════════
//  AI PROMPT KOPRUSU — kaynak: admin/js/qor_ai_prompts.js (TEK KOPYA)
//
//  Quiz ve rapor prompt'lari burada YENIDEN YAZILMAZ. Admin panelinin ve
//  sitenin ayni analizi uretmesinin tek garantisi ayni DOSYAYI calistirmak;
//  ikinci bir kopya kacinilmaz olarak ayrisir (bkz. spec_i18n dersi).
//
//  Dosya neden admin/ altinda: admin DERLENMEYEN statik bir site, tarayici
//  yalnizca kendi kok dizinindeki dosyayi cekebiliyor. Site ise derleme
//  aninda ice aktardigi icin calisma zamaninda admin'e BAGIMLI DEGIL.
// ═══════════════════════════════════════════════════════════════════════════
import '../../../admin/js/qor_ai_prompts.js';

const API = globalThis.QorAiPrompts;

if (!API) {
  // SESSIZ DUSMEK YOK. Bu kopru bozulursa analiz "parse hatasi" ile duser ve
  // sebep hicbir yerde gorunmez; asagidaki `API.x` erisimleri de anlamsiz bir
  // TypeError'a cevrilip asil nedeni gizlerdi.
  throw new Error(
    '[aiPrompts] admin/js/qor_ai_prompts.js yuklenemedi — promptlar TEK KAYNAKTA '
    + '(bkz. dosya basligi). Dosya tasindiysa buradaki import yolu da guncellenmeli.',
  );
}

// ── ad / adres ────────────────────────────────────────────────────────────
export const cleanProductName = API.cleanProductName;
export const displayProductName = API.displayProductName;
export const slugifyProduct = API.slugifyProduct;
export const productSlug = API.productSlug;
export const productPath = API.productPath;

// ── kucuk yardimcilar ─────────────────────────────────────────────────────
export const arr = API.arr;
export const firstSentences = API.firstSentences;

// ── dil ───────────────────────────────────────────────────────────────────
export const languageName = API.languageName;
export const langName = API.langName;
export const CURRENT_REPORT_DATE = API.CURRENT_REPORT_DATE;

// ── quiz ──────────────────────────────────────────────────────────────────
export const isComplexQuizCategory = API.isComplexQuizCategory;
export const productQuizCount = API.productQuizCount;
export const compareQuizCount = API.compareQuizCount;
export const subscriptionQuizCount = API.subscriptionQuizCount;
export const variationSeed = API.variationSeed;
export const quizGenerationPrompt = API.quizGenerationPrompt;
export const compareQuizGenerationPrompt = API.compareQuizGenerationPrompt;
export const subscriptionQuizPrompt = API.subscriptionQuizPrompt;

// ── rapor baglami ─────────────────────────────────────────────────────────
export const availabilityContextForProduct = API.availabilityContextForProduct;
export const freshnessRules = API.freshnessRules;
export const hasStaleAvailabilityClaims = API.hasStaleAvailabilityClaims;
export const withFreshnessRetryInstruction = API.withFreshnessRetryInstruction;
export const productSpecsContext = API.productSpecsContext;
export const productLine = API.productLine;
export const cleanProductForPrompt = API.cleanProductForPrompt;
export const languageGate = API.languageGate;
export const researchSourceGate = API.researchSourceGate;
export const chronicResearchGate = API.chronicResearchGate;
// Model kimlik kapisi — kardes varyant sizintisi (S26 raporunda S26 Ultra'nin
// kronik sorunu). Olcum ve gerekce: admin/js/qor_ai_prompts.js.
export const modelIdentityGate = API.modelIdentityGate;
export const scrubSiblingResearch = API.scrubSiblingResearch;
export const crossModelLeaks = API.crossModelLeaks;
export const withModelIdentityRetryInstruction = API.withModelIdentityRetryInstruction;
export const quizLines = API.quizLines;
export const promptContext = API.promptContext;

// ── alternatif segment kapisi + katalog eslestirme ────────────────────────
// Aday sorgusunun bandi ve AI'in adini verdigi urunu katalogta bulma kurali
// admin ile ORTAK: ayrisirsa admin'de yayinlanan analiz ile sitede canli
// kosan analiz farkli alternatifler uretir.
export const segmentPriceUSD = API.segmentPriceUSD;
export const peerFilterExpr = API.peerFilterExpr;
export const peerModelKey = API.peerModelKey;
export const rankPeerCandidates = API.rankPeerCandidates;
export const segmentGate = API.segmentGate;
export const pickCatalogMatch = API.pickCatalogMatch;
export const resolveCatalogAlternatives = API.resolveCatalogAlternatives;
// Rapor GOVDESINDEKI urun kodu temizligi (baslik temizligi analysisRecord'da).
export const cleanProductCodes = API.cleanProductCodes;

// ── puan kalibrasyonu + segment kunyesi ───────────────────────────────────
// Gosterilen puan OKUMA ANINDA hesaplanir (bkz. reportAdapters). Depoda ham
// AI puani durur; boylece daha once yayinlanmis analizler de yeniden
// uretilmeden duzelir ve agirliklar tek yerden degisir.
export const calibratedScore = API.calibratedScore;
export const segmentTier = API.segmentTier;
export const scoreBasisNote = API.scoreBasisNote;

// ── rapor promptlari ──────────────────────────────────────────────────────
export const buildDeepPrompt = API.buildDeepPrompt;
export const buildAltPrompt = API.buildAltPrompt;
export const buildAdvisorPrompt = API.buildAdvisorPrompt;
export const buildPredictionPrompt = API.buildPredictionPrompt;
export const buildForumPrompt = API.buildForumPrompt;
export const buildProductResearchPrompt = API.buildProductResearchPrompt;
export const buildCompareResearchPrompt = API.buildCompareResearchPrompt;
export const buildFullPrompt = API.buildFullPrompt;
export const buildComparePrompt = API.buildComparePrompt;
export const buildCompareProductPrompt = API.buildCompareProductPrompt;
export const buildCompareVerdictPrompt = API.buildCompareVerdictPrompt;

// ── karsilastirma faktor ekseni ───────────────────────────────────────────
// Karsilastirmadaki BUTUN urunler AYNI 8 faktorde puanlanir. Eksen olmadan
// her urun cagrisi kendi etiketlerini uyduruyor, tablo da sifirla doluyordu
// (kok neden ve olcum: admin/js/qor_ai_prompts.js §7.5).
export const compareFactorAxis = API.compareFactorAxis;
export const alignFactorsToAxis = API.alignFactorsToAxis;
export const alignFactorMatrixToAxis = API.alignFactorMatrixToAxis;
export const axisSimilarity = API.axisSimilarity;

// ── yayin metasi ──────────────────────────────────────────────────────────
export const groundedResearchSystemPrompt = API.groundedResearchSystemPrompt;
export const buildPublishMetaPrompt = API.buildPublishMetaPrompt;

// ── ayristirma ────────────────────────────────────────────────────────────
export const parseAiJson = API.parseAiJson;
