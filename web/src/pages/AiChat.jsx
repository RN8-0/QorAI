import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import './Placeholder.css';

// The AI chat lives in the floating bubble — this route just opens it.
export default function AiChat() {
  const t = useT();
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('qor-open-ai'));
  }, []);

  return (
    <div className="container ph">
      <div className="ph-card fade-up">
        <div className="ph-emoji">💬</div>
        <h1>{t('aichat.title')}</h1>
        <p>{t('aichat.desc')}</p>
        <div className="ph-actions">
          <button className="btn btn-primary"
            onClick={() => window.dispatchEvent(new CustomEvent('qor-open-ai'))}>
            {t('aichat.open')}
          </button>
          <Link to="/" className="btn btn-ghost">{t('ph.browseCatalog')}</Link>
        </div>
      </div>
    </div>
  );
}
