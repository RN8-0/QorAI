import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscriptionAnalysis, subscriptionsMixCategories } from '../lib/linkAnalysis';
import { trackEvent } from '../lib/analytics';
import { saveSubscriptionHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import { aiUserProfile, hasCompletedQuiz } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import AiText from '../components/AiText.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import SubLogo from '../components/SubLogo.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import { useSeo } from '../lib/seo';
import './Subscriptions.css';

// Grouped like the app's subscriptions screen — one category per comparison.
const PRESET_GROUPS = [
  { id: 'video', label: { en: 'Video', tr: 'Video', de: 'Video' }, icon: '🎬', items: ['Netflix', 'Disney+', 'Amazon Prime', 'Apple TV+', 'HBO Max', 'BluTV', 'Exxen', 'Gain', 'MUBI', 'YouTube Premium', 'Crunchyroll', 'beIN Sports', 'TOD'] },
  { id: 'music', label: { en: 'Music', tr: 'Müzik', de: 'Musik' }, icon: '🎧', items: ['Spotify', 'Apple Music', 'YouTube Music', 'Tidal', 'Deezer'] },
  { id: 'ai', label: { en: 'AI', tr: 'Yapay Zekâ', de: 'KI' }, icon: '🤖', items: ['ChatGPT Plus', 'Claude Pro', 'Gemini Advanced', 'Perplexity', 'Microsoft Copilot', 'Midjourney'] },
  { id: 'cloud', label: { en: 'Cloud & Productivity', tr: 'Bulut & Verimlilik', de: 'Cloud & Produktivität' }, icon: '☁️', items: ['Microsoft 365', 'Google One', 'iCloud+', 'Dropbox', 'Notion', 'Canva'] },
  { id: 'gaming', label: { en: 'Gaming', tr: 'Oyun', de: 'Gaming' }, icon: '🎮', items: ['Xbox Game Pass', 'PlayStation Plus', 'Nintendo Switch Online', 'GeForce Now', 'EA Play'] },
];
const PRESETS = PRESET_GROUPS.flatMap((g) => g.items);
const PENDING_SUBS_KEY = 'qor.pendingSubscriptionAnalysis';

function ServiceCard({ s, isWinner, L }) {
  const score = Math.round(s.score || 0);
  return (
    <div className={'subs-svc' + (isWinner ? ' winner' : '')}>
      {isWinner && <span className="subs-svc-win">★ {L('Best fit', 'En uygun', 'Beste Wahl')}</span>}
      <div className="subs-svc-top">
        <SubLogo name={s.name} size={46} radius={12} />
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
  const [group, setGroup] = useState('video');
  const [custom, setCustom] = useState('');
  // phase: select | analyzing | result | history
  const [phase, setPhase] = useState('select');
  const [result, setResult] = useState(null);
  const [histEntry, setHistEntry] = useState(null);
  const [histRefresh, setHistRefresh] = useState(0);
  const [err, setErr] = useState('');

  function resetAnalysis() { setPhase('select'); setResult(null); setHistEntry(null); setErr(''); }
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

  // Step 1: validate access, then run the app-matching subscription analysis.
  async function startAnalysis(items = selected) {
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
    try {
      const access = await requireAiAccess('subscription_analysis', { onMessage: setErr });
      if (!access.ok) { setPhase('select'); return; }
      await runAnalysis(items, [], 'select');
    } catch {
      setErr(t('la.errFail'));
      setPhase('select');
    }
  }

  // Step 2: structured subscription analysis (scores / winner / recommendation).
  async function runAnalysis(items, answers, failPhase = 'select') {
    setPhase('analyzing');
    trackEvent('subscription_compare', { count: items.length });
    try {
      const data = await subscriptionAnalysis({ subscriptionNames: items, answers, language: lang, userProfile: aiUserProfile(user) });
      setResult(data);
      setPhase('result');
      await saveSubscriptionHistory({ services: items, quiz: answers, analysis: data.recommendation, scores: data.scores, result: data });
      setHistRefresh((n) => n + 1);
    } catch {
      setErr(t('la.errFail'));
      setPhase(failPhase);
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
      startAnalysis(items);
    } catch { /* ignore stale pending payloads */ }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const showPicker = phase === 'select';
  const winnerName = result?.winner?.best || result?.winner?.overall || '';

  return (
    <div className={'container subs' + (showPicker ? ' is-empty' : '')}>
      <div className="subs-head">
        <div className="subs-titlebar">
          <div className="subs-icon" aria-hidden="true">
            <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="13" rx="2" />
              <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
              <path d="M10 12l4 2.5-4 2.5z" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <div>
            <h1>{t('subs.title')}</h1>
            <p>{t('subs.subtitle')}</p>
          </div>
        </div>
        <div className="subs-mini-stats" aria-label="Subscription selection state">
          <span>{selected.length}/4</span>
          <span>{(PRESET_GROUPS.find((g) => g.id === group) || PRESET_GROUPS[0]).label[lang] || PRESET_GROUPS[0].label.en}</span>
        </div>
      </div>

      {showPicker && (
        <div className="subs-workbench">
          <section className="subs-picker-panel">
            <div className="subs-cats" role="tablist">
              {PRESET_GROUPS.map((g) => (
                <button key={g.id} type="button" role="tab"
                  className={'subs-cat' + (group === g.id ? ' active' : '')}
                  onClick={() => setGroup(g.id)}>
                  <span aria-hidden="true">{g.icon}</span> {g.label[lang] || g.label.en}
                </button>
              ))}
            </div>
            <div className="subs-pills">
              {(PRESET_GROUPS.find((g) => g.id === group) || PRESET_GROUPS[0]).items.map((name) => (
                <button key={name}
                  className={'subs-pill subs-pill-logo' + (selected.includes(name) ? ' active' : '')}
                  onClick={() => toggle(name)}>
                  <SubLogo name={name} size={24} radius={7} />
                  <span>{name}</span>
                  <i>{selected.includes(name) ? '✓' : '+'}</i>
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
                    <SubLogo name={s} size={22} radius={6} />
                    {s}<button onClick={() => toggle(s)} aria-label="Remove">×</button>
                  </span>
                ))}
              </div>
            )}

            {err && <div className="subs-err">{err}</div>}

            <button className="btn btn-primary btn-lg subs-go"
              onClick={() => startAnalysis()} disabled={selected.length < 1}>
              {selected.length < 1 ? t('subs.goMin') : t('la.analyze')}
            </button>
          </section>

          {user && <HistoryPanel kind="subscription" lang={lang} refreshToken={histRefresh}
            onOpen={(it) => {
              if (it.result && Array.isArray(it.result.services)) {
                setSelected(it.services.length ? it.services : it.result.services.map((s) => s.name).filter(Boolean));
                setResult(it.result);
                setHistEntry(null);
                setPhase('result');
              } else {
                setHistEntry(it);
                setPhase('history');
              }
            }} />}
        </div>
      )}

      {phase === 'history' && histEntry && (
        <div className="subs-result fade-up">
          <div className="subs-hist-meta">
            <div className="subs-quiz-for">
              {histEntry.services.map((s) => (
                <span key={s} className="subs-chip subs-chip-static">
                  <SubLogo name={s} size={22} radius={6} />{s}
                </span>
              ))}
            </div>
          </div>
          {Object.keys(histEntry.scores || {}).length > 0 && (
            <div className="subs-hist-scores">
              {Object.entries(histEntry.scores).map(([name, sc]) => (
                <div className="subs-svc-factor" key={name}>
                  <span><SubLogo name={name} size={20} radius={6} /> {name} — <b style={{ color: techColor(Number(sc) || 0) }}>{Math.round(Number(sc) || 0)}</b></span>
                  <div className="subs-svc-fbar"><i style={{ width: `${Math.max(4, Math.min(100, Number(sc) || 0))}%`, background: techColor(Number(sc) || 0) }} /></div>
                </div>
              ))}
            </div>
          )}
          {histEntry.analysis && (
            <div className="subs-reco">
              <div className="subs-reco-head">✨ {t('subs.resultHead')}</div>
              <div className="subs-reco-body"><AiText text={histEntry.analysis} /></div>
            </div>
          )}
          <div className="subs-again">
            <button type="button" className="btn btn-ghost" onClick={resetAnalysis}>
              ← {L('Back', 'Geri', 'Zurück')}
            </button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="subs-loading"><div className="spinner" /><span>
          {t('subs.loading')}
        </span></div>
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
