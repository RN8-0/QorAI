import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import './Footer.css';

export default function Footer() {
  const t = useT();
  return (
    <footer className="ft">
      <div className="container ft-inner">
        <div className="ft-top">
          <div className="ft-brand">
            <div className="ft-brand-row">
              <img src="/assets/logo.png" alt="Qor AI" />
              <b>Qor AI</b>
            </div>
            <p>{t('footer.tagline')}</p>
            <a className="ft-store"
              href="https://play.google.com/store/apps/details?id=com.compair.app"
              target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M3.6 1.8 13.8 12 3.6 22.2a1 1 0 0 1-.6-.92V2.73a1 1 0 0 1 .6-.93zm11 11 2.3 2.3-10.9 6.3 8.6-8.6zm3.7-3.7 2.4 1.37c.79.46.79 1.6 0 2.05l-2.37 1.37-2.5-2.52 2.47-2.27zM5.86 2.66 16.8 9 14.5 11.3 5.86 2.66z" />
              </svg>
              {t('header.googlePlay')}
            </a>
          </div>

          <div className="ft-links">
            <div className="ft-col">
              <h5>{t('footer.product')}</h5>
              <Link to="/">{t('nav.home')}</Link>
              <Link to="/compare">{t('nav.compare')}</Link>
              <Link to="/ai-chat">{t('nav.aiChat')}</Link>
              <Link to="/subscriptions">{t('nav.subscriptions')}</Link>
            </div>
            <div className="ft-col">
              <h5>{t('footer.corporate')}</h5>
              <Link to="/link-analysis">{t('nav.linkAnalysis')}</Link>
              <Link to="/quiz">{t('home.tQuiz')}</Link>
              <a href="mailto:contact@arain.digital">{t('footer.contact')}</a>
            </div>
            <div className="ft-col">
              <h5>{t('footer.legal')}</h5>
              <a href="/privacy.html">{t('footer.privacy')}</a>
              <a href="/terms.html">{t('footer.terms')}</a>
            </div>
          </div>
        </div>

        <div className="ft-bottom">
          <span>{t('footer.rights', { year: new Date().getFullYear() })}</span>
          <span className="ft-made">{t('footer.made')}</span>
        </div>
      </div>
    </footer>
  );
}
