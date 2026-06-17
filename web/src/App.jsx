import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import BottomNav from './components/BottomNav.jsx';
import SiteBackground from './components/SiteBackground.jsx';
import CompareBar from './components/CompareBar.jsx';
import AuthModal from './components/AuthModal.jsx';
import AiBubble from './components/AiBubble.jsx';
import { trackPageView } from './lib/analytics.js';
import { useAuth } from './lib/auth.jsx';
import { hasCompletedQuiz } from './lib/qorCoins.js';

// Home stays eager so the landing page paints on the first request (no extra
// chunk round-trip on the most-visited route). Every other page is loaded on
// demand: this is what keeps the initial JS small instead of shipping all
// pages — ProductDetail, Compare, Quiz, Legal, etc. — in one ~900 KB bundle
// that every visitor (especially mobile) has to download, parse and execute
// before anything renders.
import Home from './pages/Home.jsx';

const Category = lazy(() => import('./pages/Category.jsx'));
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx'));
const Compare = lazy(() => import('./pages/Compare.jsx'));
const LinkAnalysis = lazy(() => import('./pages/LinkAnalysis.jsx'));
const AiChat = lazy(() => import('./pages/AiChat.jsx'));
const Subscriptions = lazy(() => import('./pages/Subscriptions.jsx'));
const Premium = lazy(() => import('./pages/Premium.jsx'));
const Quiz = lazy(() => import('./pages/Quiz.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Go = lazy(() => import('./pages/Go.jsx'));
const LegalPage = lazy(() => import('./pages/Legal.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();

  // Scroll to top + report page view on every route change.
  useEffect(() => {
    window.scrollTo(0, 0);
    trackPageView(`${loc.pathname}${loc.search}`);
  }, [loc.pathname, loc.search]);

  // Same onboarding rule as the mobile app: real signed-in users must complete
  // the profile quiz before using the site as an authenticated AI surface.
  useEffect(() => {
    if (!user || hasCompletedQuiz(user) || loc.pathname === '/quiz') return;
    if (String(user.email || '').toLowerCase().endsWith('@qorai.local')) return;
    const next = `${loc.pathname}${loc.search}${loc.hash}`;
    nav(`/quiz?required=1&next=${encodeURIComponent(next)}`, { replace: true });
  }, [loc.hash, loc.pathname, loc.search, nav, user]);

  return (
    <>
      <SiteBackground />
      <Header />
      <main>
        <Suspense fallback={<div className="route-fallback"><div className="spinner" /></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category" element={<Category />} />
          <Route path="/category/:cat" element={<Category />} />
          <Route path="/product" element={<ProductDetail />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/ai-chat" element={<AiChat />} />
          <Route path="/link-analysis" element={<LinkAnalysis />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/premium" element={<Premium />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/go" element={<Go />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/refund" element={<LegalPage kind="refund" />} />
          <Route path="/cookies" element={<LegalPage kind="cookies" />} />
          <Route path="/contact" element={<LegalPage kind="contact" />} />
          <Route path="/about" element={<LegalPage kind="about" />} />
          <Route path="/faq" element={<LegalPage kind="faq" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </main>
      <Footer />
      <BottomNav />
      <CompareBar />
      <AuthModal />
      <AiBubble />
    </>
  );
}
