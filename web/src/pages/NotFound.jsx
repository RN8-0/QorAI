import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import './Placeholder.css';

export default function NotFound() {
  const t = useT();
  return (
    <div className="container ph">
      <div className="ph-card fade-up">
        <div className="ph-emoji">🧭</div>
        <h1>{t('nf.title')}</h1>
        <p>{t('nf.desc')}</p>
        <div className="ph-actions">
          <Link to="/" className="btn btn-primary">{t('nf.back')}</Link>
        </div>
      </div>
    </div>
  );
}
