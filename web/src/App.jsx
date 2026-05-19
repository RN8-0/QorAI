import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import AuthModal from './components/AuthModal.jsx';
import AiBubble from './components/AiBubble.jsx';
import { trackPageView } from './lib/analytics.js';

import Home from './pages/Home.jsx';
import Category from './pages/Category.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Compare from './pages/Compare.jsx';
import LinkAnalysis from './pages/LinkAnalysis.jsx';
import AiChat from './pages/AiChat.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import Quiz from './pages/Quiz.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  const loc = useLocation();

  // Scroll to top + report page view on every route change.
  useEffect(() => {
    window.scrollTo(0, 0);
    trackPageView(loc.pathname);
  }, [loc.pathname]);

  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category" element={<Category />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/ai-chat" element={<AiChat />} />
          <Route path="/link-analysis" element={<LinkAnalysis />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <AuthModal />
      <AiBubble />
    </>
  );
}
