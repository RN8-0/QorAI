import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, matchPath, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import BottomNav from './components/BottomNav.jsx';
import SiteBackground from './components/SiteBackground.jsx';
import { trackEvent, trackPageView } from './lib/analytics.js';
import { useAuth } from './lib/auth.jsx';
import { useCompare } from './lib/compare.js';
import AiFab, { hasActiveAnalysis } from './components/AiFab.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { hasCompletedQuiz, wasQuizSkippedLocal } from './lib/qorCoins.js';
import { modeOn, routeOpen } from './lib/siteMode.js';

// Home stays eager so the landing page paints on the first request (no extra
// chunk round-trip on the most-visited route). Every other page is loaded on
// demand: this is what keeps the initial JS small instead of shipping all
// pages — ProductDetail, Compare, Quiz, Legal, etc. — in one ~900 KB bundle
// that every visitor (especially mobile) has to download, parse and execute
// before anything renders.
import Home from './pages/Home.jsx';

const Search = lazy(() => import('./pages/Search.jsx'));
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
// Analizler — sitenin tek OZGUN icerigi (spec/fiyat Epey'den, analiz bize ait).
const Analyses = lazy(() => import('./pages/Analyses.jsx'));
const AnalysisPost = lazy(() => import('./pages/AnalysisPost.jsx'));
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

// Açılış kabuğunu (index.html'deki #qor-boot) kaldırır. SUSPENSE SINIRININ
// İÇİNDE render edilmesi ŞART — bu yüzden App'in kendi effect'i değil, ayrı
// bir düğüm. ÖNCEDEN App mount olur olmaz çağrılıyordu; tembel rota chunk'ı
// hâlâ inerken kabuk kalkıyor ve arkasında `.route-fallback` spinner'ından
// başka bir şey kalmıyordu. Ölçüldü (2026-08-19, canlı ürün sayfası,
// 390x844 + 4x CPU + Yavaş 4G, scripts/_urun_gecikme.mjs):
//   kabuk kaldırıldı        3428 ms
//   .route-fallback ekranda 3292 → 4128 ms   ← arka plan var, içerik yok
//   gerçek içerik           5722 ms
// Kullanıcının gönderdiği "üst bar + boş gövde" karesi tam olarak bu aralık.
// Sınırın İÇİNDE olduğu için ancak rota chunk'ı çözülüp DOM'a bağlandığında
// koşar. Ana sayfa eager import olduğundan davranışı değişmez.
// Chunk hiç gelmezse index.html'deki 12 sn'lik kurtarma zamanlayıcısı yine
// kabuğu kaldırıp ön-render metnini görünür yapar — o yol bozulmadı.
function BootDone() {
  useEffect(() => { window.__qorBootDone?.(); }, []);
  return null;
}

/* OLU ADRES SAYFA GORUNTULEMESI OLARAK SAYILMAZ.
 *
 * nginx artik olu adreslere gercek 404 donuyor (docs/nginx_website.conf),
 * ama o 404 kabugu yine SPA'yi aciyor ve SPA her rota degisiminde bir sayfa
 * goruntulemesi yaziyordu. Sonuc: GA4'un "en cok goruntulenen sayfalar"
 * raporunda "Page not found" ust siralarda — okuyucuyu yaniltan bir satir.
 *
 * Olu adres artik `page_not_found` OLAYI olarak raporlanir: hacim kaybolmuyor
 * (hangi adreslerin oldugu da geliyor), yalnizca sayfa goruntuleme raporunu
 * kirletmiyor.
 *
 * Desenler asagidaki <Routes> ile AYNI kalmak zorunda; biri eklenirse buraya
 * da eklenmeli. Eslesmeyen bir desen yalnizca fazladan bir sayfa goruntulemesi
 * demek — sessizce yanlis bir sey OLMAZ.
 */
const ROTA_DESENLERI = [
  '/', '/search', '/category', '/category/:cat', '/product', '/product/:id',
  '/compare', '/compare/:pair', '/ai-chat', '/link-analysis', '/subscriptions',
  '/premium', '/quiz', '/go', '/blog', '/blog/:slug', '/analiz', '/analiz/:slug',
  '/profile', '/terms', '/privacy', '/refund', '/cookies', '/contact', '/about', '/faq',
];
const bilinenRota = (yol) => ROTA_DESENLERI.some((d) => matchPath({ path: d, end: true }, yol));

// Kapali moda bagli rota (bkz. lib/siteMode.js). Sayfa bileseni ve rota
// SILINMEDI — yalnizca element degistirildi, dolayisiyla bayragi `true`
// yapmak sayfayi oldugu gibi geri getirir.
//
// Rotanin KENDISI duruyor olmasi onemli: on-render kabugu (website/premium/,
// website/ai-chat/ …) diskte kaliyor, nginx 200 donuyor ve SPA acilinca
// ziyaretciyi ana sayfaya tasiyor. Rotayi komple kaldirmak o adresleri
// 404'e dusururdu — Google'in bildigi bir adresi 404 yapmak, noindex ile
// sessizce dusurmekten daha zararlidir.
function gated(path, element) {
  return routeOpen(path) ? element : <Navigate to="/" replace />;
}

export default function App() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, modalOpen } = useAuth();
  // Havuz boşken CompareBar zaten `null` dönüyordu — ama bunu ÖĞRENMEK için
  // chunk'ın inip çalışması gerekiyordu. Koşulu buraya taşıyınca ziyaretçilerin
  // çoğu o isteği hiç yapmıyor. AuthModal'da aynı mantık: kapalıyken hiçbir şey
  // çizmiyor ama modülü 120 ms CPU harcayarak çalışıyordu (profillendi).
  const { ids: compareIds } = useCompare();
  // Qor balonu: agir panel YALNIZCA gerekince. Ayrinti icin AiFab.jsx.
  const [aiOn, setAiOn] = useState(false);
  const [aiAuto, setAiAuto] = useState(false);
  const openAi = useCallback(() => { setAiAuto(true); setAiOn(true); }, []);
  // Sag alt katman (Qor dugmesi + sohbet balonu) `chat` moduna bagli.
  // NOT: "analiz hazir" bildirimi de bu balondan cikiyor, yani sohbeti
  // kapatmak o bildirimi de kapatir. Bugun sorun degil — ziyaretciye donuk
  // analiz akislarinin hepsi zaten kapali. `userAi` tek basina acilirsa
  // bildirim yuzeyi icin burasi yeniden dusunulmeli.
  const chatOn = modeOn('chat');
  useEffect(() => {
    // Arka planda calisan bir analiz varsa balon KENDILIGINDEN yuklenir ki
    // "hazir" bildirimi eskisi gibi gorunsun. Kontrol tek bir localStorage
    // okumasi — hicbir chunk indirmiyor.
    if (chatOn && hasActiveAnalysis()) setAiOn(true);
  }, [chatOn, loc.pathname]);


  // Scroll to top + report page view on every route change.
  // `behavior: 'instant'` ŞART: iki argümanlı `scrollTo(0, 0)` biçimi CSS'teki
  // `scroll-behavior`'a UYAR. Genel `html { scroll-behavior: smooth }` kuralı
  // dururken uzun bir listeden bir sayfaya geçmek, başa dönüşü saniyeler süren
  // bir animasyona çeviriyor ve o sırada kullanıcının kaydırması yutuluyordu.
  // Kural kaldırıldı; burada da davranışı açıkça sabitliyoruz ki ileride biri
  // global smooth'u geri koyduğunda sayfa geçişi yeniden bozulmasın.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const yol = `${loc.pathname}${loc.search}`;
    if (bilinenRota(loc.pathname)) trackPageView(yol);
    else trackEvent('page_not_found', { path: loc.pathname });
  }, [loc.pathname, loc.search]);

  // Onboarding quiz is offered once to new signed-in users, but it is SKIPPABLE
  // (like the app): if they dismissed it we don't force them back — they browse
  // freely. AI features stay gated by hasCompletedQuiz(), so the first AI action
  // still routes them to finish the quiz.
  useEffect(() => {
    // Quiz modu kapaliyken kimse quize yonlendirilmez — rota `/`'a gidiyor,
    // yonlendirme birakilsaydi yeni kullanici sonsuz doneme girerdi.
    if (!modeOn('quiz')) return;
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
        {/* Rota sınırı. Tek bir sayfanın hatası (en sık: bayat chunk'ın
            dinamik import'unun reddedilmesi) ÖNCEDEN kökü söküp siteyi
            komple beyaz bırakıyordu. Sınır burada olduğu için Header,
            Footer ve BottomNav ayakta kalır; `resetKey` ile kullanıcı başka
            bir sayfaya geçince sınır kendini toparlar. */}
        <ErrorBoundary resetKey={loc.pathname} wrap={false}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/category" element={<Category />} />
          <Route path="/category/:cat" element={<Category />} />
          <Route path="/product" element={<ProductDetail />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/compare/:pair" element={<Compare />} />
          <Route path="/ai-chat" element={gated('/ai-chat', <AiChat />)} />
          <Route path="/link-analysis" element={gated('/link-analysis', <LinkAnalysis />)} />
          <Route path="/subscriptions" element={gated('/subscriptions', <Subscriptions />)} />
          <Route path="/premium" element={gated('/premium', <Premium />)} />
          <Route path="/quiz" element={gated('/quiz', <Quiz />)} />
          <Route path="/go" element={<Go />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/analiz" element={<Analyses />} />
          <Route path="/analiz/:slug" element={<AnalysisPost />} />
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
        </ErrorBoundary>
        <BootDone />
      </main>
      <Footer />
      </Suspense>
      <BottomNav />
      {/* Ayrı bir Suspense: bu katmanların gecikmesi route içeriğini bekletmesin.
          fallback null — üçü de sabit konumlu katman, yer tutucuya gerek yok. */}
      <Suspense fallback={null}>
        {compareIds.length > 0 && <CompareBar />}
        {modalOpen && <AuthModal />}
        {chatOn && aiOn && <AiBubble autoOpen={aiAuto} />}
      </Suspense>
      {chatOn && !aiOn && <AiFab onOpen={openAi} />}
    </>
  );
}
