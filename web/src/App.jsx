import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import AuthModal from './components/AuthModal.jsx';
import AiBubble from './components/AiBubble.jsx';
import { trackPageView } from './lib/analytics.js';

import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Compare from './pages/Compare.jsx';
import LinkAnalysis from './pages/LinkAnalysis.jsx';
import AiChat from './pages/AiChat.jsx';
import Profile from './pages/Profile.jsx';
import Placeholder from './pages/Placeholder.jsx';
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
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/ai-chat" element={<AiChat />} />
          <Route path="/pc-builder" element={<Placeholder title="PC Toplama" emoji="🖥️" />} />
          <Route path="/link-analysis" element={<LinkAnalysis />} />
          <Route path="/subscriptions" element={<Placeholder title="Abonelik Karşılaştırma" emoji="📺" />} />
          <Route path="/quiz" element={<Placeholder title="Kişisel Quiz" emoji="🎯" />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <AuthModal />
      <AiBubble />
    </>
  );
}
