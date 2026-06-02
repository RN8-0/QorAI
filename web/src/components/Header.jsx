import { useState, useRef } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { premiumStatus } from '../lib/premium';
import { useI18n } from '../i18n/index.jsx';
import { catMeta } from '../lib/format';
import './Header.css';

const NAV = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/compare', key: 'nav.compare' },
  { to: '/link-analysis', key: 'nav.linkAnalysis' },
  { to: '/subscriptions', key: 'nav.subscriptions' },
];

const SEG_LANGS = ['tr', 'en', 'de'];

// Grouped category mega-menu. Each entry resolves its label through catMeta();
// links go to the existing /category?cat=… route.
const CAT_GROUPS = [
  { title: { en: 'Mobile Devices', tr: 'Mobil Cihazlar', de: 'Mobilgeräte' },
    cats: ['smartphones', 'tablets', 'smartwatches', 'laptops', 'desktops'] },
  { title: { en: 'Computer Components', tr: 'Bilgisayar Parçaları', de: 'PC-Komponenten' },
    cats: ['gpus', 'cpus', 'motherboards', 'ram', 'ssd', 'psu', 'pc_cases', 'coolers'] },
  { title: { en: 'Audio', tr: 'Ses', de: 'Audio' },
    cats: ['headphones', 'earbuds', 'speakers', 'soundbars'] },
  { title: { en: 'Photo & Video', tr: 'Foto & Video', de: 'Foto & Video' },
    cats: ['cameras', 'action_cameras', 'security_cameras', 'monitors', 'tvs', 'gaming_consoles'] },
  { title: { en: 'Other', tr: 'Diğer', de: 'Sonstiges' },
    cats: ['printers', 'powerbanks', 'routers', 'keyboards', 'mice'] },
];

export default function Header() {
  const nav = useNavigate();
  const { user, openAuth, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t, lang, setLang } = useI18n();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [catMenu, setCatMenu] = useState(false);
  const [hq, setHq] = useState('');
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

  function submitSearch(e) {
    e.preventDefault();
    const term = hq.trim();
    nav(term ? `/?q=${encodeURIComponent(term)}` : '/');
  }

  return (
    <>
      <header className="appbar">
        <div className="container appbar-inner">
          <Link to="/" className="brand" onClick={() => setDrawer(false)}>
            <img src="/assets/qor_logo.png" alt="Qor AI" />
            <span className="wm">Qor<b className="grad-text"> AI</b></span>
          </Link>

          <nav className="nav" onMouseLeave={closeCatSoon}>
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
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
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
                  {CAT_GROUPS.map((g) => (
                    <div className="hd-mega-col" key={g.title.en}>
                      <h6>{g.title[lang] || g.title.en}</h6>
                      {g.cats.map((c) => (
                        <Link key={c} to={`/category?cat=${encodeURIComponent(c)}`}
                          className="hd-mega-link" onClick={closeCatNow}>
                          {catMeta(c).label}
                        </Link>
                      ))}
                    </div>
                  ))}
                  <div className="hd-mega-cta">
                    <Link to="/category" className="btn btn-primary" onClick={closeCatNow}>
                      {L('See all categories', 'Tüm kategoriler', 'Alle Kategorien')} →
                    </Link>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="grow" />

          <form className="searchbox hide-md" onSubmit={submitSearch}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={hq} onChange={(e) => setHq(e.target.value)} placeholder={t('home.searchPlaceholder')} />
          </form>

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

          <a className="gp-badge desk-only"
            href="https://play.google.com/store/apps/details?id=com.compair.app"
            target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M3.6 1.8 13.8 12 3.6 22.2a1 1 0 0 1-.6-.92V2.73a1 1 0 0 1 .6-.93zm11 11 2.3 2.3-10.9 6.3 8.6-8.6zm3.7-3.7 2.4 1.37c.79.46.79 1.6 0 2.05l-2.37 1.37-2.5-2.52 2.47-2.27zM5.86 2.66 16.8 9 14.5 11.3 5.86 2.66z" />
            </svg>
            <span><small>{L('GET IT ON', 'İNDİR', 'LADE BEI')}</small><span style={{ fontSize: 13, display: 'block' }}>{t('header.googlePlay')}</span></span>
          </a>

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
            <button className="btn btn-primary hd-signin" onClick={openAuth}>{t('nav.signIn')}</button>
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
              {CAT_GROUPS.flatMap((g) => g.cats).map((c) => (
                <Link key={c} to={`/category?cat=${encodeURIComponent(c)}`}
                  className="hd-drawer-cat" onClick={() => setDrawer(false)}>
                  {catMeta(c).label}
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
