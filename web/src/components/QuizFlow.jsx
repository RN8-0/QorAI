import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import './QuizFlow.css';

// Shared quiz UI for the link-analysis and subscription flows — mirrors the
// app's quiz step: AI-generated questions, four tappable option cards each, a
// progress bar, and Submit / Skip actions. Answers are returned as
// [{ question, answer }] so they can be fed straight into the analysis prompts.
export default function QuizFlow({ questions = [], onSubmit, onSkip, busy = false, title, subtitle }) {
  const { lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [answers, setAnswers] = useState({});

  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id] != null).length,
    [answers, questions],
  );
  const allAnswered = answeredCount === questions.length && questions.length > 0;

  function pick(qid, option) {
    setAnswers((a) => ({ ...a, [qid]: option }));
  }

  function submit() {
    if (!allAnswered || busy) return;
    onSubmit(questions.map((q) => ({ question: q.text, answer: answers[q.id] ?? null })));
  }

  // No questions → nothing to render. Prevents a dead-end card whose submit
  // button can never enable ("Answer all 0 questions").
  if (!questions.length) return null;

  return (
    <div className="quiz fade-up">
      <div className="quiz-head">
        <div className="quiz-head-text">
          <strong>{title || L('Quick quiz', 'Hızlı quiz', 'Kurzes Quiz')}</strong>
          <span>{subtitle || L('Answer a few questions for a personalized analysis.',
            'Kişiselleştirilmiş analiz için birkaç soruyu yanıtla.',
            'Beantworte ein paar Fragen für eine personalisierte Analyse.')}</span>
        </div>
        <span className="quiz-progress-pill">{answeredCount}/{questions.length}</span>
      </div>
      <div className="quiz-progress"><i style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }} /></div>

      <div className="quiz-list">
        {questions.map((q, i) => (
          <div className="quiz-q" key={q.id}>
            <h3><span className="quiz-q-no">{i + 1}</span>{q.text}</h3>
            <div className="quiz-options">
              {q.options.map((option) => (
                <button type="button" key={option}
                  className={'quiz-option' + (answers[q.id] === option ? ' on' : '')}
                  onClick={() => pick(q.id, option)} disabled={busy}>
                  <span className="quiz-option-tick" aria-hidden="true" />
                  <span>{option}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="quiz-actions">
        {onSkip && (
          <button type="button" className="btn btn-ghost" onClick={onSkip} disabled={busy}>
            {L('Skip quiz', 'Quizi atla', 'Quiz überspringen')}
          </button>
        )}
        <button type="button" className="btn btn-primary quiz-submit" onClick={submit}
          disabled={!allAnswered || busy}>
          {busy
            ? L('Analyzing…', 'Analiz ediliyor…', 'Wird analysiert…')
            : allAnswered
              ? L('Analyze', 'Analiz Et', 'Analysieren')
              : L(`Answer all ${questions.length} questions`, `${questions.length} sorunun hepsini yanıtla`, `Beantworte alle ${questions.length} Fragen`)}
        </button>
      </div>
    </div>
  );
}
