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
export const quizLines = API.quizLines;
export const promptContext = API.promptContext;

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

// ── yayin metasi ──────────────────────────────────────────────────────────
export const groundedResearchSystemPrompt = API.groundedResearchSystemPrompt;
export const buildPublishMetaPrompt = API.buildPublishMetaPrompt;

// ── ayristirma ────────────────────────────────────────────────────────────
export const parseAiJson = API.parseAiJson;
