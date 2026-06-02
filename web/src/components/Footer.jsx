import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import PlayBadge from './PlayBadge.jsx';

const EMAIL = 'contact@arain.digital';

export default function Footer() {
  const { t, lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="between wrap" style={{ alignItems: 'flex-start', gap: 40 }}>
          {/* Brand */}
          <div style={{ maxWidth: 340 }}>
            <Link to="/" className="brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <img src="/assets/qor_logo.png" alt="Qor AI" style={{ width: 34, height: 34 }} />
              <span className="wm" style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.04em' }}>
                Qor<b className="grad-text"> AI</b>
              </span>
            </Link>
            <p className="muted" style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6 }}>{t('footer.tagline')}</p>
            <div style={{ marginTop: 18 }}>
              <PlayBadge getItOn={L('GET IT ON', 'İNDİR', 'LADE BEI')} label={t('header.googlePlay')} />
            </div>
          </div>

          {/* Link columns */}
          <div className="ft-cols">
            <div>
              <h5>{t('footer.product')}</h5>
              <Link to="/">{t('nav.home')}</Link>
              <Link to="/compare">{t('nav.compare')}</Link>
              <Link to="/link-analysis">{t('nav.linkAnalysis')}</Link>
              <Link to="/ai-chat">{t('nav.aiChat')}</Link>
              <Link to="/subscriptions">{t('nav.subscriptions')}</Link>
            </div>
            <div>
              <h5>{L('Company', 'Şirket', 'Unternehmen')}</h5>
              <a href="/about.html">{L('About us', 'Hakkımızda', 'Über uns')}</a>
              <a href="/about.html#how">{L('How it works', 'Nasıl çalışır', 'Wie es funktioniert')}</a>
              <a href="/faq.html">{L('FAQ', 'SSS', 'FAQ')}</a>
            </div>
            <div>
              <h5>{L('Get in touch', 'İletişim', 'Kontakt')}</h5>
              <a href="/contact.html">{L('Contact us', 'Bize ulaşın', 'Kontaktieren')}</a>
              <a href={`mailto:${EMAIL}?subject=Product%20suggestion`}>{L('Suggest a product', 'Ürün öner', 'Produkt vorschlagen')}</a>
              <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            </div>
            <div>
              <h5>{t('footer.legal')}</h5>
              <a href="/privacy.html">{t('footer.privacy')}</a>
              <a href="/terms.html">{t('footer.terms')}</a>
              <a href="/cookies.html">{L('Cookies', 'Çerezler', 'Cookies')}</a>
            </div>
          </div>
        </div>

        <div className="hr" />

        <div className="between wrap" style={{ fontSize: 13, color: 'var(--text-3)' }}>
          <span>{t('footer.rights', { year })}</span>
          <span>TR / EN / DE</span>
        </div>
      </div>
    </footer>
  );
}
