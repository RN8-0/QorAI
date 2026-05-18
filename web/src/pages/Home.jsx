import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStats, loadAllProducts } from '../lib/typesense';
import { catMeta, formatCount } from '../lib/format';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import './Home.css';

export default function Home() {
  const nav = useNavigate();
  const [stats, setStats] = useState({ total: 0, categories: 0, categoryCounts: [] });
  const [popular, setPopular] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    loadAllProducts((batch) => {
      setPopular(batch.slice(0, 12));
      setTrending(
        [...batch].sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0)).slice(0, 6),
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function search(e) {
    e.preventDefault();
    const t = q.trim();
    nav(t ? `/catalog?q=${encodeURIComponent(t)}` : '/catalog');
  }

  return (
    <div className="home">
      {/* SEARCH HERO */}
      <section className="h-hero">
        <div className="container">
          <h1>Doğru teknolojiyi <span className="grad-text">yapay zekâ</span> ile bul</h1>
          <p>{stats.total ? `${formatCount(stats.total)} ürün` : 'Binlerce ürün'} · AI puanlı · anında karşılaştırma</p>
          <form className="h-search" onSubmit={search}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Ürün, marka veya özellik ara…" autoComplete="off" />
            <button type="submit" className="btn btn-primary">Ara</button>
          </form>
          <div className="h-cats">
            {stats.categoryCounts.slice(0, 8).map((c) => {
              const m = catMeta(c.value);
              return (
                <Link key={c.value} to={`/catalog?cat=${c.value}`} className="h-cat">
                  <span className="h-cat-icon">{m.icon}</span>
                  <span className="h-cat-name">{m.label}</span>
                  <span className="h-cat-count">{c.count}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* POPULAR */}
      <section className="container h-sec">
        <div className="h-sec-head">
          <h2>Popüler Ürünler</h2>
          <Link to="/catalog" className="h-sec-all">Tümü →</Link>
        </div>
        <div className="card-grid">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : popular.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* TRENDING */}
      {!loading && trending.length > 0 && (
        <section className="container h-sec">
          <div className="h-sec-head">
            <h2>Yükselen Ürünler</h2>
            <Link to="/catalog" className="h-sec-all">Tümü →</Link>
          </div>
          <div className="card-grid">
            {trending.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* TOOLS STRIP — functional shortcuts, not marketing */}
      <section className="container h-sec">
        <div className="h-sec-head"><h2>Hızlı Araçlar</h2></div>
        <div className="h-tools">
          <Link to="/compare" className="h-tool"><b>⚖️ Karşılaştır</b><span>4 ürüne kadar yan yana</span></Link>
          <Link to="/ai-chat" className="h-tool"><b>💬 AI Sohbet</b><span>Sorunu sor, öneri al</span></Link>
          <Link to="/pc-builder" className="h-tool"><b>🖥️ PC Toplama</b><span>Bütçene göre kurulum</span></Link>
          <Link to="/link-analysis" className="h-tool"><b>🔗 Link Analizi</b><span>Bağlantıyı yapıştır, özetle</span></Link>
          <Link to="/subscriptions" className="h-tool"><b>📺 Abonelikler</b><span>Dijital abonelik kıyası</span></Link>
          <Link to="/quiz" className="h-tool"><b>🎯 Kişisel Quiz</b><span>Sana en uygun ürünü bul</span></Link>
        </div>
      </section>
    </div>
  );
}
