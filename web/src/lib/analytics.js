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

// BASLIK OTURMADAN GONDERME.
//
// `document.title` gezinme aninda okunuyordu ve bu, Analytics'e YANLIS
// baslik yaziyordu. Sebep: katalogun 107.685 urununden yalnizca 3.754'u
// (%3,5) on-render ediliyor; kalan adreslerde sunucu "Page not found"
// kabugunu donuyor. SPA sayfayi DOGRU render ediyor ama bu efekt
// `useSeo` basligi yazmadan ONCE kosuyor, dolayisiyla calisir durumdaki
// bir urun sayfasi Analytics'te "Page not found" olarak sayiliyordu.
// Kullanicinin gordugu "Page not found 18 goruntuleme, +%260" bunun ta
// kendisi -- sayfalar bulunamiyor DEGIL, YANLIS ETIKETLENIYOR.
//
// Cozum: baslik degisene kadar (ya da 2 sn) bekle, sonra gonder. Olay
// zaten erteleniyor (ilk etkilesim ya da 6 sn), bu bekleme olcumu
// geciktirmiyor.
// DESEN 2026-09-01'DEN BERI HIC ESLESMIYORDU (2026-10-02'de bulundu):
// sonundaki kelime siniri `\b` dosyaya GERCEK BACKSPACE (0x08) olarak
// yazilmisti, desen her basligin sonunda o karakteri ariyordu. `oturdu`
// hep true cikti, bekleme hic devreye girmedi ve page_view aninda kabuk
// basligiyla gitti. Ters bolu kod-uretim yolunda yenebiliyor; bu satira
// dokunursan baytlara bak (`od -c`).
//
// `\b` geri KONMADI: JS'te ASCII'dir, "bulunamadı"daki `ı`dan sonra sinir
// olusmaz. `qor ai` da CIKARILDI: ana sayfanin KALICI basligi "Qor AI — …"
// ile basliyor; desen onu da kabuk sayarsa en cok gezilen sayfanin
// page_view'i 10 sn tavana kadar bekler ve erken cikan ziyaretci kaybolur.
// Bugun gecici baslik tasiyan TEK kabuk 404 kabugu: kurasyon disi urun
// adresine nginx onu 200 ile verir, SPA urunu cizince baslik degisir.
// Diger her rotanin kendi on-render basligi var.
const KABUK_BASLIKLARI = /^(page not found|sayfa bulunamad[ıi])/i;

// 2 SN DE YETMIYORDU (olculdu 2026-10-02, canli /product/xiaomi-14t-pro):
// sayfa 4 sn icinde "Xiaomi 14T Pro (256 GB) …" basligiyla cizildi. Urun
// sayfasi rota parcasini + Typesense yanitini bekliyor; yavas baglantida
// 2 sn'yi rahatca asiyor. Tavan yalnizca baslik HALA kabuk basligiyken
// devrede; basligi hazir sayfa ilk kontrolde gonderilir.
const BASLIK_TAVANI_MS = 10000;

// Tavan uzayinca yeni bir risk: baslik oturmadan baska sayfaya gecilirse
// onceki gorunum SONRAKI sayfanin basligiyla gidebilir. Yeni gorunum
// basladiginda bekleyen eskisi, KENDI son gordugu baslikla hemen gider.
let bekleyenGorunum = null;

export function trackPageView(path) {
  if (bekleyenGorunum) bekleyenGorunum();
  const basla = Date.now();
  const ilk = document.title;
  let sonBaslik = ilk;
  let gitti = false;
  const gonder = () => {
    if (gitti) return;
    gitti = true;
    if (bekleyenGorunum === gonder) bekleyenGorunum = null;
    send('page_view', {
      page_path: path,
      page_location: location.origin + path,
      page_title: sonBaslik,
    });
  };
  bekleyenGorunum = gonder;
  const bekle = () => {
    if (gitti) return;
    sonBaslik = document.title;
    const oturdu = sonBaslik !== ilk || !KABUK_BASLIKLARI.test(sonBaslik);
    if (oturdu || Date.now() - basla > BASLIK_TAVANI_MS) { gonder(); return; }
    setTimeout(bekle, 120);
  };
  bekle();
}

export function trackEvent(name, params) {
  send(name, params || {});
}
