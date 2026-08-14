import { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { catMeta, categoryLabel, priceForCountry, formatPriceAmount } from '../lib/format';
import { cardKeySpecs } from '../lib/categoryFilters';
import { prefetchProduct } from '../lib/typesense';
import { productPath } from '../lib/routes';
import { useGeoCountry } from '../lib/geo';
import { useCompare } from '../lib/compare';
import { useI18n } from '../i18n/index.jsx';
import { displayProductName, cleanProductName } from '../lib/productNames';
import Gauge, { techColor } from './Gauge.jsx';
import ProductImg from './ProductImg.jsx';
import './ProductCard.css';

function ProductImage({ p, eager = false }) {
  const meta = catMeta(p.category);
  const imageName = cleanProductName(p.name);
  if (p.imageUrl) {
    return (
      <div className="q-product-card-img">
        <ProductImg src={p.imageUrl} alt={imageName} size="card" eager={eager} />
      </div>
    );
  }
  return (
    <div className="q-product-card-img">
      <div className="ph">
        <span style={{ fontSize: 30 }}>{meta.icon}</span>
        <span className="lbl">{p.brand || meta.label}</span>
      </div>
    </div>
  );
}

function ProductCard({ product: p, variant = 'card', onClick, priority = false }) {
  const { lang } = useI18n();
  const geoCountry = useGeoCountry();
  const { has, tryAdd, remove } = useCompare();
  const [cmpMsg, setCmpMsg] = useState('');
  const hasScore = Number(p.techScore) > 0;
  // Fixed, category-correct headline specs (phone → screen/RAM/storage/battery,
  // TV/monitor → screen/resolution/panel/refresh…) built from the lean payload's
  // structured filterTokens. Already localized + formatted; render verbatim.
  const specs = cardKeySpecs(p, lang);
  // Price for the visitor's detected country only (never a non-shippable market).
  const cardPrice = priceForCountry(p, geoCountry);
  const inCompare = has(p.id);
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const cardName = displayProductName(p, lang);

  const onCompareClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inCompare) { remove(p.id); return; }
    const r = tryAdd(p);
    if (!r.ok && r.reason === 'category') {
      setCmpMsg(L('Different category', 'Farklı kategori', 'Andere Kategorie'));
      setTimeout(() => setCmpMsg(''), 2200);
    }
  };

  // Warm the product cache the moment the user shows intent (hover on desktop,
  // first touch on mobile) so the tap that follows opens the page instantly.
  const warm = () => prefetchProduct(p.id);

  return (
    <Link to={productPath(p)} onClick={onClick}
      onPointerEnter={warm} onTouchStart={warm} onFocus={warm}
      className={`q-product-card${variant === 'list' ? ' q-product-card-list' : ''}`} aria-label={cardName}>
      <button type="button"
        className={'q-product-card-cmp' + (inCompare ? ' on' : '')}
        onClick={onCompareClick}
        title={inCompare ? L('In compare', 'Karşılaştırmada', 'Im Vergleich') : L('Add to compare', 'Karşılaştırmaya ekle', 'Zum Vergleich')}
        aria-label={L('Compare', 'Karşılaştır', 'Vergleichen')}>
        {inCompare ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        )}
      </button>
      {cmpMsg && <span className="q-product-card-cmp-msg">{cmpMsg}</span>}
      <div className="q-product-card-media">
        {hasScore && (
          <span className="q-product-card-score gauge-badge" title={`Qor AI ${Math.round(p.techScore)}`}>
            <Gauge value={p.techScore} size={28} stroke={2.1} color={techColor(p.techScore)} fontSize={10} animate={false} />
          </span>
        )}
        <ProductImage p={{ ...p, name: cardName }} eager={priority} />
      </div>
      <div className="q-product-card-body">
        <div className="q-product-card-head">
          {p.brand && <span className="q-product-card-brand">{p.brand}</span>}
          {!p.brand && <span className="q-product-card-brand">{categoryLabel(p.category, lang)}</span>}
        </div>
        <span className="q-product-card-name">{cardName}</span>
        {cardPrice && (
          <span className="q-product-card-price">{formatPriceAmount(cardPrice.price, cardPrice.currency, lang)}</span>
        )}
        <div className="q-product-card-specs">
          {specs.map((spec, index) => (
            <span className="q-product-card-spec" key={`${spec.label}-${index}`} title={`${spec.label}: ${spec.value}`}>
              <b className="q-product-card-spec-val">{spec.value}</b>
              <small className="q-product-card-spec-lbl">{spec.label}</small>
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

// Memoised: the home feed re-renders the whole list when background enrichment
// upgrades a handful of thin cards to four specs. Without memo, all ~69 cards
// re-render on that pass (and on every parent state change), which showed up as a
// multi-hundred-ms main-thread block a couple seconds after load — exactly when
// the user tries to scroll. The parent hands enriched cards a NEW object ref and
// leaves the rest referentially stable, so only the cards that actually changed
// re-render. Cheap default shallow-prop compare is correct here (product ref +
// primitive props); context changes (lang/geo/compare) still re-render via hooks.
export default memo(ProductCard);

// İskelet, GERÇEK kartın DOM yapısını birebir kullanır: aynı sınıflar, aynı
// yazı boyutu/satır yüksekliği/ızgara. Yüksekliği elle px vermek yerine CSS'e
// bırakmanın sebebi ölçüldü — eski iskelet (serbest yükseklikli çubuklar) 164 px,
// gerçek kart 205 px geliyordu ve ana sayfada iskelet gerçek kartla yer
// değiştirirken 41 px'lik bir sıçrama oluyordu (CLS 0.017'nin tek kaynağı).
// Metin yerine `&nbsp;` konuyor: satır kutusu oluşuyor, içerik görünmüyor.
const SKEL_SPECS = [0, 1, 2, 3];
export function ProductCardSkeleton() {
  return (
    <div className="q-product-card" aria-hidden="true">
      <div className="q-product-card-media"><div className="q-product-card-img"><div className="skel" style={{ width: '100%', height: '100%' }} /></div></div>
      <div className="q-product-card-body">
        <div className="q-product-card-head">
          <span className="q-product-card-brand skel" style={{ width: '38%' }}>&nbsp;</span>
        </div>
        <span className="q-product-card-name skel" style={{ width: '88%' }}>&nbsp;</span>
        <span className="q-product-card-price skel" style={{ width: '46%' }}>&nbsp;</span>
        <div className="q-product-card-specs">
          {SKEL_SPECS.map((i) => (
            <span className="q-product-card-spec" key={i}>
              <b className="q-product-card-spec-val skel" style={{ width: '62%' }}>&nbsp;</b>
              <small className="q-product-card-spec-lbl skel" style={{ width: '80%' }}>&nbsp;</small>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
