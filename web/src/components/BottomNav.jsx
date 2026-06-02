import { NavLink } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import './BottomNav.css';

// Mobile-only bottom tab bar — mirrors the Flutter app's floating nav pill
// (Home · Compare · Link Analysis · Subscriptions) so the mobile web feels like
// the app. Hidden on desktop, where the top header carries navigation.
const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
    </svg>
  ),
  compare: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M6 7 3 13h6L6 7Zm12 0-3 6h6l-3-6Z" /><path d="M3 13a3 3 0 0 0 6 0M15 13a3 3 0 0 0 6 0M8 20h8" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </svg>
  ),
  subs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" />
    </svg>
  ),
};

const ITEMS = [
  { to: '/', key: 'nav.home', end: true, icon: ICONS.home },
  { to: '/compare', key: 'nav.compare', icon: ICONS.compare },
  { to: '/link-analysis', key: 'nav.linkAnalysis', icon: ICONS.link },
  { to: '/subscriptions', key: 'nav.subscriptions', icon: ICONS.subs },
];

export default function BottomNav() {
  const t = useT();
  return (
    <nav className="botnav" aria-label="primary">
      {ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) => 'botnav-item' + (isActive ? ' active' : '')}
        >
          {it.icon}
          <span>{t(it.key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
