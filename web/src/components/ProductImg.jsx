import { useState, useEffect, useRef } from 'react';
import { imageCandidates, imageSrcSet } from '../lib/imageUrl';
import { PLACEHOLDER_IMG } from '../lib/format';

// Her slot için tarayıcıya "bu görsel ekranda kaç piksel olacak" bilgisi.
// `srcset` ile birlikte, cihaz piksel oranına göre EN KÜÇÜK yeterli dosya
// indirilir — mobilde masaüstü boyutunda görsel inmesi böylece biter.
// Değerler CANLIDA ÖLÇÜLDÜ (kart görseli 375px viewport'ta 114px = ~30vw,
// masaüstünde 136px). `sizes` gerçekten geniş verilirse tarayıcı gereğinden
// büyük basamağı indirir — ilk denemede 45vw yazdığım için mobilde 260 yerine
// 420 iniyordu. Ölçülen orana çekildi.
const SIZES = {
  thumb: '40px',
  list: '(max-width: 640px) 96px, 140px',
  card: '(max-width: 640px) 31vw, (max-width: 1024px) 24vw, 150px',
  full: '(max-width: 900px) 92vw, 420px',
};
// NOT: `width`/`height` attribute'u BİLEREK verilmiyor. global.css yalnızca
// `img { max-width: 100% }` tanımlıyor; bazı slotlarda (Compare thumb, Home
// rail, CompareBar, Profile) konteyner img'e width/height dayatmıyor, dolayısıyla
// attribute vermek görselleri o ölçüye SABİTLEYİP düzeni bozuyordu. CLS'i
// düzeltmenin doğru yolu bu slotlara CSS kutusu vermek — ayrı iş.

// ── SAYFA BOSA CIKINCA KALAN TUM GORSELLERI ONBELLEGE AL ──────────────────
// Kullanici istegi: "sayfa yuklenmeli ve onbellekte kalmasi lazim". Yalnizca
// ekrana yaklasan gorseli isitmak yetmiyor — hizli kaydirmada indirme yine
// gec basliyor (olculdu: en uzun kesintisiz gorselsizlik 1000 ms -> 400 ms).
// Bu gecici kuyruk, ILK EKRAN OTURDUKTAN SONRA (load + 1,5 sn / bos zaman)
// sayfadaki KALAN kart gorsellerini sirayla, en fazla 3 es zamanli olarak
// indirir. <img> etiketleri hala lazy: ilk boyamanin ag oncelikleri
// DEGISMIYOR, yalnizca kullanici oraya varmadan dosya onbellege giriyor.
const _kuyruk = [];
const _isitilan = new Set();
let _basladi = false;
let _akan = 0;

function _sirayiIsit() {
  while (_akan < 4 && _kuyruk.length) {
    const url = _kuyruk.shift();
    if (!url || _isitilan.has(url)) continue;
    _isitilan.add(url);
    _akan += 1;
    const im = new Image();
    im.decoding = 'async';
    const bitti = () => { _akan -= 1; _sirayiIsit(); };
    im.onload = bitti;
    im.onerror = bitti;
    im.src = url;
  }
}

function _isitmayiPlanla() {
  if (_basladi || typeof window === 'undefined') return;
  // Veri tasarrufu acikken ya da 2G'de on-isitma YAPILMAZ: orada fazladan
  // indirme kullaniciya yarar degil zarar verir.
  try {
    const c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(String(c.effectiveType || '')))) { _basladi = true; return; }
  } catch { /* connection API yoksa devam */ }
  _basladi = true;
  const basla = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => _sirayiIsit(), { timeout: 3000 });
    else setTimeout(_sirayiIsit, 0);
  };
  // Ilk ekranin agini/CPU'sunu hic tutmamak icin `load` + 1,5 sn bekliyoruz.
  // GECIKME + ES ZAMANLILIK OLCULEREK SECILDI. Once 1500 ms/2 denendi; LCP
  // regresyonundan suphelenildi ama ProductImg geri alinip olculdugunde AYNI
  // LCP cikti — yani isitmadan degil, iki agacin farkli ana sayfa SEO
  // kabugundan geliyordu. Dolayisiyla es zamanlilik 4'e cikarildi: CANLIDA
  // gorsel kaynagi 3. taraf (resim.epey.com) ve yavas; 2 kanal yetismiyordu.
  if (document.readyState === 'complete') setTimeout(basla, 2000);
  else window.addEventListener('load', () => setTimeout(basla, 2000), { once: true });
}

function _isitmayaEkle(url) {
  if (!url || _isitilan.has(url) || _kuyruk.includes(url)) return;
  _kuyruk.push(url);
  _isitmayiPlanla();
  if (_basladi && _akan < 4 && document.readyState === 'complete') _sirayiIsit();
}

// <img> that shows the sharpest available source variant and steps down through
// fallbacks on error (high-res -> big -> stored medium -> placeholder), so a
// missing high-res variant never leaves a broken/blank image.
export default function ProductImg({ src, alt, className, style, size = 'card', eager = false }) {
  const list = src ? [...imageCandidates(src, size), PLACEHOLDER_IMG] : [PLACEHOLDER_IMG];
  const [i, setI] = useState(0);
  const ref = useRef(null);
  // Reset to the sharpest candidate whenever the source changes.
  useEffect(() => { setI(0); }, [src]);
  const current = list[Math.min(i, list.length - 1)];

  // ── GORSELI EKRANA GIRMEDEN ONCE ISIT (2026-08-18) ──────────────────────
  // SIKAYET: "mobilde kaydirinca arkaplan var ama icerik yok, 1-2 sn sonra
  // geliyor". OLCULDU (scripts/_kaydirma_bosluk.mjs · 390x844 · 4x CPU ·
  // Yavas 4G · gercekci kucuk adimli kaydirma): kart kutusu ekranda, ama
  // gorseli olmayan kart 1000 ms'ye kadar oyle kaliyor. Izgara BOS DEGIL
  // (bosPx = 0) — eksik olan GORSEL.
  //
  // Sebep: `loading="lazy"` gorseli ancak ekrana YAKLASINCA indirmeye
  // basliyor; kaynak da 3. taraf (resim.epey.com, Cloudflare RUM P75
  // 6592 ms). Kullanici oraya vardiginda indirme daha yeni basliyor.
  //
  // Cozum: kart ekrana ~1,5 ekran kala URL'i `new Image()` ile ONBELLEGE
  // cektiriyoruz. <img> hala lazy — yani ilk ekranin agi bozulmuyor — ama
  // sira ona geldiginde dosya ZATEN TARAYICI ONBELLEGINDE oluyor.
  // Yer tutucu isitilmez (zaten yerel), eager gorseller de zaten oncelikli.
  useEffect(() => {
    if (eager || !current || current === PLACEHOLDER_IMG) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    let isitildi = false;
    // 1) Ekrana ~1,5 ekran kala HEMEN isit (kaydirma yonunde onde ol).
    const io = new IntersectionObserver((girisler) => {
      if (!girisler.some((g) => g.isIntersecting) || isitildi) return;
      isitildi = true;
      io.disconnect();
      const on = new Image();
      on.decoding = 'async';
      on.src = current;
    }, { rootMargin: '1500px 0px 1500px 0px', threshold: 0 });
    io.observe(el);
    // 2) Ayrica sayfa bosa cikinca sirayla isitilacak kuyruga da gir; boylece
    //    kullanici hizli kaydirsa bile dosya coktan onbellekte olur.
    _isitmayaEkle(current);
    return () => io.disconnect();
  }, [current, eager]);
  // srcset SADECE proxy adayı kullanılırken anlamlı: basamakları wsrv.nl
  // üretiyor. Doğrudan Epey URL'i kullanılıyorsa (normal durum) srcset
  // verilmez — verilse tarayıcı çalışmayan proxy basamağını seçip yine
  // hataya düşerdi. Proxy'ye gerçekten düşüldüğünde devreye girer.
  const srcSet = src && String(current).includes('wsrv.nl') ? imageSrcSet(src, size) : '';
  return (
    <img
      ref={ref}
      src={current}
      {...(srcSet ? { srcSet, sizes: SIZES[size] || SIZES.card } : {})}
      alt={alt || ''}
      className={className}
      style={style}
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager ? 'high' : 'auto'}
      decoding="async"
      onError={() => setI((n) => (n < list.length - 1 ? n + 1 : n))}
    />
  );
}
