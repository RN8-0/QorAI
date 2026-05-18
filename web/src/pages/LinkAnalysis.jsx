import { useState } from 'react';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import './LinkAnalysis.css';

const PROMPT = (url) =>
  `Bir kullanıcı şu ürün bağlantısını analiz etmek istiyor: ${url}\n\n` +
  'Bağlantıdaki ürünü tanımla ve şu başlıklarla, Türkçe, sade bir değerlendirme yap:\n' +
  '1. Ürün adı (tahminin)\n2. Kısa özet (2-3 cümle)\n3. Artıları (madde madde)\n' +
  '4. Eksileri (madde madde)\n5. Kimler için uygun / Qor AI tavsiyesi\n\n' +
  'Bağlantının içeriğini açamıyorsan URL\'deki isimden yola çıkarak bilgine dayanarak değerlendir. ' +
  'Başlıkları **kalın** yaz.';

// Renders the AI's lightly-marked-up text (**bold**, bullet lines).
function renderText(text) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith('**') && seg.endsWith('**')
        ? <strong key={j}>{seg.slice(2, -2)}</strong>
        : seg,
    );
    return <p key={i} className="la-line">{parts}</p>;
  });
}

export default function LinkAnalysis() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function analyze(e) {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { setErr('Lütfen http(s):// ile başlayan geçerli bir bağlantı gir.'); return; }
    setErr(''); setBusy(true); setResult('');
    trackEvent('link_analysis');
    try {
      const reply = await askQorAi([{ role: 'user', text: PROMPT(u) }]);
      setResult(reply);
    } catch {
      setErr('Analiz şu an yapılamadı. Birazdan tekrar dene.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container la">
      <div className="la-head">
        <div className="la-icon">🔗</div>
        <h1>Link <span className="grad-text">Analizi</span></h1>
        <p>Herhangi bir ürün bağlantısını yapıştır — Qor AI ürünü tanısın, artı/eksilerini özetlesin.</p>
      </div>

      <form className="la-form" onSubmit={analyze}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… ürün bağlantısını yapıştır"
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Analiz ediliyor…' : 'Analiz Et'}
        </button>
      </form>
      {err && <div className="la-err">{err}</div>}

      {busy && (
        <div className="la-loading">
          <div className="spinner" />
          <span>Qor AI ürünü inceliyor…</span>
        </div>
      )}

      {result && (
        <div className="la-result fade-up">
          <div className="la-result-head">🧠 Qor AI Değerlendirmesi</div>
          <div className="la-result-body">{renderText(result)}</div>
        </div>
      )}
    </div>
  );
}
