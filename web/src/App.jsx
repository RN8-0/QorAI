import { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import BottomNav from './components/BottomNav.jsx';
import CompareBar from './components/CompareBar.jsx';
import AuthModal from './components/AuthModal.jsx';
import AiBubble from './components/AiBubble.jsx';
import { trackPageView } from './lib/analytics.js';
import { useAuth } from './lib/auth.jsx';

import Home from './pages/Home.jsx';
import Category from './pages/Category.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Compare from './pages/Compare.jsx';
import LinkAnalysis from './pages/LinkAnalysis.jsx';
import AiChat from './pages/AiChat.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import Premium from './pages/Premium.jsx';
import Quiz from './pages/Quiz.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import Go from './pages/Go.jsx';
import NotFound from './pages/NotFound.jsx';

const PRE_QUIZ_BROWSE_PATHS = new Set([
  '/',
  '/category',
  '/compare',
  '/link-analysis',
  '/subscriptions',
  '/premium',
]);

function canBrowseBeforeQuiz(pathname) {
  return PRE_QUIZ_BROWSE_PATHS.has(pathname) || pathname === '/product' || pathname.startsWith('/product/');
}

export default function App() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();

  // Scroll to top + report page view on every route change.
  useEffect(() => {
    window.scrollTo(0, 0);
    trackPageView(`${loc.pathname}${loc.search}`);
  }, [loc.pathname, loc.search]);

  // Same onboarding rule as the mobile app: after login/registration, a user
  // with no completed profile quiz is sent to the quiz before AI features.
  useEffect(() => {
    if (!user || user.quizCompleted === true || loc.pathname === '/quiz') return;
    if (canBrowseBeforeQuiz(loc.pathname)) return;
    const next = `${loc.pathname}${loc.search}${loc.hash}`;
    nav(`/quiz?required=1&next=${encodeURIComponent(next)}`, { replace: true });
  }, [loc.hash, loc.pathname, loc.search, nav, user]);

  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category" element={<Category />} />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <BottomNav />
      <CompareBar />
      <AuthModal />
      <AiBubble />
    </>
  );
}
