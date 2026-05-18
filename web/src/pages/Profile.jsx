import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCompare } from '../lib/compare';
import './Profile.css';

export default function Profile() {
  const { user, openAuth, logout } = useAuth();
  const { ids } = useCompare();

  if (!user) {
    return (
      <div className="container pf-guest">
        <div className="pf-guest-icon">👤</div>
        <h1>Profilini gör</h1>
        <p>Qor Coin bakiyeni, karşılaştırmalarını ve tercihlerini görmek için giriş yap.</p>
        <button className="btn btn-primary btn-lg" onClick={openAuth}>Giriş Yap / Kayıt Ol</button>
      </div>
    );
  }

  const name = user.name || user.email?.split('@')[0] || 'Kullanıcı';
  const coins = Math.round(Number(user.bonusQCoins) || 0);
  const joined = user.created
    ? new Date(user.created).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' })
    : '—';

  return (
    <div className="container pf">
      <div className="pf-card pf-id fade-up">
        <div className="pf-avatar">{name[0]?.toUpperCase() || 'U'}</div>
        <div className="pf-id-text">
          <h1>{name}</h1>
          <span>{user.email}</span>
          <small>Üyelik: {joined}</small>
        </div>
        <button className="btn btn-ghost pf-signout" onClick={logout}>Çıkış Yap</button>
      </div>

      <div className="pf-grid">
        <div className="pf-card pf-coins fade-up">
          <div className="pf-coin-badge"><span className="coin-dot">Q</span></div>
          <div>
            <div className="pf-coin-num">{coins}</div>
            <div className="pf-coin-lbl">Qor Coin bakiyen</div>
          </div>
          <p>Qor Coin, AI özelliklerinde (sohbet, analiz, karşılaştırma) kullanılır. Uygulamayla aynı bakiye.</p>
        </div>

        <div className="pf-card pf-stat fade-up">
          <div className="pf-stat-num">{ids.length}</div>
          <div className="pf-stat-lbl">Karşılaştırma listende</div>
          <Link to="/compare" className="btn btn-ghost">Listeyi Aç →</Link>
        </div>
      </div>

      <div className="pf-card pf-links fade-up">
        <h3>Hızlı Erişim</h3>
        <div className="pf-link-row">
          <Link to="/catalog">📦 Katalog</Link>
          <Link to="/compare">⚖️ Karşılaştır</Link>
          <a href="/privacy.html">🔒 Gizlilik</a>
          <a href="/terms.html">📄 Koşullar</a>
        </div>
      </div>
    </div>
  );
}
