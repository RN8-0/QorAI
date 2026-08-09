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
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const rows = sortedOffers(offers, country);
  const seePrice = L('See price', 'Fiyata bak', 'Preis ansehen');
  const storeLabel = L('Store', 'Mağaza', 'Shop');
  // Gerçek Amazon teklifi listede yoksa, en sona "fiyata bak" arama satırı.
  const showAmazonSearch = amazonHref && !rows.some(isAmazonOffer);

  if (rows.length === 0 && !showAmazonSearch) {
    return emptyText ? <div className="pd-price-empty">{emptyText}</div> : null;
  }

  return (
    <div className={'pd-prices-list' + (compact ? ' pd-prices-list-compact' : '')}>
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
              {cell}
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
            {cell}
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
