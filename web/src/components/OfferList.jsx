// ═══════════════════════════════════════════════════════════════════════════
//  Mağaza fiyat listesi — TEK KAYNAK.
//
//  NEDEN: aynı liste hem ürün sayfasında hem karşılaştırma sayfasında
//  gerekiyordu ve iki ayrı yerde ayrı ayrı yazılmıştı. Karşılaştırma tarafı
//  tek kutuya sıkıştırılmış "en iyi teklif" gösteriyordu; kullanıcı ürün
//  sayfasındaki listenin AYNISINI istiyor (alt alta, ucuzdan pahalıya, yeni
//  fiyat eklenince bir alta düşecek şekilde).
//
//  Artık iki sayfa da BU bileşeni çağırıyor: davranış ve görünüm inşa gereği
//  aynı, tek yerde değişiyor.
// ═══════════════════════════════════════════════════════════════════════════
import AmazonLogo from './AmazonLogo.jsx';
import { formatOfferPrice, offerClickPath } from '../lib/offers';
import './OfferList.css';

export function isAmazonOffer(o) {
  return (
    String(o?.network || '').toLowerCase().includes('amazon') ||
    /(^|\.)amazon\./i.test(o?.url || '')
  );
}

/** Mağaza logosu: epey_store satırları domaini kayıtta taşır, linkli satırlarda url'den çıkarılır. */
export function storeFavDomain(o) {
  if (o?.storeDomain) return o.storeDomain;
  try {
    return new URL(o.directUrl || o.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Seçili ülkenin gösterilebilir tekliflerini UCUZDAN PAHALIYA sıralar ve
 * mağaza başına TEK satır bırakır (aynı mağaza iki kez listelenmez).
 *
 * AMAZON DA SIRAYA GİRER — sabit olarak en üste konmaz. Kullanıcı listeyi
 * fiyat sırasıyla okuyor; daha ucuz bir mağaza Amazon'un altında kalırsa liste
 * yalan söylemiş olur. Fiyatı olmayan satır (Amazon arama linki) EN SONA gider.
 *
 * SIKI ÜLKE KURALI: yalnız `country` teklifleri; başka pazarın fiyatı ASLA
 * gösterilmez (cross-market fallback yok).
 */
export function sortedOffers(offers, country) {
  const sel = String(country || '').toUpperCase();
  const list = Array.isArray(offers) ? offers : [];
  const rows = list
    .filter((o) => {
      // Linksiz vitrin satırı (epey_store) yalnız GERÇEK fiyatla listelenir.
      if (!o.url && !o.hasExactPrice) return false;
      const oc = String(o.country || '').toUpperCase();
      if (oc && sel && oc !== sel) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.hasExactPrice !== b.hasExactPrice) return a.hasExactPrice ? -1 : 1;
      return (a.price || Infinity) - (b.price || Infinity);
    });
  const seen = new Set();
  return rows.filter((o) => {
    const key = String(o.store || o.network || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Satirin ALT SATIRI: kargo + fiyatin ne zaman dogrulandigi (+ stok uyarisi).
 *
 * NEDEN: 2026-08-16'da Epey ile yan yana olculdu — Epey her fiyat satirinda
 * saticiyi, "Ucretsiz Kargo"yu ve "13 dk once"yi gosteriyor; bizim satirimizda
 * yalnizca logo + fiyat vardi. Bir fiyat karsilastirma sitesinde guven tam da
 * bu ayrintilardan geliyor.
 * Veri ZATEN kayitta duruyordu (olculdu: shipping %100 dolu ve %90'i 0,
 * lastCheckedAt %100 dolu, TR fiyatlarinin yasi medyan 4 saat) — yalnizca
 * ekrana basilmiyordu. Olmayan tek alan `title` (varyant adi): %0 dolu,
 * o yuzden burada YOK; scraper onu cekmeye baslarsa eklenir.
 */
function taze(iso, L) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const dk = Math.round((Date.now() - t) / 60000);
  if (dk < 2) return L('just now', 'az önce');
  if (dk < 60) return L(`${dk} min ago`, `${dk} dk önce`);
  const sa = Math.round(dk / 60);
  if (sa < 24) return L(`${sa} h ago`, `${sa} saat önce`);
  const g = Math.round(sa / 24);
  return L(`${g} d ago`, `${g} gün önce`);
}

function OfferMeta({ offer, lang, L, compact }) {
  const parca = [];
  // Kargo: 0 ise ucretsiz, pozitifse tutari yaz (kullanici toplam maliyeti
  // gormeden karar veremez).
  if (offer.shipping === 0) {
    parca.push(<span key="k" className="pd-meta-free">{L('Free shipping', 'Ücretsiz kargo')}</span>);
  } else if (offer.shipping > 0) {
    parca.push(<span key="k">{L('+ shipping', '+ kargo')} {formatOfferPrice({ ...offer, price: offer.shipping }, lang)}</span>);
  }
  if (offer.inStock === false) {
    parca.push(<span key="s" className="pd-meta-out">{L('Out of stock', 'Stokta yok')}</span>);
  }
  // TAZELIK SATIR BASINA YAZILMIYOR. Bir urunun butun teklifleri ayni
  // tarama kosusundan geliyor, dolayisiyla dort satirin dordu de AYNI degeri
  // yaziyordu (olculdu, 5 urun: 7/7/7/7 · 8/8/8/8 · 7/1/7/7 · 42) — bilgi
  // tasimayan tekrar. Tek bir ozet satiri olarak listenin ustunde duruyor.
  if (!parca.length) return null;
  return (
    <span className="pd-price-meta">
      {parca.map((p, i) => (
        <span key={p.key}>{i > 0 ? <span className="pd-meta-sep">·</span> : null}{p}</span>
      ))}
    </span>
  );
}

function StoreCell({ offer, storeLabel }) {
  const dom = storeFavDomain(offer);
  return (
    <span className="pd-price-store">
      {dom ? (
        <img
          className="pd-store-fav"
          src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(dom)}`}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      {offer.store || storeLabel}
    </span>
  );
}

/**
 * @param {object[]} offers      normalizeOffer() çıktısı
 * @param {string}   country     seçili teslimat ülkesi
 * @param {string}   lang        arayüz dili
 * @param {string}   geoCountry  ziyaretçinin ülkesi (Amazon etiketlemesi)
 * @param {string}   amazonHref  gerçek Amazon teklifi yokken kullanılacak arama linki
 * @param {boolean}  compact     karşılaştırma kolonu (dar) görünümü
 */
export default function OfferList({
  offers,
  country,
  lang = 'en',
  geoCountry = '',
  amazonHref = '',
  compact = false,
  emptyText = '',
}) {
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const rows = sortedOffers(offers, country);
  // Listenin tazeligi: en son kontrol edilen teklifin zamani. Fiyat yasi
  // ziyaretcinin bilmesi gereken bir sey (katalogda medyan yas gunlerce),
  // ama satir satir tekrarlamak yerine BIR KEZ soyleniyor.
  const enTaze = rows
    .map((o) => Date.parse(o.lastCheckedAt || ''))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  const tazelikMetni = enTaze ? taze(new Date(enTaze).toISOString(), L) : '';
  const seePrice = L('See price', 'Fiyata bak');
  const storeLabel = L('Store', 'Mağaza');
  // Gerçek Amazon teklifi listede yoksa, en sona "fiyata bak" arama satırı.
  const showAmazonSearch = amazonHref && !rows.some(isAmazonOffer);

  if (rows.length === 0 && !showAmazonSearch) {
    return emptyText ? <div className="pd-price-empty">{emptyText}</div> : null;
  }

  return (
    <div className={'pd-prices-list' + (compact ? ' pd-prices-list-compact' : '')}>
      {!compact && tazelikMetni && (
        <div className="pd-prices-fresh">
          {L('Prices last checked', 'Fiyatlar en son kontrol edildi:')} <b>{tazelikMetni}</b>
        </div>
      )}
      {rows.map((o) => {
        const cell = isAmazonOffer(o) ? (
          <span className="pd-price-store">
            <AmazonLogo height={compact ? 20 : 26} />
          </span>
        ) : (
          <StoreCell offer={o} storeLabel={storeLabel} />
        );
        // Linksiz vitrin satırı: sadece logo + fiyat, tıklanmaz.
        if (!o.url) {
          return (
            <div
              key={o.id || `${o.store}-${o.price}`}
              className="pd-price-row pd-price-row-static"
            >
              <span className="pd-price-left">
                {cell}
                <OfferMeta offer={o} lang={lang} L={L} compact={compact} />
              </span>
              <span className="pd-price-amt">{formatOfferPrice(o, lang)}</span>
            </div>
          );
        }
        return (
          <a
            key={o.id || o.url}
            className="pd-price-row"
            href={offerClickPath(o, geoCountry)}
            target="_blank"
            rel="sponsored noopener"
          >
            <span className="pd-price-left">
              {cell}
              <OfferMeta offer={o} lang={lang} L={L} compact={compact} />
            </span>
            {o.hasExactPrice ? (
              <span className="pd-price-amt">{formatOfferPrice(o, lang)}</span>
            ) : (
              <span className="pd-price-amt pd-price-amt-link">{seePrice}</span>
            )}
          </a>
        );
      })}
      {showAmazonSearch && (
        <a
          className="pd-price-row"
          href={amazonHref}
          target="_blank"
          rel="sponsored noopener nofollow"
        >
          <span className="pd-price-store">
            <AmazonLogo height={compact ? 20 : 26} />
          </span>
          <span className="pd-price-amt pd-price-amt-link">{seePrice}</span>
        </a>
      )}
    </div>
  );
}
