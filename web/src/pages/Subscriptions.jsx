import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateSubscriptionQuiz, subscriptionAnalysis, subscriptionsMixCategories } from '../lib/linkAnalysis';
import { trackEvent } from '../lib/analytics';
import { saveSubscriptionHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import { aiUserProfile, hasCompletedQuiz } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import AiText from '../components/AiText.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import { useSeo } from '../lib/seo';
import './Subscriptions.css';

const PRESETS = [
  'Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Amazon Prime',
  'Adobe Creative Cloud', 'iCloud+', 'Microsoft 365', 'ChatGPT Plus', 'Claude Pro',
  'Xbox Game Pass', 'Apple Music',
];
const PENDING_SUBS_KEY = 'qor.pendingSubscriptionAnalysis';

function ServiceCard({ s, isWinner, L }) {
  const score = Math.round(s.score || 0);
  return (
    <div className={'subs-svc' + (isWinner ? ' winner' : '')}>
      {isWinner && <span className="subs-svc-win">★ {L('Best fit', 'En uygun', 'Beste Wahl')}</span>}
      <div className="subs-svc-top">
        <Gauge value={score} size={56} stroke={5} color={techColor(score)} fontSize={16} />
        <div className="subs-svc-id">
          <strong>{s.name}</strong>
          {s.category && <span>{s.category}</span>}
        </div>
      </div>
      {s.explanation && <p className="subs-svc-exp">{s.explanation}</p>}
      {s.factors.length > 0 && (
        <div className="subs-svc-factors">
          {s.factors.map((f) => (
            <div className="subs-svc-factor" key={f.label}>
              <span>{f.label.replace(/_/g, ' ')}</span>
              <div className="subs-svc-fbar"><i style={{ width: `${Math.max(4, Math.min(100, f.score))}%`, background: techColor(f.score) }} /></div>
            </div>
          ))}
        </div>
      )}
      <div className="subs-svc-pc">
        {s.pros.length > 0 && (
          <ul className="subs-svc-pros">{s.pros.map((x, i) => <li key={i}>{x}</li>)}</ul>
        )}
        {s.cons.length > 0 && (
          <ul className="subs-svc-cons">{s.cons.map((x, i) => <li key={i}>{x}</li>)}</ul>
        )}
      </div>
      {s.community && <p className="subs-svc-comm">🌐 {s.community}</p>}
      {s.bestFor && <p className="subs-svc-best">🎯 {s.bestFor}</p>}
    </div>
  );
}

export default function Subscriptions() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const nav = useNavigate();
  const requireAiAccess = useAiAccess(lang);
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('subs.title')} — Qor AI`, description: t('subs.subtitle'), path: '/subscriptions' });

  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState('');
  // phase: select | quizLoading | quiz | analyzing | result
  const [phase, setPhase] = useState('select');
  const [questions, setQuestions] = useState([]);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  function resetAnalysis() { setPhase('select'); setQuestions([]); setResult(null); setErr(''); }
  function toggle(name) {
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
    resetAnalysis();
  }
  function addCustom(e) {
    e.preventDefault();
    const v = custom.trim();
    if (v && !selected.includes(v)) setSelected((s) => [...s, v]);
    setCustom('');
    resetAnalysis();
  }

  function savePending(items) {
    localStorage.setItem(PENDING_SUBS_KEY, JSON.stringify({ selected: items, custom, ts: Date.now() }));
  }

  // Step 1: validate + generate the AI quiz (same engine as the app).
  async function startQuiz(items = selected) {
    setErr('');
    if (items.length < 1) return;
    if (subscriptionsMixCategories(items)) {
      setErr(L('Only services of the same type can be compared (e.g. Netflix vs Disney+).',
        'Yalnızca aynı tür servisler karşılaştırılabilir (ör. Netflix ile Disney+).',
        'Nur Dienste desselben Typs können verglichen werden (z. B. Netflix vs Disney+).'));
      return;
    }
    if (!user) {
      savePending(items);
      openAuth();
      return;
    }
    if (!hasCompletedQuiz(user)) {
      savePending(items);
      setErr(L('Complete the profile quiz first. Your subscriptions are saved.',
        'Önce profil quizini tamamla. Abonelik seçimlerin kaydedildi.',
        'Schließe zuerst das Profil-Quiz ab. Deine Auswahl bleibt gespeichert.'));
      nav(`/quiz?required=1&next=${encodeURIComponent('/subscriptions')}`);
      return;
    }
    setPhase('quizLoading');
    trackEvent('subscription_quiz', { count: items.length });
    try {
      const access = await requireAiAccess('subscription_analysis', { onMessage: setErr });
      if (!access.ok) { setPhase('select'); return; }
      const qs = await generateSubscriptionQuiz({ subscriptionNames: items, language: lang, userProfile: aiUserProfile(user) });
      if (qs.length) { setQuestions(qs); setPhase('quiz'); }
      else { await runAnalysis(items, []); }
    } catch {
      // If quiz generation fails, fall back to a direct analysis.
      await runAnalysis(items, []);
    }
  }

  // Step 2: structured subscription analysis (scores / winner / recommendation).
  async function runAnalysis(items, answers) {
    setPhase('analyzing');
    trackEvent('subscription_compare', { count: items.length });
    try {
      const data = await subscriptionAnalysis({ subscriptionNames: items, answers, language: lang, userProfile: aiUserProfile(user) });
      setResult(data);
      setPhase('result');
      saveSubscriptionHistory({ services: items, quiz: answers, analysis: data.recommendation, scores: data.scores });
    } catch {
      setErr(t('la.errFail'));
      setPhase('quiz');
    }
  }

  useEffect(() => {
    if (!user || !hasCompletedQuiz(user)) return;
    const raw = localStorage.getItem(PENDING_SUBS_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_SUBS_KEY);
    try {
      const pending = JSON.parse(raw);
      const items = Array.isArray(pending.selected) ? pending.selected.filter(Boolean) : [];
      if (!items.length) return;
      setSelected(items);
      setCustom(pending.custom || '');
      startQuiz(items);
    } catch { /* ignore stale pending payloads */ }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const showPicker = phase === 'select';
  const winnerName = result?.winner?.best || result?.winner?.overall || '';

  return (
    <div className="container subs">
      <div className="subs-head">
        <div className="subs-icon" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="13" rx="2" />
            <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
            <path d="M10 12l4 2.5-4 2.5z" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <h1>{t('subs.title')}</h1>
        <p>{t('subs.subtitle')}</p>
      </div>

      {showPicker && (
        <>
          <div className="subs-pills">
            {PRESETS.map((name) => (
              <button key={name}
                className={'subs-pill' + (selected.includes(name) ? ' active' : '')}
                onClick={() => toggle(name)}>
                {selected.includes(name) ? '✓ ' : '+ '}{name}
              </button>
            ))}
          </div>

          <form className="subs-custom" onSubmit={addCustom}>
            <input value={custom} onChange={(e) => setCustom(e.target.value)}
              placeholder={t('subs.customPlaceholder')} />
            <button type="submit" className="btn btn-ghost">{t('subs.add')}</button>
          </form>

          {selected.length > 0 && (
            <div className="subs-selected">
              {selected.map((s) => (
                <span key={s} className="subs-chip">
                  {s}<button onClick={() => toggle(s)} aria-label="Remove">×</button>
                </span>
              ))}
            </div>
          )}

          {err && <div className="subs-err">{err}</div>}

          <button className="btn btn-primary btn-lg subs-go"
            onClick={() => startQuiz()} disabled={selected.length < 1}>
            {selected.length < 1 ? t('subs.goMin') : t('subs.startQuiz')}
          </button>
        </>
      )}

      {(phase === 'quizLoading' || phase === 'analyzing') && (
        <div className="subs-loading"><div className="spinner" /><span>
          {phase === 'quizLoading'
            ? L('Building your quiz…', 'Quizin hazırlanıyor…', 'Quiz wird erstellt…')
            : t('subs.loading')}
        </span></div>
      )}

      {phase === 'quiz' && (
        <>
          <div className="subs-quiz-for">
            {selected.map((s) => <span key={s} className="subs-chip subs-chip-static">{s}</span>)}
          </div>
          <QuizFlow
            questions={questions}
            title={t('subs.quizTitle')}
            subtitle={t('subs.quizDesc')}
            onSubmit={(answers) => runAnalysis(selected, answers)}
            onSkip={() => runAnalysis(selected, [])}
          />
        </>
      )}

      {phase === 'result' && result && (
        <div className="subs-result fade-up">
          <div className="subs-svc-grid">
            {result.services.map((s) => (
              <ServiceCard key={s.name} s={s} isWinner={result.isCompare && s.name === winnerName} L={L} />
            ))}
          </div>

          {result.detailed && (
            <div className="subs-detailed">
              {result.detailed.fit && <p><b>{L('Overall fit', 'Genel uyum', 'Gesamtpassung')}:</b> {result.detailed.fit}</p>}
              {result.detailed.features && <p><b>{L('Features', 'Özellikler', 'Funktionen')}:</b> {result.detailed.features}</p>}
              {result.detailed.ux && <p><b>{L('Experience', 'Deneyim', 'Erlebnis')}:</b> {result.detailed.ux}</p>}
            </div>
          )}

          {result.recommendation && (
            <div className="subs-reco">
              <div className="subs-reco-head">✨ {t('subs.resultHead')}</div>
              <div className="subs-reco-body"><AiText text={result.recommendation} /></div>
            </div>
          )}

          <div className="subs-again">
            <button type="button" className="btn btn-ghost" onClick={resetAnalysis}>
              {L('New analysis', 'Yeni analiz', 'Neue Analyse')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
