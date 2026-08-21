import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import PlayBadge from './PlayBadge.jsx';

// Sosyal hesaplar. `rel="me"` bilerek: arama motorlari ve dogrulama araclari
// bu baglantiyi "ayni varligin baska profili" olarak okur; JSON-LD'deki
// Organization.sameAs ile birlikte marka kimligini pekistirir.
// KULLANICI ADLARI SU AN TUTARSIZ (tiktok: qorai.net, youtube/instagram:
// qoraiweb) — tek isimde birlesince buradaki URL'leri guncelle.
// Ikon yollari resmi marka isaretleridir (Simple Icons cizimleri). Eskiden
// elle basitlestirilmis yollar vardi ve Instagram'inki hatali doluyordu:
// 390 px'te alinan karede lens/govde ic ice gecip DOLU BIR BLOB halinde
// ciziliyordu (kare: onc/urun-benzer.png). `fill-rule: evenodd` + dogru yol
// ikisini de duzeltiyor.
const SOSYAL = [
  {
    ad: 'TikTok',
    anahtar: 'tiktok',
    href: 'https://www.tiktok.com/@qorai.net',
    yol: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  },
  {
    ad: 'YouTube',
    anahtar: 'youtube',
    href: 'https://www.youtube.com/@qoraiweb',
    yol: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  {
    ad: 'Instagram',
    anahtar: 'instagram',
    href: 'https://www.instagram.com/qoraiweb/',
    yol: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z',
  },
];

function SocialLinks({ L }) {
  return (
    <div className="ft-social" aria-label={L('Social media', 'Sosyal medya')}>
      {SOSYAL.map((s) => (
        <a key={s.ad} href={s.href} target="_blank" rel="me noopener noreferrer"
          className={`ft-social-btn ft-social-${s.anahtar}`} title={s.ad} aria-label={`Qor AI ${s.ad}`}>
          {/* fill-rule VERILMEZ (varsayilan `nonzero`): yollar oyle
              cizilmis — Instagram halkasinin ici ve YouTube'un oynat ucgeni
              ters yonde sarildigi icin kendiliginden oyuluyor. `evenodd`
              denendi ve ikisini de dolu blob'a cevirdi. */}
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
  const L = (en, tr) => (lang === 'tr' ? tr : en);
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
                <PlayBadge size="sm" getItOn={L('GET IT ON', 'İNDİR')} label={t('header.googlePlay')} />
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
              <h5>{L('Company', 'Şirket')}</h5>
              <Link to="/about">{L('About us', 'Hakkımızda')}</Link>
              <Link to="/faq">{L('FAQ', 'SSS')}</Link>
              <Link to="/contact">{L('Contact us', 'Bize ulaşın')}</Link>
            </div>
            <div>
              <h5>{t('footer.legal')}</h5>
              <Link to="/privacy">{t('footer.privacy')}</Link>
              <Link to="/terms">{t('footer.terms')}</Link>
              <Link to="/refund">{L('Refund Policy', 'İade Politikası')}</Link>
              <Link to="/cookies">{L('Cookies', 'Çerezler')}</Link>
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
