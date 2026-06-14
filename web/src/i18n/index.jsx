import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { STRINGS } from './strings';

// Scope cut (2026-05-29): app focuses on DE/UK/TR markets only.
export const LANGS = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

// Only languages that actually have a string table are enabled. There is no
// manual language picker on the site: the active language follows the browser.
const AVAILABLE = LANGS.filter((l) => STRINGS[l.code]);
const CODES = AVAILABLE.map((l) => l.code);
const RTL = new Set(['ar']);
function detectLang() {
  const nav = (navigator.languages || [navigator.language || 'en'])
    .map((l) => String(l).slice(0, 2).toLowerCase());
  
  for (const l of nav) {
    if (l === 'tr') return 'tr';
    if (l === 'de' || l === 'ge') return 'de';
    if (l === 'en') return 'en';
  }
  return 'en';
}

function applyDocLang(code) {
  document.documentElement.lang = code;
  document.documentElement.dir = RTL.has(code) ? 'rtl' : 'ltr';
}

const LangCtx = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(detectLang);

  useEffect(() => { applyDocLang(lang); }, [lang]);
  useEffect(() => {
    const onLanguageChange = () => setLangState(detectLang());
    window.addEventListener('languagechange', onLanguageChange);
    return () => window.removeEventListener('languagechange', onLanguageChange);
  }, []);

  const setLang = useCallback((code) => {
    if (!CODES.includes(code)) return;
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
