import { useState } from 'react';
import { Link } from 'react-router-dom';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import AiText from '../components/AiText.jsx';
import './Quiz.css';

const QUESTIONS = [
  {
    q: 'Ne tür bir ürün arıyorsun?',
    key: 'tür',
    opts: ['Akıllı telefon', 'Laptop', 'Kulaklık', 'Tablet', 'Fark etmez'],
  },
  {
    q: 'Bütçen ne kadar?',
    key: 'bütçe',
    opts: ['Ekonomik (uygun fiyat)', 'Orta segment', 'Üst segment / premium'],
  },
  {
    q: 'Senin için en önemli şey ne?',
    key: 'öncelik',
    opts: ['Kamera', 'Performans', 'Batarya ömrü', 'Ekran kalitesi', 'Fiyat/performans'],
  },
  {
    q: 'Nasıl kullanacaksın?',
    key: 'kullanım',
    opts: ['Oyun', 'İş / üretkenlik', 'Günlük kullanım', 'Medya / film / müzik'],
  },
  {
    q: 'Marka tercihin var mı?',
    key: 'marka',
    opts: ['Apple', 'Samsung', 'Xiaomi', 'Fark etmez'],
  },
];

const PROMPT = (answers) =>
  'Bir kullanıcı ürün tercih quizini doldurdu. Cevapları:\n' +
  Object.entries(answers).map(([k, v]) => `- ${k}: ${v}`).join('\n') +
  '\n\nBu profile göre Türkçe, samimi bir öneri yaz: hangi tür ürüne yönelmeli, ' +
  'nelere dikkat etmeli, hangi 2-3 model/segment ona uygun. **Kalın** başlıklar kullan, ' +
  'maddeleri "-" ile yaz. Kısa ve net ol.';

export default function Quiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const total = QUESTIONS.length;
  const done = step >= total;

  async function pick(opt) {
    const cur = QUESTIONS[step];
    const next = { ...answers, [cur.key]: opt };
    setAnswers(next);
    if (step + 1 < total) {
      setStep(step + 1);
    } else {
      setStep(total);
      setBusy(true);
      trackEvent('quiz_complete');
      try {
        setResult(await askQorAi([{ role: 'user', text: PROMPT(next) }]));
      } catch {
        setResult('Öneri şu an oluşturulamadı. Birazdan tekrar dene.');
      } finally {
        setBusy(false);
      }
    }
  }

  function restart() {
    setStep(0); setAnswers({}); setResult('');
  }

  return (
    <div className="container quiz">
      <div className="quiz-head">
        <div className="quiz-icon">🎯</div>
        <h1>Kişisel <span className="grad-text">Quiz</span></h1>
        <p>Birkaç soru — sana en uygun ürünü Qor AI bulsun.</p>
      </div>

      {!done && (
        <div className="quiz-card fade-up">
          <div className="quiz-progress">
            <div className="quiz-progress-bar" style={{ width: `${(step / total) * 100}%` }} />
          </div>
          <div className="quiz-step-no">Soru {step + 1} / {total}</div>
          <h2 className="quiz-q">{QUESTIONS[step].q}</h2>
          <div className="quiz-opts">
            {QUESTIONS[step].opts.map((o) => (
              <button key={o} className="quiz-opt" onClick={() => pick(o)}>{o}</button>
            ))}
          </div>
          {step > 0 && (
            <button className="quiz-back" onClick={() => setStep(step - 1)}>← Geri</button>
          )}
        </div>
      )}

      {done && busy && (
        <div className="quiz-loading">
          <div className="spinner" />
          <span>Qor AI senin için en uygununu seçiyor…</span>
        </div>
      )}

      {done && !busy && result && (
        <div className="quiz-result fade-up">
          <div className="quiz-result-head">🧠 Sana Özel Qor AI Önerisi</div>
          <div className="quiz-result-body"><AiText text={result} /></div>
          <div className="quiz-result-actions">
            <button className="btn btn-ghost" onClick={restart}>Quizi Tekrarla</button>
            <Link to="/catalog" className="btn btn-primary">Kataloğa Göz At</Link>
          </div>
        </div>
      )}
    </div>
  );
}
