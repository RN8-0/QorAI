/* ═══════════════════════════════════════════════════════════════
   Qor AI — Google Analytics 4 (gtag) shared loader
   Replace G-PLACEHOLDER with the real Measurement ID once GA4
   property is provisioned. Loads only on production domain.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  // Disable analytics on local dev / staging
  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.sslip.io')) return;

  // Production GA4 Measurement ID. Set via window.QOR_GA_ID before
  // including this file, otherwise falls back to the placeholder.
  var GA_ID = window.QOR_GA_ID || 'G-PLACEHOLDER';
  if (!GA_ID || GA_ID === 'G-PLACEHOLDER') return; // no-op until provisioned

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GA_ID, {
    send_page_view: true,
    anonymize_ip: true,
  });

  // Helper: track a custom event
  window.qorTrack = function (name, params) {
    try { gtag('event', name, params || {}); } catch (e) { /* noop */ }
  };
})();
