import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';

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
            <a className="gp-badge" style={{ marginTop: 18 }}
              href="https://play.google.com/store/apps/details?id=com.compair.app"
              target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M3.6 1.8 13.8 12 3.6 22.2a1 1 0 0 1-.6-.92V2.73a1 1 0 0 1 .6-.93zm11 11 2.3 2.3-10.9 6.3 8.6-8.6zm3.7-3.7 2.4 1.37c.79.46.79 1.6 0 2.05l-2.37 1.37-2.5-2.52 2.47-2.27zM5.86 2.66 16.8 9 14.5 11.3 5.86 2.66z" />
              </svg>
              <span><small>{L('GET IT ON', 'İNDİR', 'LADE BEI')}</small><span style={{ fontSize: 13, display: 'block' }}>{t('header.googlePlay')}</span></span>
            </a>
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
          <span className="row" style={{ gap: 16 }}>
            <span>106,000+ {L('products', 'ürün', 'Produkte')}</span>
            <span>· TR / EN / DE</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
