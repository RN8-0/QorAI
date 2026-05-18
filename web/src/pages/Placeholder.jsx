import { Link } from 'react-router-dom';
import './Placeholder.css';

export default function Placeholder({ title, emoji }) {
  return (
    <div className="container ph">
      <div className="ph-card fade-up">
        <div className="ph-emoji">{emoji}</div>
        <h1>{title}</h1>
        <p>Bu özellik web sürümüne taşınıyor. Çok yakında burada olacak.</p>
        <div className="ph-actions">
          <Link to="/catalog" className="btn btn-primary">Kataloğa Göz At</Link>
          <Link to="/" className="btn btn-ghost">Ana Sayfa</Link>
        </div>
      </div>
    </div>
  );
}
