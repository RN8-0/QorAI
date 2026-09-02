// ═══════════════════════════════════════════════════════════════════════════
//  PARAGRAF DUYGUSU — REACT BAGLAMI
//
//  Saf cekirdek (anahtar uretimi, siniflandirici, sinif eki) lib/sentiment.js
//  icinde ve JSX icermiyor; Node betikleri onu dogrudan import ediyor.
//  Burada yalnizca React saglayicisi ve kancasi var.
//
//  KURAL: ON YUZ DUYGU TAHMIN ETMEZ. Etiket kayittan gelir; yoksa NOTR.
// ═══════════════════════════════════════════════════════════════════════════
import { createContext, useContext, useMemo } from 'react';
import { classifyParagraphSentiment, sentimentIndex } from './sentiment.js';

export { classifyParagraphSentiment, sentimentClass, paragraphKey, POSITIVE, NEGATIVE, NEUTRAL } from './sentiment.js';

const SentimentContext = createContext(null);

/** Rapor kokunde bir kez sarilir; altindaki tum nesir bilesenleri okur. */
export function SentimentProvider({ index, children }) {
  const deger = useMemo(() => (index instanceof Map ? index : sentimentIndex(index)), [index]);
  return <SentimentContext.Provider value={deger}>{children}</SentimentContext.Provider>;
}

/** Bilesenlerin kullandigi kanca — tek giris noktasi. */
export function useParagraphSentiment() {
  const index = useContext(SentimentContext);
  return useMemo(() => (text) => classifyParagraphSentiment(text, index), [index]);
}
