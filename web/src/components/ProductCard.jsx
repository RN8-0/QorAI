import { useState } from 'react';
import { Link } from 'react-router-dom';
import { catMeta, categoryLabel, keySpecChips, priceForCountry, formatPriceAmount } from '../lib/format';
import { productPath } from '../lib/routes';
import { useGeoCountry } from '../lib/geo';
import { useCompare } from '../lib/compare';
import { useI18n } from '../i18n/index.jsx';
import { localizedSpecLabel, localizedSpecValue } from '../lib/specDisplay';
import { displayProductName, cleanProductName } from '../lib/productNames';
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
// High-signal qualitative spec values (no number, but still a real headline
// spec) — lets TV/monitor/laptop cards show panel type, resolution class, etc.
const GOOD_QUAL_SPEC_RE = /\b(oled|qled|amoled|mini[- ]?led|micro[- ]?led|neo ?qled|ips|lcd|led|tn|va panel|nano ?cell|nvme|ssd|hdd|emmc|ufs|wi-?fi|usb[- ]?c|hdmi|displayport|thunderbolt|bluetooth|nfc|uhd|qhd|fhd|full hd|ultra hd|retina|hdr|dolby|android|ios|ipados|windows|macos|tizen|webos|google tv|harmonyos)\b/i;

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
  // A card spec must be a real, comparable attribute. Usually that means it
  // carries a number (8 GB, 240 Hz, 1000 W…). But TVs / monitors / laptops have
  // headline specs that are qualitative (OLED panel, 4K, Wi-Fi 6, NVMe) — allow
  // those high-signal tokens too so those cards fill with REAL specs instead of
  // falling back to junk like the category name or a "last updated" date.
  if (!/\d/.test(cleanValue) && !GOOD_QUAL_SPEC_RE.test(cleanValue)) return false;
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
    walkSpecSurface(product?.multiLangSpecs?.[lang === 'de' ? 'en' : lang], (label, value) => pushSpec(out, seen, label, value, null, product));
    walkSpecSurface(product?.multiLangSpecs, (label, value) => pushSpec(out, seen, label, value, null, product));
  }

  // No meta padding: the card shows only REAL specs. Fewer than four honest
  // specs is better than filling the grid with the category name or a "last
  // updated" date, which read as nonsense next to genuine specs.
  return out.slice(0, 4);
}

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

export default function ProductCard({ product: p, variant = 'card', onClick, priority = false }) {
  const { t, lang } = useI18n();
  const geoCountry = useGeoCountry();
  const { has, tryAdd, remove } = useCompare();
  const [cmpMsg, setCmpMsg] = useState('');
  const hasScore = Number(p.techScore) > 0;
  const specs = productSpecs(p, t, lang);
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

  return (
    <Link to={productPath(p)} onClick={onClick}
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
            <Gauge value={p.techScore} size={28} stroke={2.1} color={techColor(p.techScore)} fontSize={10} />
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
          {specs.map((spec, index) => {
            const label = localizedSpecLabel(spec.label, lang);
            const value = localizedSpecValue(spec.value, lang);
            return (
              <span className="q-product-card-spec" key={`${spec.label}-${index}`} title={`${label}: ${value}`}>
                <b className="q-product-card-spec-val">{value}</b>
                <small className="q-product-card-spec-lbl">{label}</small>
              </span>
            );
          })}
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
