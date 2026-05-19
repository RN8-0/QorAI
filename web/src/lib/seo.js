// ═══════════════════════════════════════════════════════════════
//  Client-side SEO — keeps <head> meta, canonical, Open Graph,
//  Twitter cards and JSON-LD in sync with the active route.
//  Build-time prerender (scripts/seo.mjs) bakes the same tags into
//  static HTML so non-JS crawlers (Facebook, WhatsApp, X) see them.
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';

export const SITE_URL = 'https://qorai.net';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/logo.png`;

export function truncate(text, max = 158) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
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

// useSeo({ title, description, image, path, type, noindex, jsonLd })
export function useSeo(seo = {}) {
  const {
    title, description, image, path, type = 'website',
    noindex = false, jsonLd = null,
  } = seo;
  const ld = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const url = SITE_URL + (path || window.location.pathname);
    const img = image || DEFAULT_OG_IMAGE;

    if (title) document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow');
    upsertLink('canonical', url);

    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:image', img);
    upsertMeta('property', 'og:url', url);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', img);

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
  }, [title, description, image, path, type, noindex, ld]);
}
