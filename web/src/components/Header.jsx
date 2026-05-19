import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { premiumStatus } from '../lib/premium';
import { useI18n } from '../i18n/index.jsx';
import './Header.css';

const NAV = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/compare', key: 'nav.compare' },
  { to: '/link-analysis', key: 'nav.linkAnalysis' },
  { to: '/subscriptions', key: 'nav.subscriptions' },
];

export default function Header() {
  const { user, openAuth, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t, lang, setLang, langs } = useI18n();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const coins = user ? Math.round(Number(user.bonusQCoins) || 0) : 0;
  const isPremium = premiumStatus(user).isPremium;
  const displayName = user ? user.name || user.email?.split('@')[0] || 'User' : '';
  const curLang = langs.find((l) => l.code === lang) || langs[0];

  return (
    <>
      <header className="hd">
        <div className="hd-inner container">
          <Link to="/" className="hd-logo" onClick={() => setDrawer(false)}>
            <img src="/assets/logo.png" alt="Qor AI" />
            <span>Qor AI</span>
          </Link>

          <nav className="hd-nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to}
                end={n.end}
                className={({ isActive }) => 'hd-link' + (isActive ? ' active' : '')}>
                {t(n.key)}
              </NavLink>
            ))}
          </nav>

          <div className="hd-actions">
            <div className="hd-apps">
              <a href="https://play.google.com/store/apps/details?id=com.compair.app"
                target="_blank" rel="noopener" className="hd-app" aria-label="Google Play"
                title={t('header.googlePlay')}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                  <path d="M3.6 1.8 13.8 12 3.6 22.2a1 1 0 0 1-.6-.92V2.73a1 1 0 0 1 .6-.93zm11 11 2.3 2.3-10.9 6.3 8.6-8.6zm3.7-3.7 2.4 1.37c.79.46.79 1.6 0 2.05l-2.37 1.37-2.5-2.52 2.47-2.27zM5.86 2.66 16.8 9 14.5 11.3 5.86 2.66z" />
                </svg>
              </a>
              <a href="#" className="hd-app hd-app-soon" aria-label="App Store"
                title={t('header.appStoreSoon')} onClick={(e) => e.preventDefault()}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
              </a>
            </div>

            <div className="hd-lang">
              <button className="hd-icon" onClick={() => setLangOpen((o) => !o)} aria-label="Language">
                <span className="hd-lang-flag">{curLang.flag}</span>
              </button>
              {langOpen && (
                <>
                  <div className="hd-menu-backdrop" onClick={() => setLangOpen(false)} />
                  <div className="hd-menu hd-lang-menu fade-up">
                    {langs.map((l) => (
                      <button key={l.code}
                        className={'hd-menu-item' + (l.code === lang ? ' active' : '')}
                        onClick={() => { setLang(l.code); setLangOpen(false); }}>
                        <span className="hd-lang-flag">{l.flag}</span> {l.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button className="hd-icon" onClick={toggle} aria-label={t('header.theme')}>
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>

            {user ? (
              <div className="hd-user">
                {isPremium && <span className="hd-pro" title={t('header.premium')}>PRO</span>}
                <span className="hd-coins" title={t('header.coins')}>
                  <span className="coin-dot">Q</span>{coins}
                </span>
                <button className="hd-avatar" onClick={() => setMenu((m) => !m)}>
                  {displayName[0]?.toUpperCase() || 'U'}
                </button>
                {menu && (
                  <>
                    <div className="hd-menu-backdrop" onClick={() => setMenu(false)} />
                    <div className="hd-menu fade-up">
                      <div className="hd-menu-head">
                        <strong>
                          {displayName}
                          {isPremium && <span className="hd-pro hd-pro-sm">PRO</span>}
                        </strong>
                        <span>{user.email}</span>
                      </div>
                      <div className="hd-menu-coins">
                        <span className="coin-dot">Q</span>
                        <b>{coins}</b> Qor Coin
                      </div>
                      <Link to="/profile" className="hd-menu-item" onClick={() => setMenu(false)}>
                        {t('nav.profile')}
                      </Link>
                      <Link to="/settings" className="hd-menu-item" onClick={() => setMenu(false)}>
                        {t('nav.settings')}
                      </Link>
                      <button className="hd-menu-item danger" onClick={() => { logout(); setMenu(false); }}>
                        {t('nav.signOut')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button className="btn btn-primary hd-signin" onClick={openAuth}>
                {t('nav.signIn')}
              </button>
            )}

            <button className="hd-icon hd-burger" onClick={() => setDrawer((d) => !d)} aria-label={t('header.menu')}>
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      {drawer && (
        <div className="hd-drawer-wrap" onClick={() => setDrawer(false)}>
          <nav className="hd-drawer fade-up" onClick={(e) => e.stopPropagation()}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="hd-drawer-link" onClick={() => setDrawer(false)}>
                {t(n.key)}
              </NavLink>
            ))}
            {!user && (
              <button className="btn btn-primary btn-block" style={{ marginTop: 8 }}
                onClick={() => { setDrawer(false); openAuth(); }}>
                {t('nav.signIn')}
              </button>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
