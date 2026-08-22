// ═══════════════════════════════════════════════════════════════════════════
//  LINK & ABONELIK ANALIZ KOPRUSU — kaynak: admin/js/qor_ai_link.js (TEK KOPYA)
//
//  Motor burada YENIDEN YAZILMAZ. Admin paneli de link ve abonelik analizi
//  URETIYOR; iki ayri motor tutmak iki ayri analiz demek olurdu. Dosya
//  admin/ altinda cunku admin DERLENMEYEN statik bir site — tarayici yalnizca
//  kendi kok dizinindeki dosyayi cekebiliyor. Site derleme aninda ice
//  aktardigi icin calisma zamaninda admin'e BAGIMLI DEGIL.
//  (Ayni desen: admin/js/spec_i18n.js, admin/js/qor_ai_prompts.js.)
//
//  Motor tasima katmanini BILMEZ; burada baglaniyor.
// ═══════════════════════════════════════════════════════════════════════════
import '../../../admin/js/qor_ai_prompts.js';
import '../../../admin/js/qor_ai_link.js';
import { askQorAiJson, askQorAiGrounded, adminPrompt } from './ai';

const API = globalThis.QorAiLink;

if (!API) {
  throw new Error(
    '[linkAnalysis] admin/js/qor_ai_link.js yuklenemedi — motor TEK KAYNAKTA '
    + '(bkz. dosya basligi). Dosya tasindiysa buradaki import yolu da guncellenmeli.',
  );
}

// Site kendi AI yonlendirmesini verir (Gemini -> DeepSeek, grounded arastirma,
// PB'deki admin prompt override'lari). Admin kendi istemcisini verir.
API.configure({
  askJson: askQorAiJson,
  askGrounded: askQorAiGrounded,
  adminPrompt,
});

// ── Adim 1: linki tani ────────────────────────────────────────────────────
export const analyzeLink = API.analyzeLink;
export const isJunkProductTitle = API.isJunkProductTitle;
export const titleFromUrl = API.titleFromUrl;
export const looksLikeProductUrl = API.looksLikeProductUrl;
export const findCatalogMatch = API.findCatalogMatch;

// ── Adim 2: quiz ──────────────────────────────────────────────────────────
export const generateQuiz = API.generateQuiz;
export const generateCompareQuiz = API.generateCompareQuiz;
export const generateSubscriptionQuiz = API.generateSubscriptionQuiz;

// ── Adim 3: arastirma ─────────────────────────────────────────────────────
export const researchProductCommunity = API.researchProductCommunity;
export const researchProductsCommunity = API.researchProductsCommunity;
export const researchSubscriptionsCommunity = API.researchSubscriptionsCommunity;
export const awaitResearch = API.awaitResearch;

// ── Adim 4: rapor ─────────────────────────────────────────────────────────
export const enhancedAnalysis = API.enhancedAnalysis;
export const compareAnalysis = API.compareAnalysis;
export const subscriptionAnalysis = API.subscriptionAnalysis;

// ── Abonelik yardimcilari ─────────────────────────────────────────────────
export const subscriptionCategory = API.subscriptionCategory;
export const normalizeSubscriptionCategoryKey = API.normalizeSubscriptionCategoryKey;
export const subscriptionsMixCategories = API.subscriptionsMixCategories;
export const looksLikeSubscriptionUrl = API.looksLikeSubscriptionUrl;
export const validateSubscriptionInput = API.validateSubscriptionInput;

// Dil adi ve quiz boyutu ortak prompt dosyasindan geliyor; eski cagiranlar
// bu modulden ice aktardigi icin buradan da acik kaliyor.
export {
  languageName,
  isComplexQuizCategory, productQuizCount, compareQuizCount, subscriptionQuizCount,
} from './aiPrompts.js';
