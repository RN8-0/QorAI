import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import PlayBadge from './PlayBadge.jsx';

// Sosyal hesaplar. `rel="me"` bilerek: arama motorlari ve dogrulama araclari
// bu baglantiyi "ayni varligin baska profili" olarak okur; JSON-LD'deki
// Organization.sameAs ile birlikte marka kimligini pekistirir.
// KULLANICI ADLARI SU AN TUTARSIZ (tiktok: qorai.net, youtube/instagram:
// qoraiweb) — tek isimde birlesince buradaki URL'leri guncelle.
const SOSYAL = [
  {
    ad: 'TikTok',
    href: 'https://www.tiktok.com/@qorai.net',
    yol: 'M16.5 3a5.6 5.6 0 0 0 4.5 4.4v3a8.6 8.6 0 0 1-4.5-1.3v6.2a6.3 6.3 0 1 1-5.4-6.2v3.1a3.2 3.2 0 1 0 2.3 3V3h3.1z',
  },
  {
    ad: 'YouTube',
    href: 'https://www.youtube.com/@qoraiweb',
    yol: 'M22 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.5A2.5 2.5 0 0 0 2.4 7.3C2 8.8 2 12 2 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.5a2.5 2.5 0 0 0 1.8-1.8C22 15.2 22 12 22 12zM10 15V9l5.2 3L10 15z',
  },
  {
    ad: 'Instagram',
    href: 'https://www.instagram.com/qoraiweb/',
    yol: 'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0 3.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 10.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6zm6.9-11.1a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
  },
];

function SocialLinks({ L }) {
  return (
    <div className="ft-social" aria-label={L('Social media', 'Sosyal medya', 'Soziale Medien')}>
      {SOSYAL.map((s) => (
        <a key={s.ad} href={s.href} target="_blank" rel="me noopener noreferrer"
          className="ft-social-btn" title={s.ad} aria-label={`Qor AI ${s.ad}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={s.yol} />
          </svg>
        </a>
      ))}
    </div>
  );
}

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
            <SocialLinks L={L} />
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
