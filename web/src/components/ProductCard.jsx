import { Link } from 'react-router-dom';
import { catMeta, scoreClass, scoreLabel, PLACEHOLDER_IMG } from '../lib/format';
import './ProductCard.css';

export default function ProductCard({ product: p }) {
  const meta = catMeta(p.category);
  return (
    <Link to={`/product/${p.id}`} className="pcard">
      <div className="pcard-img">
        <span className="pcard-cat">{meta.icon} {meta.label}</span>
        <img
          src={p.imageUrl || PLACEHOLDER_IMG}
          alt={p.name}
          loading="lazy"
          onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }}
        />
      </div>
      <div className="pcard-body">
        {p.brand && <div className="pcard-brand">{p.brand}</div>}
        <h3 className="pcard-name">{p.name}</h3>
        <div className="pcard-foot">
          <span className={`score ${scoreClass(p.techScore)}`}>
            ⚡ {scoreLabel(p.techScore)}
          </span>
          <span className="pcard-go">İncele →</span>
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="pcard">
      <div className="skel" style={{ aspectRatio: '1 / 1', borderRadius: 0 }} />
      <div className="pcard-body">
        <div className="skel" style={{ height: 10, width: '40%' }} />
        <div className="skel" style={{ height: 15, width: '85%', marginTop: 8 }} />
        <div className="skel" style={{ height: 15, width: '60%', marginTop: 6 }} />
        <div className="skel" style={{ height: 22, width: '45%', marginTop: 12 }} />
      </div>
    </div>
  );
}
