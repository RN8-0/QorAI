import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Placeholder.css';

// The AI chat lives in the floating bubble — this route just opens it.
export default function AiChat() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('qor-open-ai'));
  }, []);

  return (
    <div className="container ph">
      <div className="ph-card fade-up">
        <div className="ph-emoji">💬</div>
        <h1>Qor AI Sohbet</h1>
        <p>Sohbet, sağ alttaki baloncukta açıldı — sayfayı gezerken hep yanında. Aşağıdan da açabilirsin.</p>
        <div className="ph-actions">
          <button className="btn btn-primary"
            onClick={() => window.dispatchEvent(new CustomEvent('qor-open-ai'))}>
            Sohbeti Aç
          </button>
          <Link to="/catalog" className="btn btn-ghost">Kataloğa Göz At</Link>
        </div>
      </div>
    </div>
  );
}
