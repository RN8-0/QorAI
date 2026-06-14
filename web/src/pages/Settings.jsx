import { Link } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import { useSeo } from '../lib/seo';
import './Settings.css';

export default function Settings() {
  const { theme, set: setTheme } = useTheme();
  const { t, lang } = useI18n();
  const { user, openAuth, logout } = useAuth();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('settings.title')} — Qor AI`, noindex: true });

  return (
    <div className="container st">
      <h1 className="st-title">{t('settings.title')}</h1>

      {/* Appearance */}
      <section className="st-card fade-up">
        <h2>{t('settings.appearance')}</h2>
        <div className="st-theme">
          <button className={'st-theme-opt' + (theme === 'light' ? ' on' : '')}
            onClick={() => setTheme('light')}>
            ☀️ {t('settings.themeLight')}
          </button>
          <button className={'st-theme-opt' + (theme === 'dark' ? ' on' : '')}
            onClick={() => setTheme('dark')}>
            🌙 {t('settings.themeDark')}
          </button>
        </div>
      </section>

      {/* Account */}
      <section className="st-card fade-up">
        <h2>{t('settings.account')}</h2>
        {user ? (
          <div className="st-account">
            <div className="st-account-id">
              <div className="st-avatar">
                {(user.name || user.email || 'U')[0].toUpperCase()}
              </div>
              <div>
                <strong>{user.name || user.email?.split('@')[0]}</strong>
                <span>{user.email}</span>
              </div>
            </div>
            <div className="st-account-actions">
              <Link to="/profile" className="btn btn-ghost">{t('nav.profile')}</Link>
              <button className="btn btn-ghost" onClick={logout}>{t('nav.signOut')}</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={openAuth}>{t('nav.signIn')}</button>
        )}
      </section>

      {/* Links */}
      <section className="st-card fade-up">
        <h2>{t('settings.links')}</h2>
        <div className="st-links">
          <Link to="/privacy">🔒 {t('footer.privacy')}</Link>
          <Link to="/terms">📄 {t('footer.terms')}</Link>
          <Link to="/refund">↩ {L('Refund Policy', 'İade Politikası', 'Rückerstattung')}</Link>
          <Link to="/faq">❓ {t('settings.faq')}</Link>
          <a href="https://play.google.com/store/apps/details?id=com.compair.app"
            target="_blank" rel="noopener">▶️ {t('header.googlePlay')}</a>
        </div>
      </section>

      <p className="st-version">Qor AI · qorai.net</p>
    </div>
  );
}
