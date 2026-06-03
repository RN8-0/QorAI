import { Link } from 'react-router-dom';
import { catMeta } from '../lib/format';
import { productPath } from '../lib/routes';
import { useI18n } from '../i18n/index.jsx';
import Gauge, { techColor } from './Gauge.jsx';
import ProductImg from './ProductImg.jsx';

function scoreChipClass(s) {
  const v = Number(s) || 0;
  return v >= 95 ? 's-ex' : v >= 80 ? 's-gd' : v > 0 ? 's-av' : 's-na';
}

function ProductImage({ p }) {
  const meta = catMeta(p.category);
  if (p.imageUrl) {
    return (
      <div className="img-tile">
        <ProductImg src={p.imageUrl} alt={p.name} size="card" />
      </div>
    );
  }
  return (
    <div className="img-tile">
      <div className="ph">
        <span style={{ fontSize: 30 }}>{meta.icon}</span>
        <span className="lbl">{p.brand || meta.label}</span>
      </div>
    </div>
  );
}

export default function ProductCard({ product: p, variant = 'card' }) {
  const { t } = useI18n();
  const hasScore = Number(p.techScore) > 0;

  if (variant === 'list') {
    return (
      <Link to={productPath(p.id)} className="lrow">
        <ProductImage p={p} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="nm" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</div>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            {p.brand && <span className="mk">{p.brand}</span>}
            {hasScore && <span className={`score-chip ${scoreChipClass(p.techScore)}`}>⚡ {Math.round(p.techScore)}</span>}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={productPath(p.id)} className="pcard">
      <div className="top">
        {hasScore && (
          <span className="badge gauge-badge">
            <Gauge value={p.techScore} size={30} stroke={2.6} color={techColor(p.techScore)} fontSize={11} />
          </span>
        )}
        <ProductImage p={p} />
      </div>
      <div className="body">
        {p.brand && <span className="brand-k">{p.brand}</span>}
        <span className="name">{p.name}</span>
        <span className="btn btn-primary btn-block cta">{t('card.review')}</span>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="pcard">
      <div className="top"><div className="img-tile" style={{ aspectRatio: 1 }}><div className="skel" style={{ width: '100%', height: '100%' }} /></div></div>
      <div className="body">
        <div className="skel" style={{ height: 11, width: '35%' }} />
        <div className="skel" style={{ height: 15, width: '85%', marginTop: 8 }} />
        <div className="skel" style={{ height: 40, width: '100%', marginTop: 10 }} />
      </div>
    </div>
  );
}
