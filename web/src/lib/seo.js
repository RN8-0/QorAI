// ═══════════════════════════════════════════════════════════════
//  Client-side SEO — keeps <head> meta, canonical, Open Graph,
//  Twitter cards and JSON-LD in sync with the active route.
//  Build-time prerender (scripts/seo.mjs) bakes the same tags into
//  static HTML so non-JS crawlers (Facebook, WhatsApp, X) see them.
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';

export const SITE_URL = 'https://qorai.net';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/qor_logo_512.png?v=20260605a`;

export function truncate(text, max = 158) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ── Dil adresleri (scripts/seo.mjs ile AYNI şema) ──────────────────────────
// Kök adres = İngilizce · /tr/… = Türkçe · /de/… = Almanca · x-default → kök.
// Ziyaretçinin gördüğü dil HÂLÂ tarayıcıdan gelir; önek yalnız arama motorunun
// indekslediği sürümü sabitler.
export const SEO_LOCALES = ['en', 'tr', 'de'];
export const SEO_DEFAULT_LOCALE = 'en';

// Adresteki dil öneki ('' = kök = varsayılan dil).
export function pathLocale() {
  try {
    const m = window.location.pathname.match(/^\/(tr|de|en)(?:\/|$)/);
    return m ? m[1] : '';
  } catch { return ''; }
}

// Önek TAŞIMAYAN bir yol için üç dilin hreflang kümesi.
export function hreflangAlternates(path) {
  const p = path === '/' ? '' : String(path || '');
  const alts = SEO_LOCALES.map((l) => ({
    hreflang: l,
    href: `${SITE_URL}${l === SEO_DEFAULT_LOCALE ? '' : `/${l}`}${p || '/'}`,
  }));
  alts.push({ hreflang: 'x-default', href: `${SITE_URL}${p || '/'}` });
  return alts;
}

function upsertMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (value == null || value === '') { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!href) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// useSeo({ title, description, image, imageAlt, path, type, noindex, jsonLd })
export function useSeo(seo = {}) {
  const {
    title, description, image, imageAlt, path, type = 'website',
    noindex = false, jsonLd = null,
    // Çok dilli sayfalar için: htmlLang <html lang> değerini, alternates ise
    // hreflang bağlantılarını kurar. Blog yazıları dil başına AYRI adreste
    // yayınlanıyor (slug_tr/en/de); bunlar olmadan Google Türkçe adreste
    // İngilizce içerik görüp sayfanın dilini çözemiyordu.
    htmlLang = '', alternates = null,
  } = seo;
  const ld = jsonLd ? JSON.stringify(jsonLd) : '';
  const altKey = alternates ? JSON.stringify(alternates) : '';

  useEffect(() => {
    // CANONICAL DİL ÖNEKİNİ KORUMALI. Sayfalar `path`'i önek olmadan verir
    // (`/product/…`), bu yüzden /tr/product/… adresinde canonical öneksiz —
    // yani İNGİLİZCE — sürümü gösteriyordu. Kendi kendini başka bir dile
    // canonical eden sayfayı Google indekslemez: üretilen tr/de ön-render'ları
    // görünmez kılan buydu (2026-08-06).
    const loc = pathLocale();
    const rawPath = path || String(window.location.pathname || '/').replace(/^\/(tr|de|en)(?=\/|$)/, '') || '/';
    const url = SITE_URL + (loc ? `/${loc}` : '') + rawPath;
    const img = image || DEFAULT_OG_IMAGE;

    if (title) document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    upsertLink('canonical', url);

    // <html lang> — sayfanın GERÇEK içerik dili (tarayıcı dili değil).
    if (htmlLang) document.documentElement.setAttribute('lang', htmlLang);

    // hreflang alternatifleri: her dilin kendi adresi. Önce eskileri temizle,
    // sonra bu sayfaya ait olanları yaz (SPA'da sayfa değişince kalmasınlar).
    document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
    for (const alt of (alternates || [])) {
      if (!alt || !alt.hreflang || !alt.href) continue;
      const el = document.createElement('link');
      el.setAttribute('rel', 'alternate');
      el.setAttribute('hreflang', alt.hreflang);
      el.setAttribute('href', alt.href);
      document.head.appendChild(el);
    }

    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:site_name', 'Qor AI');
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:image', img);
    upsertMeta('property', 'og:image:alt', imageAlt || title);
    upsertMeta('property', 'og:url', url);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', img);
    upsertMeta('name', 'twitter:image:alt', imageAlt || title);

    const SID = 'seo-jsonld';
    let script = document.getElementById(SID);
    if (ld) {
      if (!script) {
        script = document.createElement('script');
        script.id = SID;
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = ld;
    } else if (script) {
      script.remove();
    }
  }, [title, description, image, imageAlt, path, type, noindex, ld, htmlLang, altKey]);
}
