import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import PlayBadge from './PlayBadge.jsx';

export default function Footer() {
  const { t, lang } = useI18n();
  const loc = useLocation();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const year = new Date().getFullYear();
  const isPremiumRoute = loc.pathname === '/premium';

  return (
    <footer className="footer">
      <div className="container">
        <div className="between wrap" style={{ alignItems: 'flex-start', gap: 40 }}>
          {/* Brand */}
          <div style={{ maxWidth: 340 }}>
            <Link to="/" className="brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <img src="/assets/qor_logo_144.png?v=20260814a" alt="Qor AI" style={{ width: 34, height: 34 }} />
              <span className="wm" style={{ fontWeight: 800, fontSize: 20, letterSpacing: '0' }}>
                Qor<b className="grad-text"> AI</b>
              </span>
            </Link>
            <p className="muted" style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6 }}>{t('footer.tagline')}</p>
            {!isPremiumRoute && (
              <div style={{ marginTop: 16 }}>
                <PlayBadge size="sm" getItOn={L('GET IT ON', 'İNDİR', 'LADE BEI')} label={t('header.googlePlay')} />
              </div>
            )}
          </div>

          {/* Link columns */}
          <div className="ft-cols">
            <div>
              <h5>{t('footer.product')}</h5>
              <Link to="/">{t('nav.home')}</Link>
              <Link to="/link-analysis">{t('nav.linkAnalysis')}</Link>
              <Link to="/subscriptions">{t('nav.subscriptions')}</Link>
            </div>
            <div>
              <h5>{L('Company', 'Şirket', 'Unternehmen')}</h5>
              <Link to="/about">{L('About us', 'Hakkımızda', 'Über uns')}</Link>
              <Link to="/faq">{L('FAQ', 'SSS', 'FAQ')}</Link>
              <Link to="/contact">{L('Contact us', 'Bize ulaşın', 'Kontaktieren')}</Link>
            </div>
            <div>
              <h5>{t('footer.legal')}</h5>
              <Link to="/privacy">{t('footer.privacy')}</Link>
              <Link to="/terms">{t('footer.terms')}</Link>
              <Link to="/refund">{L('Refund Policy', 'İade Politikası', 'Rückerstattung')}</Link>
              <Link to="/cookies">{L('Cookies', 'Çerezler', 'Cookies')}</Link>
            </div>
          </div>
        </div>

        <div className="hr" />

        <div className="between wrap" style={{ fontSize: 13, color: 'var(--text-3)' }}>
          <span>{t('footer.rights', { year })}</span>
        </div>
      </div>
    </footer>
  );
}
