import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import './Placeholder.css';

export default function Placeholder({ title, emoji }) {
  const t = useT();
  return (
    <div className="container ph">
      <div className="ph-card fade-up">
        <div className="ph-emoji">{emoji}</div>
        <h1>{title}</h1>
        <p>{t('ph.soon')}</p>
        <div className="ph-actions">
          <Link to="/catalog" className="btn btn-primary">{t('ph.browseCatalog')}</Link>
          <Link to="/" className="btn btn-ghost">{t('ph.home')}</Link>
        </div>
      </div>
    </div>
  );
}
