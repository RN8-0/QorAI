import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import './Footer.css';

export default function Footer() {
  const t = useT();
  return (
    <footer className="ft">
      <div className="container ft-inner">
        <div className="ft-grid">
          <div className="ft-brand">
            <div className="ft-brand-row">
              <img src="/assets/logo.png" alt="Qor AI" />
              <b>Qor AI</b>
            </div>
            <p>{t('footer.tagline')}</p>
          </div>
          <div className="ft-col">
            <h5>{t('footer.product')}</h5>
            <Link to="/catalog">{t('nav.catalog')}</Link>
            <Link to="/compare">{t('nav.compare')}</Link>
            <Link to="/ai-chat">{t('nav.aiChat')}</Link>
            <Link to="/pc-builder">{t('nav.pcBuilder')}</Link>
            <Link to="/subscriptions">{t('nav.subscriptions')}</Link>
          </div>
          <div className="ft-col">
            <h5>{t('footer.corporate')}</h5>
            <Link to="/link-analysis">{t('nav.linkAnalysis')}</Link>
            <a href="mailto:contact@arain.digital">{t('footer.contact')}</a>
          </div>
          <div className="ft-col">
            <h5>{t('footer.legal')}</h5>
            <a href="/privacy.html">{t('footer.privacy')}</a>
            <a href="/terms.html">{t('footer.terms')}</a>
          </div>
        </div>
        <div className="ft-bottom">
          <span>{t('footer.rights', { year: new Date().getFullYear() })}</span>
          <span>{t('footer.made')}</span>
        </div>
      </div>
    </footer>
  );
}
