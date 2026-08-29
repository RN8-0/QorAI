import { Component } from 'react';

/* BEYAZ EKRAN KALKANI.
   React 18'de bir render hatası hiçbir sınır tarafından yakalanmazsa React
   KÖKÜN TAMAMINI söker: #root boşalır, sayfa bomboş beyaz kalır. Sitede bugüne
   kadar TEK BİR error boundary yoktu, yani herhangi bir bileşendeki tek bir
   istisna bütün siteyi öldürüyordu.

   ASIL TETİKLEYİCİ — bayat chunk. Rotalar `lazy(() => import(...))` ile
   geliyor. Gece derlemesi (04:17) her paketin içerik hash'ini değiştiriyor ve
   prebuild `spa/` altında SPA_KEEP_DAYS'ten eski dosyaları siliyor. Elinde eski
   HTML olan tarayıcı (edge/tarayıcı önbelleği, açık kalmış sekme) artık var
   olmayan bir chunk'ı istiyor -> dinamik import REDDEDİLİYOR -> yakalanmamış
   hata -> kök sökülüyor -> BEYAZ EKRAN. Üstelik ön-render metni de gitmiş
   oluyor, çünkü React #root'u zaten bir kez boşaltmış oluyor; index.html'deki
   12 sn'lik kurtarma da geriye getirecek bir şey bulamıyor.
   Puppeteer ile ÖLÇÜLDÜ (2026-08-29): ProductDetail chunk'ı 404 verdiğinde
   #root innerText uzunluğu 6168 -> 0.

   İKİ AYRI DURUM, İKİ AYRI DAVRANIŞ:
   1) Chunk/ağ kaynaklı yükleme hatası — KURTARILABİLİR. Sert yenileme taze
      HTML + taze hash getirir. Otomatik bir kez yenilenir.
   2) Gerçek render hatası — yenilemek düzeltmez. Sonsuz yenileme döngüsüne
      girmemek için kullanıcıya çalışan bir ekran gösterilir; header/footer
      ayakta kaldığı için site gezilebilir durumda kalır. */

const RELOAD_KEY = 'qor:chunkReload';
const RELOAD_COOLDOWN_MS = 60_000;

// Dinamik import / chunk yükleme hatalarının tarayıcıya göre değişen metinleri.
// Chrome: "Failed to fetch dynamically imported module"
// Firefox: "error loading dynamically imported module"
// Safari: "Importing a module script failed"
const CHUNK_RE = /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|Failed to fetch dynamically/i;

export function isChunkError(err) {
  const msg = String((err && (err.message || err.reason || err)) || '');
  const name = String((err && err.name) || '');
  return CHUNK_RE.test(msg) || name === 'ChunkLoadError';
}

/* Bir kez yenile — ve YALNIZCA bir kez. Sunucu gerçekten bozuksa (chunk kalıcı
   olarak 404) yenileme hatayı tekrar üretir; damga olmasa sayfa sonsuza dek
   kendini yenileyip dururdu. sessionStorage sekme ömrü boyunca yeter. */
export function reloadOnce() {
  try {
    const son = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - son < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* private mode: damga tutulamıyorsa yenilemeyi hiç deneme */
    return false;
  }
  // `reload()` HTML'i yeniden ister; sunucu/edge taze HTML verince paket
  // adresleri de yeni hash'e döner — bayat chunk sorununun çözümü tam olarak
  // bu. (`reload(true)` biçimi modern tarayıcılarda yok sayılıyor.)
  window.location.reload();
  return true;
}

const METIN = {
  tr: {
    baslik: 'Bu sayfa yüklenemedi',
    govde: 'Beklenmedik bir hata oluştu. Sayfayı yenilemek çoğu durumda yeterli oluyor.',
    yenile: 'Sayfayı yenile',
    ana: 'Ana sayfaya dön',
  },
  en: {
    baslik: 'This page failed to load',
    govde: 'Something went wrong while rendering this page. Reloading usually fixes it.',
    yenile: 'Reload page',
    ana: 'Back to home',
  },
};

function metin() {
  const d = document.documentElement;
  const kod = (d.lang || d.getAttribute('data-boot-lang') || 'en').slice(0, 2).toLowerCase();
  return METIN[kod] || METIN.en;
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err) {
    // Açılış kabuğu `position: fixed; inset: 0` — kaldırılmazsa hata ekranının
    // ÜSTÜNÜ örter ve kullanıcı yine boş ekran görür. Kabuğu kaldıran BootDone
    // Suspense sınırının içinde, yani chunk hiç gelmediğinde hiç koşmuyor.
    try { window.__qorBootDone?.(); } catch { /* kabuk yoksa sorun değil */ }
    if (isChunkError(err)) reloadOnce();
  }

  componentDidUpdate(oncekiProps) {
    // Rota değişince sınır kendini toparlar: kullanıcı bozuk sayfadan çıkıp
    // gezinmeye devam edebilsin diye. `resetKey` App'te pathname'dir.
    if (this.state.err && oncekiProps.resetKey !== this.props.resetKey) {
      this.setState({ err: null });
    }
  }

  render() {
    if (!this.state.err) return this.props.children;
    // Chunk hatasında yenileme zaten tetiklendi; bu ekran yenileme çalışmazsa
    // (veya soğuma penceresindeysek) görünen son çare.
    const t = metin();
    const govde = (
      <div className="page">
        <div className="container">
          <section className="card" style={{ padding: 'clamp(24px,4vw,40px)', maxWidth: 560, margin: '40px auto' }}>
            <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>{t.baslik}</h1>
            <p style={{ margin: '0 0 22px', color: 'var(--text-2)', lineHeight: 1.7 }}>{t.govde}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>{t.yenile}</button>
              <a className="btn btn-ghost" href="/">{t.ana}</a>
            </div>
          </section>
        </div>
      </div>
    );
    // `wrap`: kök sınır kendi <main>'ini taşımak ZORUNDA (global.css'te
    // `#root > main` düzen kuralları var). Rota sınırı zaten App'in <main>'i
    // içinde duruyor — orada ikinci bir <main> hem geçersiz HTML hem de
    // erişilebilirlik açısından yanlış olurdu.
    return this.props.wrap === false ? govde : <main>{govde}</main>;
  }
}
