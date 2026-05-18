import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCompare } from '../lib/compare';
import { useT } from '../i18n/index.jsx';
import './Profile.css';

export default function Profile() {
  const t = useT();
  const { user, openAuth, logout } = useAuth();
  const { ids } = useCompare();

  if (!user) {
    return (
      <div className="container pf-guest">
        <div className="pf-guest-icon">👤</div>
        <h1>{t('pf.guestTitle')}</h1>
        <p>{t('pf.guestDesc')}</p>
        <button className="btn btn-primary btn-lg" onClick={openAuth}>{t('pf.signInBtn')}</button>
      </div>
    );
  }

  const name = user.name || user.email?.split('@')[0] || 'User';
  const coins = Math.round(Number(user.bonusQCoins) || 0);
  const joined = user.created
    ? new Date(user.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : '—';

  return (
    <div className="container pf">
      <div className="pf-card pf-id fade-up">
        <div className="pf-avatar">{name[0]?.toUpperCase() || 'U'}</div>
        <div className="pf-id-text">
          <h1>{name}</h1>
          <span>{user.email}</span>
          <small>{t('pf.member', { date: joined })}</small>
        </div>
        <button className="btn btn-ghost pf-signout" onClick={logout}>{t('pf.signOut')}</button>
      </div>

      <div className="pf-grid">
        <div className="pf-card pf-coins fade-up">
          <div className="pf-coin-badge"><span className="coin-dot">Q</span></div>
          <div>
            <div className="pf-coin-num">{coins}</div>
            <div className="pf-coin-lbl">{t('pf.coinBalance')}</div>
          </div>
          <p>{t('pf.coinDesc')}</p>
        </div>

        <div className="pf-card pf-stat fade-up">
          <div className="pf-stat-num">{ids.length}</div>
          <div className="pf-stat-lbl">{t('pf.compareCount')}</div>
          <Link to="/compare" className="btn btn-ghost">{t('pf.openList')}</Link>
        </div>
      </div>

      <div className="pf-card pf-links fade-up">
        <h3>{t('pf.quickAccess')}</h3>
        <div className="pf-link-row">
          <Link to="/">📦 {t('nav.home')}</Link>
          <Link to="/compare">⚖️ {t('nav.compare')}</Link>
          <a href="/privacy.html">🔒 {t('footer.privacy')}</a>
          <a href="/terms.html">📄 {t('footer.terms')}</a>
        </div>
      </div>
    </div>
  );
}
