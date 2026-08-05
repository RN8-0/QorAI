import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { LangProvider } from './i18n/index.jsx';
import { initAnalytics } from './lib/analytics.js';
import './styles/global.css';

initAnalytics();

// Build marker — a side-effecting write (survives minification) so every deploy
// yields a fresh entry-bundle content hash. This guarantees new HTML never points
// at a bundle URL that a CDN edge may have negatively cached, avoiding stale-asset
// white-screens after a deploy.
if (typeof window !== 'undefined') window.__qorBuild = '20260706-a';

// Language URL-prefix for SEO: tr is the canonical root (no prefix); en/de live
// under /en and /de so each language has a distinct, hreflang-linked URL Google
// can index. This ONLY activates when the path starts with /en, /de or /tr.
// KÖK (öneksiz) ADRES ARTIK İNGİLİZCE ön-render edilir (2026-08-05): Google'da
// aratan bir İngiliz/Alman kullanıcıya Türkçe sayfa çıkıyordu. Öneksiz adreste
// GERÇEK ziyaretçinin dili yine TARAYICIDAN belirlenir — bu kural değişmedi;
// önek yalnız o sayfa yüklemesi için dili sabitler (arama motorları içindir).
// `basename` keeps the SPA's internal links inside the language; `initialLang`
// sets the UI language for that page load WITHOUT clobbering the user's saved
// Settings preference.
const PATH_LANG = (() => {
  try {
    const m = window.location.pathname.match(/^\/(en|de|tr)(?:\/|$)/);
    return m ? m[1] : null;
  } catch { return null; }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={PATH_LANG ? `/${PATH_LANG}` : undefined}>
      <LangProvider initialLang={PATH_LANG}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
