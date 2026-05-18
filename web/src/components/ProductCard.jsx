import { Link } from 'react-router-dom';
import { catMeta, scoreClass, scoreLabel, keySpecChips, PLACEHOLDER_IMG } from '../lib/format';
import { useT } from '../i18n/index.jsx';
import './ProductCard.css';

export default function ProductCard({ product: p }) {
  const t = useT();
  const meta = catMeta(p.category);
  const chips = keySpecChips(p);

  return (
    <Link to={`/product/${p.id}`} className="pcard">
      <div className="pcard-img">
        <img
          src={p.imageUrl || PLACEHOLDER_IMG}
          alt={p.name}
          loading="lazy"
          onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }}
        />
      </div>

      <div className="pcard-body">
        <div className="pcard-head">
          {p.brand && <span className="pcard-brand">{p.brand}</span>}
          <span className={`score ${scoreClass(p.techScore)}`}>⚡ {scoreLabel(p.techScore)}</span>
        </div>
        <h3 className="pcard-name">{p.name}</h3>

        {chips.length > 0 ? (
          <div className="pcard-specs">
            {chips.map((c) => (
              <div className="pcard-spec" key={c.labelKey}>
                <span className="pcard-spec-label">{t(c.labelKey)}</span>
                <span className="pcard-spec-val">{c.value}</span>
                <span className="pcard-spec-bar"><i style={{ width: `${c.pct}%` }} /></span>
              </div>
            ))}
          </div>
        ) : (
          <div className="pcard-cat-row">{meta.icon} {meta.label}</div>
        )}

        <span className="pcard-go">{t('card.review')}</span>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="pcard">
      <div className="pcard-img"><div className="skel" style={{ width: '100%', height: '100%' }} /></div>
      <div className="pcard-body">
        <div className="skel" style={{ height: 11, width: '35%' }} />
        <div className="skel" style={{ height: 15, width: '85%', marginTop: 8 }} />
        <div className="skel" style={{ height: 52, width: '100%', marginTop: 10 }} />
      </div>
    </div>
  );
}
