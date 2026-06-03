import { useState, useRef } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { premiumStatus } from '../lib/premium';
import { useI18n } from '../i18n/index.jsx';
import { CANONICAL_CATEGORY_GROUPS, categoryLabel, catMeta } from '../lib/format';
import PlayBadge from './PlayBadge.jsx';
import './Header.css';

// Order: Home, then the Categories mega-menu trigger, then the tools.
const NAV_REST = [
  { to: '/compare', key: 'nav.compare' },
  { to: '/link-analysis', key: 'nav.linkAnalysis' },
  { to: '/subscriptions', key: 'nav.subscriptions' },
];
const NAV = [{ to: '/', key: 'nav.home', end: true }, ...NAV_REST];

const SEG_LANGS = ['tr', 'en', 'de'];

const ALL_CATEGORIES = CANONICAL_CATEGORY_GROUPS.flatMap((group) =>
  group.cats.map((id) => ({ id, group })),
);

export default function Header() {
  const { user, openAuth, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t, lang, setLang } = useI18n();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [catMenu, setCatMenu] = useState(false);
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);

  // Mega-menu open/close with a small grace delay so moving the cursor from the
  // "Categories" trigger down into the panel doesn't close it.
  const catTimer = useRef(null);
  const openCat = () => { if (catTimer.current) clearTimeout(catTimer.current); setCatMenu(true); };
  const closeCatSoon = () => { if (catTimer.current) clearTimeout(catTimer.current); catTimer.current = setTimeout(() => setCatMenu(false), 140); };
  const closeCatNow = () => { if (catTimer.current) clearTimeout(catTimer.current); setCatMenu(false); };

  const coins = user ? Math.round(Number(user.bonusQCoins) || 0) : 0;
  const isPremium = premiumStatus(user).isPremium;
  const displayName = user ? user.name || user.email?.split('@')[0] || 'User' : '';

  return (
    <>
      <header className="appbar">
        <div className="container appbar-inner">
          <Link to="/" className="brand" onClick={() => setDrawer(false)}>
            <img src="/assets/qor_logo.png" alt="Qor AI" />
            <span className="wm">Qor<b className="grad-text"> AI</b></span>
          </Link>

          <nav className="nav" onMouseLeave={closeCatSoon}>
            <NavLink to="/" end onMouseEnter={closeCatNow}
              className={({ isActive }) => (isActive ? 'active' : '')}>
              {t('nav.home')}
            </NavLink>
            <button
              type="button"
              className={'nav-cat' + (catMenu ? ' active' : '')}
              onClick={() => (catMenu ? closeCatNow() : openCat())}
              onMouseEnter={openCat}
            >
              {L('Categories', 'Kategoriler', 'Kategorien')}
              <svg className="hd-caret" width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.6">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {NAV_REST.map((n) => (
              <NavLink key={n.to} to={n.to}
                onMouseEnter={closeCatNow}
                className={({ isActive }) => (isActive ? 'active' : '')}>
                {t(n.key)}
              </NavLink>
            ))}
          </nav>

          {catMenu && (
            <>
              <div className="hd-mega-backdrop" onClick={closeCatNow} />
              <div className="hd-mega" onMouseEnter={openCat} onMouseLeave={closeCatSoon}>
                <div className="container hd-mega-inner">
                  <div className="hd-mega-head">
                    <div>
                      <strong>{L('All categories', 'Tüm kategoriler', 'Alle Kategorien')}</strong>
                      <span>{L('Browse every approved Qor AI category.', 'Qor AI’daki tüm onaylı kategorilere göz at.', 'Alle freigegebenen Qor AI Kategorien durchsuchen.')}</span>
                    </div>
                    <em>{ALL_CATEGORIES.length}</em>
                  </div>
                  <div className="hd-mega-grid">
                    {ALL_CATEGORIES.map(({ id, group }) => {
                      const meta = catMeta(id);
                      return (
                        <Link key={id} to={`/category?cat=${encodeURIComponent(id)}`}
                          className="hd-mega-tile" onClick={closeCatNow}>
                          <span className="hd-mega-ic" style={{ background: meta.color }}>{meta.icon}</span>
                          <span className="hd-mega-name">{categoryLabel(id, lang)}</span>
                          <small>{group.title[lang] || group.title.en}</small>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="grow" />

          <div className="seg" role="group" aria-label="language">
            {SEG_LANGS.map((code) => (
              <button key={code} className={lang === code ? 'on' : ''} onClick={() => setLang(code)}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>

          <button className="iconbtn" onClick={toggle} aria-label={t('header.theme')}>
            {theme === 'dark'
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>}
          </button>

          <PlayBadge size="sm" className="desk-only"
            getItOn={L('GET IT ON', 'İNDİR', 'LADE BEI')} label={t('header.googlePlay')} />

          {user ? (
            <div className="hd-user">
              {isPremium && <span className="hd-pro" title={t('header.premium')}>PRO</span>}
              <span className="hd-coins" title={t('header.coins')}><span className="coin-dot">Q</span>{coins}</span>
              <button className="hd-avatar" onClick={() => setMenu((m) => !m)}>{displayName[0]?.toUpperCase() || 'U'}</button>
              {menu && (
                <>
                  <div className="hd-menu-backdrop" onClick={() => setMenu(false)} />
                  <div className="hd-menu fade-up">
                    <div className="hd-menu-head">
                      <strong>{displayName}{isPremium && <span className="hd-pro hd-pro-sm">PRO</span>}</strong>
                      <span>{user.email}</span>
                    </div>
                    <div className="hd-menu-coins"><span className="coin-dot">Q</span><b>{coins}</b> Qor Coin</div>
                    <Link to="/profile" className="hd-menu-item" onClick={() => setMenu(false)}>{t('nav.profile')}</Link>
                    <Link to="/settings" className="hd-menu-item" onClick={() => setMenu(false)}>{t('nav.settings')}</Link>
                    <button className="hd-menu-item danger" onClick={() => { logout(); setMenu(false); }}>{t('nav.signOut')}</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button className="iconbtn hd-signin-av" onClick={openAuth} title={t('nav.signIn')} aria-label={t('nav.signIn')}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </button>
          )}

          <button className="iconbtn hd-burger" onClick={() => setDrawer((d) => !d)} aria-label={t('header.menu')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
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
            <div className="hd-drawer-cats">
              <span className="hd-drawer-h">{L('Categories', 'Kategoriler', 'Kategorien')}</span>
              {ALL_CATEGORIES.map(({ id }) => (
                <Link key={id} to={`/category?cat=${encodeURIComponent(id)}`}
                  className="hd-drawer-cat" onClick={() => setDrawer(false)}>
                  <span style={{ color: catMeta(id).color }}>{catMeta(id).icon}</span>
                  {categoryLabel(id, lang)}
                </Link>
              ))}
            </div>
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
