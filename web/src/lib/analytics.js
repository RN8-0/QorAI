// ═══════════════════════════════════════════════════════════════
//  Google Analytics 4 — qorai.net
// ═══════════════════════════════════════════════════════════════

const GA_ID = 'G-V4E1QECPN8';

let ready = false;

export function initAnalytics() {
  const host = location.hostname;
  // Skip on local dev / staging.
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.sslip.io')) return;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { send_page_view: false, anonymize_ip: true });
  ready = true;
}

export function trackPageView(path) {
  if (!ready || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: location.origin + path,
    page_title: document.title,
  });
}

export function trackEvent(name, params) {
  if (!ready || !window.gtag) return;
  try { window.gtag('event', name, params || {}); } catch { /* noop */ }
}
