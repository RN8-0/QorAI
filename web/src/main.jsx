import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { LangProvider } from './i18n/index.jsx';
import { initAnalytics } from './lib/analytics.js';
import ErrorBoundary, { isChunkError, reloadOnce } from './components/ErrorBoundary.jsx';
import './styles/global.css';

initAnalytics();

// Build marker — a side-effecting write (survives minification) so every deploy
// yields a fresh entry-bundle content hash. This guarantees new HTML never points
// at a bundle URL that a CDN edge may have negatively cached, avoiding stale-asset
// white-screens after a deploy.
if (typeof window !== 'undefined') window.__qorBuild = '20260706-a';

// BAYAT CHUNK KURTARMASI — sınırın önündeki ilk kapı.
// Vite, `modulepreload`'u düşen bir chunk için `vite:preloadError` fırlatır.
// Varsayılan davranış hatayı yeniden atmak; o hata React'in dışında oluştuğu
// için hiçbir error boundary yakalayamaz. Burada yakalayıp bir kez sert
// yenileme yapıyoruz: yenileme taze HTML + taze hash getirdiği için chunk yine
// aynı adresten istenmez. `preventDefault` olmadan hata yine de konsola düşer
// ve kullanıcı beyaz ekranda kalırdı.
// Not: yenileme SESSION başına bir kez (ErrorBoundary.reloadOnce) — sunucu
// gerçekten bozuksa sonsuz yenileme döngüsü kullanıcıyı sayfaya hiç
// sokmayacağı için sınırın hata ekranı devreye girer.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    reloadOnce();
  });
  // Yakalanmamış promise reddi: rota chunk'ı React'in render yolunun DIŞINDA
  // (ön-yükleme, prefetch) istendiğinde hata buradan çıkar.
  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkError(e.reason)) reloadOnce();
  });
}

// Language URL-prefix for SEO: en is the canonical root (no prefix); /tr lives
// under /tr so each language has a distinct, hreflang-linked URL Google can
// index. This ONLY activates when the path starts with /en or /tr. German was
// removed 2026-08-21 — /de is no longer a language prefix.
// KÖK (öneksiz) ADRES ARTIK İNGİLİZCE ön-render edilir (2026-08-05): Google'da
// aratan bir İngiliz kullanıcıya Türkçe sayfa çıkıyordu. Öneksiz adreste
// GERÇEK ziyaretçinin dili yine TARAYICIDAN belirlenir — bu kural değişmedi;
// önek yalnız o sayfa yüklemesi için dili sabitler (arama motorları içindir).
// `basename` keeps the SPA's internal links inside the language; `initialLang`
// sets the UI language for that page load WITHOUT clobbering the user's saved
// Settings preference.
const PATH_LANG = (() => {
  try {
    const m = window.location.pathname.match(/^\/(en|tr)(?:\/|$)/);
    return m ? m[1] : null;
  } catch { return null; }
})();

// KÖK SINIR. App'in içindeki rota sınırı sayfa hatalarını tutuyor; bu sınır
// onun ULAŞAMADIĞI yeri kapatıyor: Header, Footer, BottomNav ve sağlayıcıların
// (LangProvider / AuthProvider) kendisi. Buradaki bir hata da kökü söküp
// sayfayı beyaz bırakırdı.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={PATH_LANG ? `/${PATH_LANG}` : undefined}>
        <LangProvider initialLang={PATH_LANG}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LangProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
