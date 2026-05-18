import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="ft">
      <div className="container ft-inner">
        <div className="ft-grid">
          <div className="ft-brand">
            <div className="ft-brand-row">
              <img src="/assets/logo.png" alt="Qor AI" />
              <b>Qor AI</b>
            </div>
            <p>Teknoloji meraklıları için yapay zekâ destekli ürün danışmanı. Daha akıllı alışveriş, daha hızlı kararlar.</p>
          </div>
          <div className="ft-col">
            <h5>Ürün</h5>
            <Link to="/catalog">Katalog</Link>
            <Link to="/compare">Karşılaştır</Link>
            <Link to="/ai-chat">AI Sohbet</Link>
            <Link to="/pc-builder">PC Toplama</Link>
            <Link to="/subscriptions">Abonelikler</Link>
          </div>
          <div className="ft-col">
            <h5>Kurumsal</h5>
            <Link to="/link-analysis">Link Analizi</Link>
            <a href="mailto:contact@arain.digital">İletişim</a>
          </div>
          <div className="ft-col">
            <h5>Yasal</h5>
            <a href="/privacy.html">Gizlilik Politikası</a>
            <a href="/terms.html">Kullanım Koşulları</a>
          </div>
        </div>
        <div className="ft-bottom">
          <span>© {new Date().getFullYear()} Qor AI. Tüm hakları saklıdır.</span>
          <span>Teknoloji tutkunları için özenle yapıldı.</span>
        </div>
      </div>
    </footer>
  );
}
