import { Link } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import { useSeo } from '../lib/seo';
import { useGeoCountry, setGeoCountry } from '../lib/geo';
import { CURRENCY_BY_COUNTRY, countryDisplayName } from '../lib/format';
import { updateProfile } from '../lib/pocketbase';
import { premiumStatus } from '../lib/premium';
import './Settings.css';

// Markets the site supports (drives prices/currency + Amazon storefront).
const COUNTRIES = Object.keys(CURRENCY_BY_COUNTRY);
function flagEmoji(cc) {
  const c = String(cc || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🌍';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export default function Settings() {
  const { theme, set: setTheme } = useTheme();
  const { t, lang, setLang, langs } = useI18n();
  const { user, openAuth, logout } = useAuth();
  const geoCountry = useGeoCountry();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('settings.title')} — Qor AI`, noindex: true });

  const prem = user ? premiumStatus(user) : { isPremium: false };
  const premUntil = prem.expiresAt ? new Date(prem.expiresAt).toLocaleDateString() : '';
  const currentCC = (user?.country || geoCountry || '').toUpperCase();
  const currency = CURRENCY_BY_COUNTRY[currentCC] || 'USD';

  async function changeCountry(cc) {
    if (!cc) return;
    setGeoCountry(cc);                       // updates the displayed currency live
    if (user) { try { await updateProfile({ country: cc }); } catch { /* best-effort */ } }
  }

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

      {/* Region & Language */}
      <section className="st-card fade-up">
        <h2>{L('Region & Language', 'Bölge ve Dil', 'Region & Sprache')}</h2>

        <div className="st-field">
          <label className="st-label">{t('settings.language')}</label>
          <div className="st-seg">
            {langs.map((l) => (
              <button key={l.code}
                className={'st-seg-opt' + (lang === l.code ? ' on' : '')}
                onClick={() => setLang(l.code)}>
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="st-field">
          <label className="st-label">
            {L('Country / Market', 'Ülke / Pazar', 'Land / Markt')}
            <span className="st-hint"> · {L('prices shown in', 'fiyatlar şu birimde', 'Preise in')} {currency}</span>
          </label>
          <div className="st-select-wrap">
            <span className="st-select-flag">{flagEmoji(currentCC)}</span>
            <select className="st-select" value={currentCC || ''} onChange={(e) => changeCountry(e.target.value)}>
              {!currentCC && <option value="">{L('Select…', 'Seç…', 'Wählen…')}</option>}
              {COUNTRIES.map((cc) => (
                <option key={cc} value={cc}>{flagEmoji(cc)} {countryDisplayName(cc, lang)} ({CURRENCY_BY_COUNTRY[cc]})</option>
              ))}
            </select>
          </div>
          <p className="st-note">{L(
            'Sets the currency and store used for prices and Amazon links.',
            'Fiyatlarda ve Amazon bağlantılarında kullanılan para birimini ve mağazayı belirler.',
            'Legt Währung und Shop für Preise und Amazon-Links fest.',
          )}</p>
        </div>
      </section>

      {/* Membership */}
      <section className="st-card fade-up">
        <h2>{L('Membership', 'Üyelik', 'Mitgliedschaft')}</h2>
        <div className={'st-prem' + (prem.isPremium ? ' is-premium' : '')}>
          <div className="st-prem-badge">{prem.isPremium ? '✦' : 'Q'}</div>
          <div className="st-prem-text">
            <strong>{prem.isPremium ? L('Premium', 'Premium üye', 'Premium') : L('Free plan', 'Ücretsiz üyelik', 'Kostenlos')}</strong>
            <span>
              {prem.isPremium
                ? (premUntil ? L(`Active until ${premUntil}`, `${premUntil} tarihine kadar aktif`, `Aktiv bis ${premUntil}`) : L('Active', 'Aktif', 'Aktiv'))
                : L('Unlock unlimited AI features.', 'Sınırsız AI özelliklerinin kilidini aç.', 'Schalte unbegrenzte KI-Funktionen frei.')}
            </span>
          </div>
          {!prem.isPremium && <Link to="/premium" className="btn btn-primary st-prem-cta">{L('Go Premium', 'Premium’a geç', 'Premium holen')}</Link>}
        </div>
        <div className="st-links" style={{ marginTop: 14 }}>
          <Link to="/quiz">🎯 {L('Edit preferences (quiz)', 'Tercihleri düzenle (quiz)', 'Präferenzen bearbeiten (Quiz)')}</Link>
          <Link to="/subscriptions">📺 {L('Subscriptions', 'Abonelikler', 'Abos')}</Link>
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
          <Link to="/contact">✉️ {L('Contact', 'İletişim', 'Kontakt')}</Link>
          <Link to="/faq">❓ {t('settings.faq')}</Link>
          <a href="https://play.google.com/store/apps/details?id=com.compair.app"
            target="_blank" rel="noopener">▶️ {t('header.googlePlay')}</a>
        </div>
      </section>

      <p className="st-version">Qor AI · qorai.net</p>
    </div>
  );
}
