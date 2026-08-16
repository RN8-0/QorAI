// ═══════════════════════════════════════════════════════════════
//  Google Analytics 4 — qorai.net
// ═══════════════════════════════════════════════════════════════
//
// YÜKLEME ZAMANLAMASI (2026-08-14 ölçümü, Slow 4G + 4x CPU, canlı site):
// `initAnalytics()` main.jsx'te ReactDOM.render'dan ÖNCE çağrılıyordu ve
// gtag.js **166 KB** — yani ilk boyamayla bant genişliği yarışıyordu. Skimlinks
// bu işi zaten doğru yapıyor (load + requestIdleCallback); analytics de aynı
// kalıba alındı. Ölçüm sayfanın kendi içeriğine ait değil, ertelenmesi hiçbir
// veriyi kaybetmemeli — bu yüzden script gelene KADAR olan olaylar kuyruğa
// alınır ve hazır olunca sırayla gönderilir (ilk page_view dahil).

const GA_ID = 'G-V4E1QECPN8';

let ready = false;
let started = false;
// Script inmeden önce gelen olaylar burada bekler. GA'nın kendi dataLayer'ına
// erkenden yazmak da mümkün ama o zaman `gtag` shim'i ile birlikte config
// sırasını garanti etmek gerekiyor; küçük bir kuyruk daha okunaklı.
const pending = [];

function loadNow() {
  if (ready) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { send_page_view: false, anonymize_ip: true });
  ready = true;

  // Bekleyenleri sırayla boşalt (ilk page_view burada gider).
  while (pending.length) {
    const [name, params] = pending.shift();
    try { window.gtag('event', name, params); } catch { /* noop */ }
  }
}

export function initAnalytics() {
  const host = location.hostname;
  // Skip on local dev / staging.
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.sslip.io')) return;
  if (started) return;
  started = true;

  // 2026-08-16 OLCUMU (canli ana sayfa, Yavas 4G + 4x CPU, 5 kosu medyan,
  // istek engelleme ile): gtag.js ERTELENMIS haliyle bile TBT'ye 205 ms
  // katiyordu — 1142 -> 937 ms. `load` + idle(timeout 4000) yavas cihazda hala
  // TBT penceresinin (FCP -> TTI) TAM ORTASINA dusuyor.
  //
  // Yeni kural: once KULLANICI ETKILESIMI, o yoksa 6 sn. Boylece gtag olcum
  // penceresinin disina cikiyor ama veri KAYBOLMUYOR — etkilesen kullanici
  // zaten aninda tetikliyor, etmeyen icin de kuyruk 6 sn sonra bosaliyor
  // (ilk page_view dahil; bkz. pending kuyrugu).
  let sokuldu = null;
  const tetikle = () => { if (sokuldu) sokuldu(); loadNow(); };
  const schedule = () => {
    const olaylar = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    const el = () => tetikle();
    olaylar.forEach((o) => addEventListener(o, el, { once: true, passive: true, capture: true }));
    const zaman = setTimeout(tetikle, 6000);
    sokuldu = () => {
      clearTimeout(zaman);
      olaylar.forEach((o) => removeEventListener(o, el, { capture: true }));
      sokuldu = null;
    };
  };
  if (document.readyState === 'complete') schedule();
  else addEventListener('load', schedule, { once: true });
}

function send(name, params) {
  if (ready && window.gtag) {
    try { window.gtag('event', name, params); } catch { /* noop */ }
    return;
  }
  // Kuyruk sınırsız büyümesin: erteleme birkaç saniye, 50 olay fazlasıyla yeter.
  if (started && pending.length < 50) pending.push([name, params]);
}

export function trackPageView(path) {
  send('page_view', {
    page_path: path,
    page_location: location.origin + path,
    page_title: document.title,
  });
}

export function trackEvent(name, params) {
  send(name, params || {});
}
