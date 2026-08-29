import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { STRINGS } from './strings';

// Scope cut (2026-08-21): German was dropped entirely — site and app are TR/EN
// only. There is no `de` string table, no /de URL prefix and no German AI copy.
export const LANGS = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

// Only languages that actually have a string table are enabled. There is no
// manual language picker on the site: the active language follows the browser.
const AVAILABLE = LANGS.filter((l) => STRINGS[l.code]);
const CODES = AVAILABLE.map((l) => l.code);
const RTL = new Set(['ar']);
const LANG_KEY = 'qor.lang';

// ADRESİN DİLİ SON SÖZDÜR — TARAYICI DEĞİL.
//
// 2026-08-30'a kadar dil YALNIZCA tarayıcıdan geliyordu. Sonuç, öneksiz
// adreste bir UYUŞMAZLIKTI ve ölçüldü:
//
//   GET https://qorai.net/
//     <html lang="en">
//     <title>Qor AI — AI Product & Subscription Advisor</title>
//     <link rel="canonical" href="https://qorai.net/" />
//     <link rel="alternate" hreflang="tr" href="https://qorai.net/tr/" />
//
//   ...ama Türkçe bir tarayıcıda hidrasyondan SONRA aynı adres Türkçe
//   render ediyor, `applyDocLang` de <html lang>'i 'tr' yapıyordu.
//
// Yani `/` kendini İngilizce ilan edip Türkçe içerik gösteriyordu; `/tr/`
// zaten Türkçeydi. Google için bu iki şey demek: (1) İngilizce kanonik
// adres Türkçe pazarda Türkçe göründüğü için hreflang çifti tutarsız,
// (2) `/` ile `/tr/` render sonrası AYNI içerik — kopya. Kullanıcının
// gördüğü belirti tam olarak buydu: "ana dil İngilizce ama Google'da
// aratınca Türkçe versiyon çıkıyor".
//
// KURAL: dili ADRES belirler. `/tr/...` → tr, önek yok → en (kök adres
// CLAUDE.md'de de İngilizce kanonik olarak tanımlı). Böylece sunulan HTML
// ile render edilen DOM her adreste AYNI dili konuşur.
//
// Türkçe tarayıcılı gerçek ziyaretçi yine Türkçe görür — ama içerik `/`
// adresinin ALTINDAN değişerek değil, ziyaretçi `/tr/` ADRESİNE taşınarak
// (yönlendirme `web/index.html` açılış scriptinde, SPA yüklenmeden önce).
// Böylece her iki şart da tutar: `/` her zaman İngilizce servis edilir
// (Google'da çıkan sürüm İngilizce), Türk kullanıcı Türkçe sitede olur ve
// adres ile içerik hiçbir zaman ayrışmaz.
//
// Googlebot en-US ile tarar, yönlendirme yalnız 'tr' için çalışır → bot `/`
// adresini istisnasız İngilizce görür.
const URL_DEFAULT_LANG = 'en';

function applyDocLang(code) {
  document.documentElement.lang = code;
  document.documentElement.dir = RTL.has(code) ? 'rtl' : 'ltr';
}

const LangCtx = createContext(null);

export function LangProvider({ children, initialLang }) {
  // `initialLang` adresteki dil önekidir (main.jsx `/tr` görürse 'tr' geçer).
  // Önek yoksa dil İngilizcedir — öneksiz adres İngilizce kanoniktir.
  const [lang, setLangState] = useState(
    () => (initialLang && STRINGS[initialLang] ? initialLang : URL_DEFAULT_LANG),
  );

  useEffect(() => { applyDocLang(lang); }, [lang]);
  // `languagechange` dinleyicisi KALDIRILDI: tarayıcı dili değişince
  // indekslenmiş bir adresin dili altından değişiyordu. Adres değişmediyse
  // dil de değişmez.

  const setLang = useCallback((code) => {
    if (!CODES.includes(code)) return;
    try { localStorage.setItem(LANG_KEY, code); } catch { /* storage blocked */ }
    setLangState(code);
  }, []);

  // t('some.key', { name: 'x' }) — falls back to English, then the key.
  const t = useCallback(
    (key, vars) => {
      const table = STRINGS[lang] || STRINGS.en;
      let s = table[key];
      if (s == null) s = STRINGS.en[key];
      if (s == null) return key;
      if (vars) {
        for (const k of Object.keys(vars)) {
          s = s.replaceAll(`{${k}}`, String(vars[k]));
        }
      }
      return s;
    },
    [lang],
  );

  return (
    <LangCtx.Provider value={{ lang, setLang, t, langs: AVAILABLE }}>
      {children}
    </LangCtx.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error('useI18n must be used within LangProvider');
  return ctx;
}

// Convenience: just the translate function.
export function useT() {
  return useI18n().t;
}
