import { useState } from 'react';
import { Link } from 'react-router-dom';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n/index.jsx';
import AiText from '../components/AiText.jsx';
import './Quiz.css';

const QUESTIONS = [
  { field: 'product type', q: 'quiz.q1', opts: ['quiz.q1a', 'quiz.q1b', 'quiz.q1c', 'quiz.q1d', 'quiz.q1e'] },
  { field: 'budget', q: 'quiz.q2', opts: ['quiz.q2a', 'quiz.q2b', 'quiz.q2c'] },
  { field: 'priority', q: 'quiz.q3', opts: ['quiz.q3a', 'quiz.q3b', 'quiz.q3c', 'quiz.q3d', 'quiz.q3e'] },
  { field: 'usage', q: 'quiz.q4', opts: ['quiz.q4a', 'quiz.q4b', 'quiz.q4c', 'quiz.q4d'] },
  { field: 'brand', q: 'quiz.q5', opts: ['quiz.q5a', 'quiz.q5b', 'quiz.q5c', 'quiz.q5d'] },
];

const PROMPT = (answers, lang) =>
  'A user completed a product preference quiz. Their answers:\n' +
  Object.entries(answers).map(([k, v]) => `- ${k}: ${v}`).join('\n') +
  '\n\nBased on this profile write a friendly recommendation: which product type to go for, ' +
  'what to watch out for, and 2-3 models/segments that suit them. Use **bold** headings, ' +
  `"-" for bullets. Be short and clear. Reply ONLY in the language with ISO code: ${lang}.`;

export default function Quiz() {
  const { t, lang } = useI18n();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const total = QUESTIONS.length;
  const done = step >= total;

  async function pick(optKey) {
    const cur = QUESTIONS[step];
    const next = { ...answers, [cur.field]: t(optKey) };
    setAnswers(next);
    if (step + 1 < total) {
      setStep(step + 1);
    } else {
      setStep(total);
      setBusy(true);
      trackEvent('quiz_complete');
      try {
        setResult(await askQorAi([{ role: 'user', text: PROMPT(next, lang) }]));
      } catch {
        setResult(t('la.errFail'));
      } finally {
        setBusy(false);
      }
    }
  }

  function restart() { setStep(0); setAnswers({}); setResult(''); }

  return (
    <div className="container quiz">
      <div className="quiz-head">
        <div className="quiz-icon">🎯</div>
        <h1>{t('quiz.title')}</h1>
        <p>{t('quiz.subtitle')}</p>
      </div>

      {!done && (
        <div className="quiz-card fade-up">
          <div className="quiz-progress">
            <div className="quiz-progress-bar" style={{ width: `${(step / total) * 100}%` }} />
          </div>
          <div className="quiz-step-no">{t('quiz.step', { n: step + 1, total })}</div>
          <h2 className="quiz-q">{t(QUESTIONS[step].q)}</h2>
          <div className="quiz-opts">
            {QUESTIONS[step].opts.map((o) => (
              <button key={o} className="quiz-opt" onClick={() => pick(o)}>{t(o)}</button>
            ))}
          </div>
          {step > 0 && (
            <button className="quiz-back" onClick={() => setStep(step - 1)}>{t('quiz.back')}</button>
          )}
        </div>
      )}

      {done && busy && (
        <div className="quiz-loading">
          <div className="spinner" />
          <span>{t('quiz.loading')}</span>
        </div>
      )}

      {done && !busy && result && (
        <div className="quiz-result fade-up">
          <div className="quiz-result-head">{t('quiz.resultHead')}</div>
          <div className="quiz-result-body"><AiText text={result} /></div>
          <div className="quiz-result-actions">
            <button className="btn btn-ghost" onClick={restart}>{t('quiz.restart')}</button>
            <Link to="/" className="btn btn-primary">{t('quiz.browseCatalog')}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
