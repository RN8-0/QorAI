import { NavLink } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import { routeOpen } from '../lib/siteMode';
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
  // Analizler: cubuk grafik + taban cizgisi. Kart/dikdortgen govde YOK —
  // abonelik ikonu zaten bir kart ve 22 px'te ikisi birbirine karisiyordu.
  analyses: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16" /><path d="M7.5 20v-5.5M12 20V6M16.5 20v-8.5" />
    </svg>
  ),
  // Kategoriler: dort hucreli izgara. Analiz ikonuyla karismaz — o dikey
  // cubuklar, bu esit kareler.
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  ),
  // Blog: satirli sayfa. Abonelik karti yatay tek cizgili, bu uc kisa satirli.
  blog: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3.5h9.5L19 8v12.5H5z" /><path d="M14 3.5V8h5" /><path d="M8.5 12.5h7M8.5 16h4.5" />
    </svg>
  ),
};

// Alt bar DORT sekme tasiyacak sekilde tasarlandi (CSS esit bolusturuyor).
// Ziyaretciye donuk AI akislari kapaliyken Link Analizi ve Abonelik dusuyor;
// yerlerini sitenin trafik getiren iki icerik yuzeyi aliyor. Ikisi de her
// modda acik oldugu icin bar hicbir durumda dortten aza inmez, akislar geri
// acildiginda ise ilk sirayi yeniden aliyorlar.
const ITEMS = [
  { to: '/', key: 'nav.home', end: true, icon: ICONS.home },
  // KATEGORILER ALT BARDA YOK (2026-09-01, kullanici karari). Kategorilerin
  // tam listesi sag ustteki hamburger cekmecesinde duruyor. Ayrica `/category`
  // (kategorisiz) SPA'da gercek bir sayfa DEGIL: Category.jsx
  // `if (!cat) return <Navigate to="/" replace />` ile ana sayfaya atiyor.
  { to: '/analiz', key: 'nav.analyses', icon: ICONS.analyses },
  { to: '/blog', key: 'nav.blog', icon: ICONS.blog },
  { to: '/link-analysis', key: 'nav.linkAnalysis', icon: ICONS.link },
  { to: '/subscriptions', key: 'nav.subscriptions', icon: ICONS.subs },
].filter((it) => it.drawer || routeOpen(it.to)).slice(0, 4);

export default function BottomNav() {
  const t = useT();
  return (
    <nav className="botnav" aria-label="primary">
      {ITEMS.map((it) => (it.drawer ? (
        <button
          key="drawer"
          type="button"
          className="botnav-item"
          onClick={() => window.dispatchEvent(new CustomEvent('qor:open-drawer'))}
        >
          {it.icon}
          <span>{t(it.key)}</span>
        </button>
      ) : (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) => 'botnav-item' + (isActive ? ' active' : '')}
        >
          {it.icon}
          <span>{t(it.key)}</span>
        </NavLink>
      )))}
    </nav>
  );
}
