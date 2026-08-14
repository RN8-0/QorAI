import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import BottomNav from './components/BottomNav.jsx';
import SiteBackground from './components/SiteBackground.jsx';
import { trackPageView } from './lib/analytics.js';
import { useAuth } from './lib/auth.jsx';
import { hasCompletedQuiz, wasQuizSkippedLocal } from './lib/qorCoins.js';

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
const Go = lazy(() => import('./pages/Go.jsx'));
const Blog = lazy(() => import('./pages/Blog.jsx'));
const BlogPost = lazy(() => import('./pages/BlogPost.jsx'));
const LegalPage = lazy(() => import('./pages/Legal.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// Bu üçü HER sayfada duruyor ama HİÇBİRİ ilk boyama için gerekli değil; eager
// import edildikleri için giriş paketini şişiriyorlardı. En pahalısı AiBubble:
// kendisi 40 KB ve ai.js + analysisHub + pageContext + AiText zincirini de içeri
// çekiyor. Mobilde asıl darboğaz indirme değil AYRIŞTIRMA/ÇALIŞTIRMA (ölçüldü:
// TBT ağ hızından neredeyse bağımsız, 4x CPU'da ~2 s) — yani giriş paketinden
// çıkan her KB doğrudan ana iş parçacığı süresi demek.
// Üçü de yalnızca `position: fixed` katmanlar çiziyor, dolayısıyla biraz geç
// gelmeleri hiçbir şeyi kaydırmaz (CLS'e etkisi yok).
const CompareBar = lazy(() => import('./components/CompareBar.jsx'));
const AuthModal = lazy(() => import('./components/AuthModal.jsx'));
const AiBubble = lazy(() => import('./components/AiBubble.jsx'));

export default function App() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();

  // Açılış kabuğunu (index.html'deki #qor-boot) kaldır. Effect COMMIT sonrası
  // koşar, yani gerçek arayüz zaten boyanmıştır — kabuk kalkarken arkasında boş
  // ekran kalmaz. Kabuk `position: fixed` olduğu için kaldırılması hiçbir şeyi
  // kaydırmaz (CLS 0).
  useEffect(() => { window.__qorBootDone?.(); }, []);

  // Scroll to top + report page view on every route change.
  // `behavior: 'instant'` ŞART: iki argümanlı `scrollTo(0, 0)` biçimi CSS'teki
  // `scroll-behavior`'a UYAR. Genel `html { scroll-behavior: smooth }` kuralı
  // dururken uzun bir listeden bir sayfaya geçmek, başa dönüşü saniyeler süren
  // bir animasyona çeviriyor ve o sırada kullanıcının kaydırması yutuluyordu.
  // Kural kaldırıldı; burada da davranışı açıkça sabitliyoruz ki ileride biri
  // global smooth'u geri koyduğunda sayfa geçişi yeniden bozulmasın.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    trackPageView(`${loc.pathname}${loc.search}`);
  }, [loc.pathname, loc.search]);

  // Onboarding quiz is offered once to new signed-in users, but it is SKIPPABLE
  // (like the app): if they dismissed it we don't force them back — they browse
  // freely. AI features stay gated by hasCompletedQuiz(), so the first AI action
  // still routes them to finish the quiz.
  useEffect(() => {
    if (!user || hasCompletedQuiz(user) || wasQuizSkippedLocal(user) || loc.pathname === '/quiz') return;
    if (String(user.email || '').toLowerCase().endsWith('@qorai.local')) return;
    const next = `${loc.pathname}${loc.search}${loc.hash}`;
    nav(`/quiz?required=1&next=${encodeURIComponent(next)}`, { replace: true });
  }, [loc.hash, loc.pathname, loc.search, nav, user]);

  return (
    <>
      <SiteBackground />
      <Header />
      {/* Footer, Suspense sınırının İÇİNDE. Dışarıdayken chunk beklenirken de
          render ediliyordu ve mobil CLS'in tek kaynağı buydu: yer tutucu kısa
          kalınca footer ekranda görünüyor, içerik gelince savruluyordu.
          Yer tutucuyu ekran boyuna çıkarmak ÇOĞU sayfayı düzeltti ama TERS
          yönde yeni bir kayma doğurdu — içeriği yer tutucudan KISA olan
          sayfalarda (profil 0.094, ai-chat 0.034) footer bu kez yukarı çıkıyordu.
          Footer yükleme sırasında hiç var olmayınca kayacak bir şey de kalmıyor:
          içerik geldiğinde altına EKLENİYOR, eklenen düğüm mevcut hiçbir şeyi
          oynatmadığı için CLS'e yazılmıyor. Yer tutucu kendi <main>'ini taşır,
          böylece `#root > main` düzen kuralları her iki durumda da geçerli. */}
      <Suspense fallback={(
        <main><div className="route-fallback"><div className="spinner" /></div></main>
      )}>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category" element={<Category />} />
          <Route path="/category/:cat" element={<Category />} />
          <Route path="/product" element={<ProductDetail />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/compare/:pair" element={<Compare />} />
          <Route path="/ai-chat" element={<AiChat />} />
          <Route path="/link-analysis" element={<LinkAnalysis />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/premium" element={<Premium />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/go" element={<Go />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/refund" element={<LegalPage kind="refund" />} />
          <Route path="/cookies" element={<LegalPage kind="cookies" />} />
          <Route path="/contact" element={<LegalPage kind="contact" />} />
          <Route path="/about" element={<LegalPage kind="about" />} />
          <Route path="/faq" element={<LegalPage kind="faq" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      </Suspense>
      <BottomNav />
      {/* Ayrı bir Suspense: bu katmanların gecikmesi route içeriğini bekletmesin.
          fallback null — üçü de sabit konumlu katman, yer tutucuya gerek yok. */}
      <Suspense fallback={null}>
        <CompareBar />
        <AuthModal />
        <AiBubble />
      </Suspense>
    </>
  );
}
