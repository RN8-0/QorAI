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

const REJECT_LABEL_RE = /^(marka|brand|model|ürün|urun|product|category|kategori|kategorie|renk|color|colour|slug|url|link|source|site|name|ad|title|başlık|baslik|kullanım amacı|kullanim amaci|usage|use case|series|seri)$/i;
const REJECT_INTERNAL_RE = /(qor|score|puan|anchor|engine|tier|rank|trend|internal|weight|ağırlık|agirlik|seed)/i;
const REJECT_VALUE_RE = /^(yes|no|true|false|var|yok|evet|hayır|hayir|ja|nein|n\/a|na|-|sponsorlu|sponsored|advert|ad|oyun|ofis|gaming|office|home|ev)$/i;

// Card headline specs follow epey: the value is the hero and must read like a
// real, comparable spec — so it has to carry a number (8 GB, 240 Hz, 1000 W…).
// Pure-text values (Oyun, Ofis, brand names, category names) are dropped here
// so cards never show the "Kategori / Marka" junk that used to leak through.
function looksUsefulSpec(label, value, product) {
  const cleanLabel = String(label || '').replace(/\s+/g, ' ').trim();
  const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleanLabel || !cleanValue) return false;
  if (REJECT_LABEL_RE.test(cleanLabel) || REJECT_INTERNAL_RE.test(cleanLabel)) return false;
  if (REJECT_VALUE_RE.test(cleanValue) || REJECT_INTERNAL_RE.test(cleanValue)) return false;
  if (cleanLabel.length > 38 || cleanValue.length > 28) return false;
  if (!/\d/.test(cleanValue)) return false; // must be a measurable, epey-style spec
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

function pushMetaSpec(out, seen, label, value, product) {
  const cleanLabel = String(label || '').replace(/\s+/g, ' ').trim();
  const cleanValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleanLabel || !cleanValue || out.length >= 4) return;
  if (REJECT_INTERNAL_RE.test(cleanLabel) || REJECT_INTERNAL_RE.test(cleanValue)) return;
  if (cleanLabel.length > 38 || cleanValue.length > 30) return;
  const key = `${cleanLabel.toLowerCase()}=${cleanValue.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    label: cleanLabel,
    value: cleanValue,
    pct: clampPct(inferredPct(cleanLabel, cleanValue, out.length, product)),
  });
}

function walkSpecSurface(value, cb, depth = 0) {
  if (!value || depth > 4) return;
  if (Array.isArray(value)) {
    for (const item of value) walkSpecSurface(item, cb, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null) continue;
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      cb(key, raw);
      continue;
    }
    const label = raw.label || raw.key || raw.name || raw.title || raw.spec || raw.k;
    const val = raw.value || raw.val || raw.text || raw.v;
    if (label && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')) {
      cb(label, val);
    }
    walkSpecSurface(raw, cb, depth + 1);
  }
}

function formatTs(ts, lang) {
  const n = Number(ts) || 0;
  if (!n) return '';
  const ms = n > 1e12 ? n : n * 1000;
  try {
    return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(new Date(ms));
  } catch {
    return '';
  }
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

  if (out.length < 4) {
    walkSpecSurface(product?.specSections, (label, value) => pushSpec(out, seen, label, value, null, product));
    walkSpecSurface(product?.sourceSpecSections, (label, value) => pushSpec(out, seen, label, value, null, product));
    walkSpecSurface(product?.multiLangSpecs?.[lang], (label, value) => pushSpec(out, seen, label, value, null, product));
    walkSpecSurface(product?.multiLangSpecs, (label, value) => pushSpec(out, seen, label, value, null, product));
  }

  if (out.length < 4) {
    const metaLabels = lang === 'tr'
      ? { score: 'Qor AI', specs: 'Özellik', category: 'Kategori', updated: 'Güncel' }
      : lang === 'de'
        ? { score: 'Qor AI', specs: 'Specs', category: 'Kategorie', updated: 'Aktuell' }
        : { score: 'Qor AI', specs: 'Specs', category: 'Category', updated: 'Updated' };
    const updated = formatTs(product?.updatedAtTs || product?.scrapedAtTs, lang);
    const fallbacks = [
      product?.techScore ? [metaLabels.score, String(Math.round(product.techScore))] : null,
      product?.specsCount ? [metaLabels.specs, String(product.specsCount)] : null,
      product?.category ? [metaLabels.category, categoryLabel(product.category, lang)] : null,
      updated ? [metaLabels.updated, updated] : null,
    ].filter(Boolean);
    for (const [label, value] of fallbacks) pushMetaSpec(out, seen, label, value, product);
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
