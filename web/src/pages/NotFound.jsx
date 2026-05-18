import { Link } from 'react-router-dom';
import './Placeholder.css';

export default function NotFound() {
  return (
    <div className="container ph">
      <div className="ph-card fade-up">
        <div className="ph-emoji">🧭</div>
        <h1>Sayfa bulunamadı</h1>
        <p>Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.</p>
        <div className="ph-actions">
          <Link to="/" className="btn btn-primary">Ana Sayfaya Dön</Link>
        </div>
      </div>
    </div>
  );
}
