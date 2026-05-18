import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import './Header.css';

const NAV = [
  { to: '/catalog', label: 'Katalog' },
  { to: '/compare', label: 'Karşılaştır' },
  { to: '/ai-chat', label: 'AI Sohbet' },
  { to: '/pc-builder', label: 'PC Toplama' },
  { to: '/subscriptions', label: 'Abonelikler' },
];

export default function Header() {
  const { user, openAuth, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);

  const coins = user ? Math.round(Number(user.bonusQCoins) || 0) : 0;
  const displayName = user ? user.name || user.email?.split('@')[0] || 'Kullanıcı' : '';

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
                className={({ isActive }) => 'hd-link' + (isActive ? ' active' : '')}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hd-actions">
            <button className="hd-icon" onClick={toggle} aria-label="Tema değiştir">
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>

            {user ? (
              <div className="hd-user">
                <span className="hd-coins" title="Qor Coin bakiyen">
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
                        <strong>{displayName}</strong>
                        <span>{user.email}</span>
                      </div>
                      <div className="hd-menu-coins">
                        <span className="coin-dot">Q</span>
                        <b>{coins}</b> Qor Coin
                      </div>
                      <Link to="/profile" className="hd-menu-item" onClick={() => setMenu(false)}>
                        Profilim
                      </Link>
                      <button className="hd-menu-item danger" onClick={() => { logout(); setMenu(false); }}>
                        Çıkış Yap
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button className="btn btn-primary hd-signin" onClick={openAuth}>
                Giriş Yap
              </button>
            )}

            <button className="hd-icon hd-burger" onClick={() => setDrawer((d) => !d)} aria-label="Menü">
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      {drawer && (
        <div className="hd-drawer-wrap" onClick={() => setDrawer(false)}>
          <nav className="hd-drawer fade-up" onClick={(e) => e.stopPropagation()}>
            <NavLink to="/" end className="hd-drawer-link" onClick={() => setDrawer(false)}>
              Ana Sayfa
            </NavLink>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="hd-drawer-link" onClick={() => setDrawer(false)}>
                {n.label}
              </NavLink>
            ))}
            <NavLink to="/link-analysis" className="hd-drawer-link" onClick={() => setDrawer(false)}>
              Link Analizi
            </NavLink>
            {!user && (
              <button className="btn btn-primary btn-block" style={{ marginTop: 8 }}
                onClick={() => { setDrawer(false); openAuth(); }}>
                Giriş Yap
              </button>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
