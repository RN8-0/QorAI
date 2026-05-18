import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStats, loadAllProducts } from '../lib/typesense';
import { formatCount } from '../lib/format';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import './Home.css';

const FEATURES = [
  { icon: '💬', title: 'AI Sohbet Danışmanı', desc: 'Kendi dilinde sor — gerekçeli, uzman seviyesinde net öneriler al.' },
  { icon: '⚖️', title: 'Yan Yana Karşılaştırma', desc: '4 ürüne kadar seç; özellik, skor ve fiyat/performansı anında kıyasla.' },
  { icon: '⚡', title: 'Akıllı Skorlama', desc: 'Her ürüne özellik, gerçek yorum ve değere dayalı 0–100 skor.' },
  { icon: '🔗', title: 'Link Analizi', desc: 'Herhangi bir ürün bağlantısını yapıştır — AI özetler, artı/eksi çıkarır.' },
  { icon: '🖥️', title: 'PC Toplama', desc: 'Bütçene uygun dengeli PC kur — AI uyumluluğu ve darboğazı denetler.' },
  { icon: '📺', title: 'Abonelik Karşılaştırma', desc: 'Dijital abonelikleri kıyasla, sana en uygun olanı bul.' },
];

export default function Home() {
  const nav = useNavigate();
  const [stats, setStats] = useState({ total: 0, categories: 0 });
  const [top, setTop] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    loadAllProducts((batch) => {
      setTop(batch.slice(0, 10));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function search(e) {
    e.preventDefault();
    const term = q.trim();
    nav(term ? `/catalog?q=${encodeURIComponent(term)}` : '/catalog');
  }

  return (
    <div className="home">
      {/* HERO */}
      <section className="hero">
        <div className="container hero-inner fade-up">
          <span className="hero-pill">✦ Yapay zekâ destekli ürün danışmanı</span>
          <h1 className="hero-title">
            Doğru teknolojiyi <span className="grad-text">yapay zekâ</span> ile bul
          </h1>
          <p className="hero-sub">
            Akıllı telefonlar, laptoplar, ekran kartları ve daha fazlası — AI ile analiz edildi,
            puanlandı ve karşılaştırıldı. Ne istediğini söyle, saniyeler içinde uzman önerisi al.
          </p>
          <form className="hero-search" onSubmit={search}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Ürün ara — ör. 'iPhone 15', 'oyun laptopu'…" />
            <button type="submit" className="btn btn-primary">Ara</button>
          </form>

          <div className="hero-stats">
            <div className="hstat">
              <b>{stats.total ? formatCount(stats.total) : '—'}</b>
              <span>Katalogdaki ürün</span>
            </div>
            <div className="hstat">
              <b>{stats.categories || '—'}</b>
              <span>Kategori</span>
            </div>
            <div className="hstat">
              <b>iOS · Android</b>
              <span>Mobil uygulama</span>
            </div>
            <div className="hstat">
              <b>Ücretsiz</b>
              <span>Başlamak için</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section container">
        <div className="section-head">
          <span className="eyebrow">Neler yapabilirsin</span>
          <h2>Karar vermek için her şey tek yerde</h2>
          <p>Hızlı AI yanıtlarından derin yan yana karşılaştırmalara kadar.</p>
        </div>
        <div className="feat-grid">
          {FEATURES.map((f) => (
            <div className="feat-card" key={f.title}>
              <div className="feat-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TOP PRODUCTS */}
      <section className="section container">
        <div className="section-head">
          <span className="eyebrow">Öne çıkanlar</span>
          <h2>En yüksek puanlı ürünler</h2>
          <p>AI skoruna göre kataloğun zirvesindekiler.</p>
        </div>
        <div className="home-grid">
          {loading
            ? Array.from({ length: 10 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : top.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
        <div className="home-more">
          <Link to="/catalog" className="btn btn-ghost btn-lg">Tüm kataloğu gör →</Link>
        </div>
      </section>

      {/* APP CTA */}
      <section className="section container">
        <div className="app-cta">
          <div className="app-cta-text">
            <h3>Qor AI'ı her yere götür</h3>
            <p>Aynı hesap, aynı veri — iOS ve Android'de. Barkod tara, fotoğraf çek, yolda AI önerisi al.</p>
            <div className="app-cta-badges">
              <span className="store-badge"> App Store</span>
              <span className="store-badge">▶ Google Play</span>
            </div>
          </div>
          <img src="/assets/logo.png" alt="Qor AI" className="app-cta-logo" />
        </div>
      </section>
    </div>
  );
}
