// ═══════════════════════════════════════════════════════════════════════════
//  NESIR BOLUCU — TEK KAYNAK (JSX YOK)
//
//  `proseBlocks` metni ekranda cizilen paragraflara boler. AYNI bolme
//  duygu gocunde de kullanilmak ZORUNDA: etiket anahtari paragrafin ilk
//  cumlesinden turuyor, dolayisiyla iki taraf metni farkli bolerse anahtarlar
//  hic tutmaz.
//
//  OLCULDU 2026-09-02: goc satir sonlarina gore boluyordu, on yuz ise uzun
//  tek satirlik metni UC CUMLELIK paragraflara yeniden paketliyor. Sonuc:
//  ekrandaki 15 paragrafin yalnizca 2'si etiketli cikti. Fonksiyon bu yuzden
//  bilesenden cikarilip saf module alindi — Node betikleri de import eder.
// ═══════════════════════════════════════════════════════════════════════════


// Model bazen tek blok, bazen boş satırlı paragraf, bazen "### başlık" yazıyor.
// Üçünü de aynı şekle indir: [{kind, text}].
/* GOVDE ARTIK BURADA DEGIL — TEK KAYNAK admin/js/qor_ai_prompts.js.
   Ayni bolucuyu admin motoru da kullaniyor (yeni analizlerde paragraf
   etiketleri onunla uretiliyor). Iki kopya olsaydi yazan ve okuyan taraf
   metni farkli boler, anahtarlar hic tutmazdi. */
import '../../../admin/js/qor_ai_prompts.js';

export const proseBlocks = globalThis.QorAiPrompts.proseBlocks;
