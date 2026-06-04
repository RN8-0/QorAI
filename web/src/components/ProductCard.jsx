import { Link } from 'react-router-dom';
import { catMeta, categoryLabel, keySpecChips } from '../lib/format';
import { productPath } from '../lib/routes';
import { useI18n } from '../i18n/index.jsx';
import Gauge, { techColor } from './Gauge.jsx';
import ProductImg from './ProductImg.jsx';
import './ProductCard.css';

function clampPct(n) {
  return Math.max(8, Math.min(100, Math.round(Number(n) || 0)));
}

function inferredPct(label, value, index, product) {
  const text = `${label || ''} ${value || ''}`.toLowerCase();
  const num = parseFloat(String(value || '').replace(',', '.').match(/\d+(?:[.,]\d+)?/)?.[0] || '');
  if (Number.isFinite(num)) {
    if (/mah|batarya|battery|akku/.test(text)) return clampPct((num / 7000) * 100);
    if (/\btb\b/.test(text)) return clampPct((num * 1024 / 2048) * 100);
    if (/\bgb\b/.test(text) && /ram|memory|bellek/.test(text)) return clampPct((num / 32) * 100);
    if (/\bgb\b/.test(text)) return clampPct((num / 2048) * 100);
    if (/inch|inç|display|screen|ekran|"/.test(text)) return clampPct((num / 7) * 100);
    if (/\bhz\b/.test(text)) return clampPct((num / 240) * 100);
    if (/\bw\b|watt|güç|power/.test(text)) return clampPct((num / 1200) * 100);
  }
  const score = Number(product?.techScore) || 70;
  return clampPct(score - index * 10);
}

const REJECT_LABEL_RE = /^(marka|brand|model|ürün|urun|product|category|kategori|kategorie|renk|color|colour|slug|url|link|source|site|name|ad|title|başlık|baslik)$/i;
const REJECT_INTERNAL_RE = /(qor|score|puan|anchor|engine|tier|rank|trend|internal|weight|ağırlık|agirlik|seed)/i;
const REJECT_VALUE_RE = /^(yes|no|true|false|var|yok|evet|hayır|hayir|ja|nein|n\/a|na|-|sponsorlu|sponsored|advert|ad)$/i;

function looksUsefulSpec(label, value, product) {
  const cleanLabel = String(label || '').replace(/\s+/g, ' ').trim();
  const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleanLabel || !cleanValue) return false;
  if (REJECT_LABEL_RE.test(cleanLabel) || REJECT_INTERNAL_RE.test(cleanLabel)) return false;
  if (REJECT_VALUE_RE.test(cleanValue) || REJECT_INTERNAL_RE.test(cleanValue)) return false;
  if (cleanLabel.length > 38 || cleanValue.length > 42) return false;
  const brand = String(product?.brand || '').trim().toLowerCase();
  const category = String(product?.category || '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  const valueLower = cleanValue.toLowerCase();
  if (brand && valueLower === brand) return false;
  if (category && valueLower === category) return false;
  return true;
}

function pushSpec(out, seen, label, value, pct, product) {
  const cleanLabel = String(label || '').replace(/\s+/g, ' ').trim();
  const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleanLabel || !cleanValue || out.length >= 4) return;
  if (!looksUsefulSpec(cleanLabel, cleanValue, product)) return;
  const key = `${cleanLabel.toLowerCase()}=${cleanValue.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    label: cleanLabel,
    value: cleanValue,
    pct: clampPct(pct || inferredPct(cleanLabel, cleanValue, out.length, product)),
  });
}

function productSpecs(product, t, lang) {
  const out = [];
  const seen = new Set();

  for (const chip of keySpecChips(product)) {
    pushSpec(out, seen, t(chip.labelKey), chip.value, chip.pct, product);
  }

  const keySpecs = product?.keySpecs && typeof product.keySpecs === 'object' ? product.keySpecs : {};
  for (const [label, value] of Object.entries(keySpecs)) {
    pushSpec(out, seen, label, value, null, product);
  }

  const specs = product?.specs && typeof product.specs === 'object' ? product.specs : {};
  for (const [label, value] of Object.entries(specs)) {
    pushSpec(out, seen, label, value, null, product);
  }

  const textParts = String(product?.keySpecsText || '')
    .split(/[|•;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const part of textParts) {
    const pieces = part.split(/:|=/);
    if (pieces.length >= 2) pushSpec(out, seen, pieces[0], pieces.slice(1).join(':'), null, product);
  }

  return out.slice(0, 4);
}

function ProductImage({ p }) {
  const meta = catMeta(p.category);
  if (p.imageUrl) {
    return (
      <div className="q-product-card-img">
        <ProductImg src={p.imageUrl} alt={p.name} size="card" />
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

export default function ProductCard({ product: p, variant = 'card', onClick }) {
  const { t, lang } = useI18n();
  const hasScore = Number(p.techScore) > 0;
  const specs = productSpecs(p, t, lang);

  return (
    <Link to={productPath(p.id)} onClick={onClick}
      className={`q-product-card${variant === 'list' ? ' q-product-card-list' : ''}`} aria-label={p.name}>
      <div className="q-product-card-media">
        {hasScore && (
          <span className="q-product-card-score gauge-badge" title={`Qor AI ${Math.round(p.techScore)}`}>
            <Gauge value={p.techScore} size={28} stroke={2.1} color={techColor(p.techScore)} fontSize={10} />
          </span>
        )}
        <ProductImage p={p} />
      </div>
      <div className="q-product-card-body">
        <div className="q-product-card-head">
          {p.brand && <span className="q-product-card-brand">{p.brand}</span>}
          {!p.brand && <span className="q-product-card-brand">{categoryLabel(p.category, lang)}</span>}
        </div>
        <span className="q-product-card-name">{p.name}</span>
        <div className="q-product-card-specs">
          {specs.map((spec, index) => (
            <span className="q-product-card-spec" key={`${spec.label}-${index}`}>
              <span className="q-product-card-spec-row">
                <span className="q-product-card-spec-label">{spec.label}</span>
                <b className="q-product-card-spec-val">{spec.value}</b>
              </span>
              <span className="q-product-card-spec-bar"><i style={{ width: `${spec.pct}%` }} /></span>
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="q-product-card">
      <div className="q-product-card-media"><div className="q-product-card-img"><div className="skel" style={{ width: '100%', height: '100%' }} /></div></div>
      <div className="q-product-card-body">
        <div className="skel" style={{ height: 11, width: '35%' }} />
        <div className="skel" style={{ height: 15, width: '85%', marginTop: 8 }} />
        <div className="skel" style={{ height: 8, width: '95%', marginTop: 12 }} />
        <div className="skel" style={{ height: 8, width: '80%', marginTop: 8 }} />
        <div className="skel" style={{ height: 8, width: '90%', marginTop: 8 }} />
      </div>
    </div>
  );
}
