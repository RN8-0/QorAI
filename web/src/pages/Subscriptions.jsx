import { useEffect, useState } from 'react';
import { askQorAi } from '../lib/ai';
import { trackEvent } from '../lib/analytics';
import { saveSubscriptionHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import AiText from '../components/AiText.jsx';
import { useSeo } from '../lib/seo';
import './Subscriptions.css';

const PRESETS = [
  'Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Amazon Prime',
  'Adobe Creative Cloud', 'iCloud+', 'Microsoft 365', 'ChatGPT Plus', 'Claude Pro',
  'Xbox Game Pass', 'Apple Music',
];
const PENDING_SUBS_KEY = 'qor.pendingSubscriptionAnalysis';

function quizQuestions(L) {
  return [
    {
      q: L('What do you use these subscriptions for most?', 'Bu abonelikleri en çok ne için kullanıyorsun?', 'Wofür nutzt du diese Abos am meisten?'),
      options: [
        L('Movies and series', 'Film ve dizi', 'Filme und Serien'),
        L('Music and podcasts', 'Müzik ve podcast', 'Musik und Podcasts'),
        L('Work and productivity', 'İş ve üretkenlik', 'Arbeit und Produktivität'),
        L('Mixed family use', 'Karışık aile kullanımı', 'Gemischte Familiennutzung'),
      ],
    },
    {
      q: L('How sensitive are you to monthly cost?', 'Aylık maliyete ne kadar hassassın?', 'Wie wichtig sind dir monatliche Kosten?'),
      options: [
        L('Keep only essentials', 'Sadece gerekli olanlar kalsın', 'Nur das Nötigste behalten'),
        L('Value matters more than lowest price', 'En ucuzdan çok değer önemli', 'Wert ist wichtiger als der niedrigste Preis'),
        L('I can pay for quality', 'Kalite için ödeyebilirim', 'Für Qualität zahle ich mehr'),
      ],
    },
    {
      q: L('How often do you actually use them?', 'Gerçekte ne sıklıkla kullanıyorsun?', 'Wie oft nutzt du sie wirklich?'),
      options: [
        L('Every day', 'Her gün', 'Jeden Tag'),
        L('A few times a week', 'Haftada birkaç kez', 'Mehrmals pro Woche'),
        L('Rarely, only for specific content', 'Nadiren, sadece belirli içerikler için', 'Selten, nur für bestimmte Inhalte'),
      ],
    },
    {
      q: L('What should Qor AI optimize for?', 'Qor AI neyi optimize etsin?', 'Worauf soll Qor AI optimieren?'),
      options: [
        L('Cancel waste and keep value', 'Boşa gidenleri kapat, değerli olanı tut', 'Unnötiges kündigen, Wert behalten'),
        L('Best entertainment mix', 'En iyi eğlence karışımı', 'Beste Entertainment-Mischung'),
        L('Best productivity stack', 'En iyi üretkenlik paketi', 'Bestes Produktivitäts-Setup'),
      ],
    },
  ];
}

function buildPrompt(subs, questions, answers, lang) {
  const quiz = questions
    .map((q, i) => `${i + 1}. ${q.q}\nAnswer: ${q.options[answers[i]] || 'Not answered'}`)
    .join('\n\n');
  return (
    "You are Qor AI's subscription intelligence analyst.\n" +
    `Subscriptions selected: ${subs.join(', ')}.\n\n` +
    `User quiz:\n${quiz}\n\n` +
    'Compare the selected subscriptions using the quiz answers. Do not invent exact live prices; if pricing is mentioned, keep it approximate and tell the user to verify current regional pricing. ' +
    'Analyze each service individually, call out overlap/waste, give keep/cancel/rotate recommendations, and finish with a clear **Qor AI Recommendation**. ' +
    'Use **bold** section headings and "-" bullets. Reply ONLY in the language with ISO code: ' + lang + '.'
  );
}

export default function Subscriptions() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('subs.title')} — Qor AI`, description: t('subs.subtitle'), path: '/subscriptions' });
  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [answers, setAnswers] = useState({});
  const [err, setErr] = useState('');
  const questions = quizQuestions(L);

  function resetAnalysis() {
    setResult('');
    setErr('');
  }

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

  async function runCompare(items, answerMap = answers) {
    setBusy(true);
    setResult('');
    setErr('');
    trackEvent('subscription_compare', { count: items.length });
    try {
      const text = await askQorAi([{ role: 'user', text: buildPrompt(items, questions, answerMap, lang) }]);
      setResult(text);
      saveSubscriptionHistory({ services: items, quiz: answerMap, analysis: text });
    } catch {
      setResult(t('la.errFail'));
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    if (selected.length < 2) return;
    setErr('');
    if (!quizStarted) {
      setQuizStarted(true);
      return;
    }
    if (questions.some((_, i) => answers[i] == null)) {
      setErr(t('subs.quizRequired'));
      return;
    }
    if (!user) {
      localStorage.setItem(PENDING_SUBS_KEY, JSON.stringify({ selected, custom, answers, quizStarted: true, ts: Date.now() }));
      openAuth();
      return;
    }
    await runCompare(selected);
  }

  useEffect(() => {
    if (!user) return;
    const raw = localStorage.getItem(PENDING_SUBS_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_SUBS_KEY);
    try {
      const pending = JSON.parse(raw);
      const items = Array.isArray(pending.selected) ? pending.selected.filter(Boolean) : [];
      const pendingAnswers = pending.answers && typeof pending.answers === 'object' ? pending.answers : {};
      if (items.length < 2) return;
      setSelected(items);
      setCustom(pending.custom || '');
      setAnswers(pendingAnswers);
      setQuizStarted(true);
      runCompare(items, pendingAnswers);
    } catch {
      // Ignore stale pending payloads.
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container subs">
      <div className="subs-head">
        <div className="subs-icon">TV</div>
        <h1>{t('subs.title')}</h1>
        <p>{t('subs.subtitle')}</p>
      </div>

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

      {selected.length >= 2 && (
        <section className="subs-quiz">
          <div className="subs-quiz-head">
            <span>{t('subs.quizTitle')}</span>
            <p>{t('subs.quizDesc')}</p>
          </div>
          {quizStarted && (
            <div className="subs-quiz-list">
              {questions.map((q, i) => (
                <div className="subs-q" key={q.q}>
                  <h3>{i + 1}. {q.q}</h3>
                  <div className="subs-options">
                    {q.options.map((option, idx) => (
                      <button type="button" key={option}
                        className={'subs-option' + (answers[i] === idx ? ' selected' : '')}
                        onClick={() => {
                          setAnswers((a) => ({ ...a, [i]: idx }));
                          setErr('');
                        }}>
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {err && <div className="subs-err">{err}</div>}

      <button className="btn btn-primary btn-lg subs-go"
        onClick={compare} disabled={busy || selected.length < 2}>
        {busy ? t('subs.analyzing') : selected.length < 2
          ? t('subs.goMin') : !quizStarted ? t('subs.startQuiz') : t('subs.go', { n: selected.length })}
      </button>

      {busy && (
        <div className="subs-loading"><div className="spinner" /><span>{t('subs.loading')}</span></div>
      )}

      {result && (
        <div className="subs-result fade-up">
          <div className="subs-result-head">{t('subs.resultHead')}</div>
          <div className="subs-result-body"><AiText text={result} /></div>
        </div>
      )}
    </div>
  );
}
