import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCompare, setCompareList } from '../lib/compare';
import {
  refreshUser, updateProfile, requestVerification, requestAccountDeletion,
} from '../lib/pocketbase';
import { pb, fileUrl } from '../lib/pocketbase';
import { formatQorCoins } from '../lib/qorCoins';
import {
  getComparisons, getSavedAnalyses, getMyReviews, deleteMyReview, getMyLikedArticles,
  readSearchHistory, readQuizHistory,
} from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { profileAnswers, optionLabel, STEPS } from './Quiz.jsx';
import { articlePath } from '../lib/routes';
import { getProduct } from '../lib/typesense';
import { premiumStatus } from '../lib/premium';
import { catMeta } from '../lib/format';
import { productPath } from '../lib/routes';
import { useT } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import AiText from '../components/AiText.jsx';
import './Profile.css';

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export default function Profile() {
  const t = useT();
  const { user, openAuth, logout } = useAuth();
  const { ids } = useCompare();

  useSeo({ title: `${t('nav.profile')} — Qor AI`, noindex: true });
  useEffect(() => { if (user) refreshUser(); }, []); // eslint-disable-line

  if (!user) {
    return (
      <div className="container pf-guest">
        <div className="pf-guest-icon">👤</div>
        <h1>{t('pf.guestTitle')}</h1>
        <p>{t('pf.guestDesc')}</p>
        <button className="btn btn-primary btn-lg" onClick={openAuth}>{t('pf.signInBtn')}</button>
      </div>
    );
  }

  return <ProfileBody user={user} ids={ids} logout={logout} t={t} />;
}

function ProfileBody({ user, ids, logout, t }) {
  const name = user.name || user.displayName || user.email?.split('@')[0] || 'User';
  const [tab, setTab] = useState('overview');

  const TABS = [
    { key: 'overview', label: t('pf.tabOverview') },
    { key: 'comparisons', label: t('pf.tabComparisons') },
    { key: 'analyses', label: t('pf.tabAnalyses') },
    { key: 'reviews', label: t('pf.tabReviews') },
    { key: 'liked', label: t('pf.tabLiked') },
    { key: 'history', label: t('pf.tabHistory') },
  ];

  return (
    <div className="container pf">
      {!user.verified && <VerifyBanner user={user} t={t} />}

      <Identity user={user} name={name} logout={logout} t={t} />

      <div className="pf-tabs">
        {TABS.map((tb) => (
          <button key={tb.key}
            className={'pf-tab' + (tab === tb.key ? ' active' : '')}
            onClick={() => setTab(tb.key)}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview user={user} ids={ids} t={t} />}
      {tab === 'comparisons' && <ComparisonsTab t={t} />}
      {tab === 'analyses' && <AnalysesTab t={t} />}
      {tab === 'reviews' && <ReviewsTab t={t} />}
      {tab === 'liked' && <LikedTab t={t} />}
      {tab === 'history' && <HistoryTab user={user} t={t} />}
    </div>
  );
}

/* ─── Email verification banner ──────────────────────────────────── */
function VerifyBanner({ user, t }) {
  const [state, setState] = useState('');
  async function resend() {
    setState('sending');
    try { await requestVerification(user.email); setState('sent'); }
    catch { setState('error'); }
  }
  return (
    <div className="pf-verify fade-up">
      <span className="pf-verify-ic">✉️</span>
      <div className="pf-verify-tx">
        <strong>{t('pf.verifyTitle')}</strong>
        <span>{t('pf.verifyDesc', { email: user.email })}</span>
      </div>
      {state === 'sent' ? (
        <span className="pf-verify-done">{t('pf.verifySent')}</span>
      ) : (
        <button className="btn btn-ghost" disabled={state === 'sending'} onClick={resend}>
          {state === 'sending' ? '…' : t('pf.verifyResend')}
        </button>
      )}
      {state === 'error' && <span className="pf-verify-err">{t('pf.verifyErr')}</span>}
    </div>
  );
}

/* ─── Identity card with inline name editing ─────────────────────── */
function Identity({ user, name, logout, t }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const joined = user.created
    ? new Date(user.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : '—';

  async function save() {
    const next = draft.trim();
    if (!next || next === name) { setEditing(false); return; }
    setSaving(true);
    try { await updateProfile({ name: next, displayName: next }); setEditing(false); }
    catch { /* keep open */ }
    finally { setSaving(false); }
  }

  return (
    <div className="pf-card pf-id fade-up">
      <div className="pf-avatar">
        {user?.photoURL
          ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          : (name[0]?.toUpperCase() || 'U')}
      </div>
      <div className="pf-id-text">
        {editing ? (
          <div className="pf-name-edit">
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              maxLength={60} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? '…' : t('pf.save')}
            </button>
            <button className="btn btn-ghost" onClick={() => { setDraft(name); setEditing(false); }}>
              {t('pf.cancel')}
            </button>
          </div>
        ) : (
          <h1>
            {name}
            <button className="pf-edit-btn" onClick={() => { setDraft(name); setEditing(true); }}
              aria-label={t('pf.editName')} title={t('pf.editName')}>✏️</button>
            {user.verified && <span className="pf-verified" title={t('pf.verified')}>✓</span>}
          </h1>
        )}
        <span>{user.email}</span>
        <small>{t('pf.member', { date: joined })}</small>
      </div>
      <button className="btn btn-ghost pf-signout" onClick={logout}>{t('pf.signOut')}</button>
    </div>
  );
}

/* ─── Overview tab ───────────────────────────────────────────────── */
function Overview({ user, ids, t }) {
  const coins = formatQorCoins(user.bonusQCoins, user.language || 'en');
  const prem = premiumStatus(user);
  const premUntil = prem.expiresAt
    ? new Date(prem.expiresAt).toLocaleDateString()
    : '';
  return (
    <div className="fade-up">
      <div className={'pf-card pf-membership' + (prem.isPremium ? ' is-premium' : '')}>
        <div className="pf-mem-badge">{prem.isPremium ? '✦' : 'Q'}</div>
        <div className="pf-mem-text">
          <strong>{prem.isPremium ? t('pf.memberPremium') : t('pf.memberFree')}</strong>
          <span>
            {prem.isPremium
              ? (premUntil ? t('pf.premiumUntil', { date: premUntil }) : t('pf.premiumActive'))
              : t('pf.premiumApp')}
          </span>
        </div>
        {!prem.isPremium && <Link to="/premium" className="btn btn-primary pf-mem-cta">{t('nav.premium')}</Link>}
      </div>

      <div className="pf-grid">
        <div className="pf-card pf-coins">
          <div className="pf-coin-badge"><span className="coin-dot">Q</span></div>
          <div>
            <div className="pf-coin-num">{coins}</div>
            <div className="pf-coin-lbl">{t('pf.coinBalance')}</div>
          </div>
          <p>{t('pf.coinDesc')}</p>
        </div>
        <div className="pf-card pf-stat">
          <div className="pf-stat-num">{ids.length}</div>
          <div className="pf-stat-lbl">{t('pf.compareCount')}</div>
          <Link to="/compare" className="btn btn-ghost">{t('pf.openList')}</Link>
        </div>
      </div>

      <ProfileSignals user={user} />

      <div className="pf-card pf-links">
        <h3>{t('pf.quickAccess')}</h3>
        <div className="pf-link-row">
          <Link to="/">📦 {t('nav.home')}</Link>
          <Link to="/compare">⚖️ {t('nav.compare')}</Link>
          <Link to="/privacy">🔒 {t('footer.privacy')}</Link>
          <Link to="/terms">📄 {t('footer.terms')}</Link>
        </div>
      </div>

      <DangerZone user={user} t={t} />
    </div>
  );
}

/* ─── Profile signals (app parity: ecosystem/budget/interests/…) ──── */
function ProfileSignals({ user }) {
  const { lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const v = profileAnswers(user);
  const stepFor = (field) => STEPS.find((s) => s.field === field);
  const lbl = (field, val) => {
    const s = stepFor(field);
    return s ? optionLabel(s, val, lang) : String(val).replace(/[_-]+/g, ' ');
  };

  const facts = [
    v.ecosystem && { k: L('Ecosystem', 'Ekosistem', 'Ökosystem'), val: lbl('ecosystem', v.ecosystem) },
    v.budgetRange && { k: L('Budget', 'Bütçe', 'Budget'), val: lbl('budgetRange', v.budgetRange) },
    v.ageRange && { k: L('Age', 'Yaş', 'Alter'), val: String(v.ageRange) },
    v.profession && { k: L('Profession', 'Meslek', 'Beruf'), val: lbl('profession', v.profession) },
    v.usageIntent && { k: L('Usage', 'Kullanım', 'Nutzung'), val: lbl('usageIntent', v.usageIntent) },
    user.country && { k: L('Country', 'Ülke', 'Land'), val: String(user.country).toUpperCase() },
  ].filter(Boolean);

  const groups = [
    { title: L('Interest categories', 'İlgi Kategorileri', 'Interessen'), vals: v.interestCategories.map((x) => lbl('interestCategories', x)) },
    { title: L('Decision priorities', 'Karar Öncelikleri', 'Prioritäten'), vals: v.priorities.map((x) => lbl('priorities', x)) },
    { title: L('Current devices', 'Mevcut Cihazlar', 'Geräte'), vals: v.currentDevices.map((x) => lbl('currentDevices', x)) },
    { title: L('Subscriptions', 'Abonelikler', 'Abos'), vals: v.subscriptions.filter((x) => x && x !== 'none').map((x) => lbl('subscriptions', x)) },
  ].filter((g) => g.vals.length);

  if (!facts.length && !groups.length) {
    return (
      <div className="pf-card pf-signals">
        <h3>{L('Your profile', 'Profilin', 'Dein Profil')}</h3>
        <p className="pf-signals-empty">{L(
          'Complete the quick quiz so Qor AI can personalise recommendations and analyses.',
          'Qor AI önerileri ve analizleri kişiselleştirebilmesi için hızlı quizi çöz.',
          'Mach den kurzen Quiz, damit Qor AI Empfehlungen personalisieren kann.',
        )}</p>
        <Link to="/quiz" className="btn btn-primary">{L('Take the quiz', 'Quizi çöz', 'Quiz starten')}</Link>
      </div>
    );
  }

  return (
    <div className="pf-card pf-signals">
      <div className="pf-signals-head">
        <h3>{L('Your profile', 'Profilin', 'Dein Profil')}</h3>
        <Link to="/quiz" className="pf-signals-edit">✏️ {L('Edit', 'Düzenle', 'Bearbeiten')}</Link>
      </div>
      {facts.length > 0 && (
        <div className="pf-sig-facts">
          {facts.map((f) => (
            <span key={f.k} className="pf-sig-fact"><b>{f.k}</b> {f.val}</span>
          ))}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.title} className="pf-sig-group">
          <span className="pf-sig-group-title">{g.title}</span>
          <div className="pf-sig-chips">{g.vals.map((x, i) => <span key={i}>{x}</span>)}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Danger zone — account deletion ─────────────────────────────── */
function DangerZone({ user, t }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('');
  async function confirm() {
    setState('sending');
    try { await requestAccountDeletion(); setState('sent'); }
    catch { setState('error'); }
  }
  return (
    <div className="pf-card pf-danger">
      <h3>{t('pf.dangerTitle')}</h3>
      {state === 'sent' ? (
        <p className="pf-danger-sent">{t('pf.deleteSent', { email: user.email })}</p>
      ) : !open ? (
        <>
          <p>{t('pf.deleteDesc')}</p>
          <button className="btn pf-danger-btn" onClick={() => setOpen(true)}>
            {t('pf.deleteAccount')}
          </button>
        </>
      ) : (
        <>
          <p className="pf-danger-warn">{t('pf.deleteConfirm')}</p>
          <div className="pf-danger-actions">
            <button className="btn pf-danger-btn" disabled={state === 'sending'} onClick={confirm}>
              {state === 'sending' ? '…' : t('pf.deleteYes')}
            </button>
            <button className="btn btn-ghost" onClick={() => { setOpen(false); setState(''); }}>
              {t('pf.cancel')}
            </button>
          </div>
          {state === 'error' && <p className="pf-danger-err">{t('pf.deleteErr')}</p>}
        </>
      )}
    </div>
  );
}

/* ─── Shared empty / loading states ──────────────────────────────── */
function Loading({ t }) {
  return <div className="pf-list-state"><div className="spinner" /> {t('common.loading')}</div>;
}
function Empty({ icon, text }) {
  return <div className="pf-empty"><div className="pf-empty-ic">{icon}</div><p>{text}</p></div>;
}

/* ─── Comparisons tab ────────────────────────────────────────────── */
function ComparisonsTab({ t }) {
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  useEffect(() => { getComparisons().then(setItems); }, []);

  if (items === null) return <Loading t={t} />;
  if (!items.length) return <Empty icon="⚖️" text={t('pf.noComparisons')} />;

  function open(c) {
    setCompareList(c.productIds);
    nav('/compare');
  }
  return (
    <div className="pf-list fade-up">
      {items.map((c) => (
        <button key={c.id} className="pf-row" onClick={() => open(c)}>
          <span className="pf-row-ic">⚖️</span>
          <span className="pf-row-main">
            <b>{c.title}</b>
            <small>
              {c.category && `${catMeta(c.category).label} · `}
              {t('pf.cmpProducts', { n: c.productIds.length })}
              {fmtDate(c.at) && ` · ${fmtDate(c.at)}`}
            </small>
          </span>
          <span className="pf-row-go">{t('pf.open')} →</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Analyses tab ───────────────────────────────────────────────── */
function AnalysesTab({ t }) {
  const [items, setItems] = useState(null);
  const [expanded, setExpanded] = useState(null);
  useEffect(() => { getSavedAnalyses().then(setItems); }, []);

  if (items === null) return <Loading t={t} />;
  if (!items.length) return <Empty icon="🔗" text={t('pf.noAnalyses')} />;

  return (
    <div className="pf-list fade-up">
      {items.map((a) => {
        const isOpen = expanded === a.id;
        return (
          <div key={a.id} className={'pf-acard' + (isOpen ? ' open' : '')}>
            <button className="pf-row" onClick={() => setExpanded(isOpen ? null : a.id)}>
              <span className="pf-row-ic">{a.kind === 'subscription' ? '📺' : a.kind === 'product' ? '📦' : '🔗'}</span>
              <span className="pf-row-main">
                <b>{a.title || t('pf.untitledAnalysis')}</b>
                <small>
                  {t(a.kind === 'subscription'
                    ? 'pf.kindSubscription'
                    : a.kind === 'product'
                      ? 'pf.kindProduct'
                      : 'pf.kindLink')}
                  {fmtDate(a.at) && ` · ${fmtDate(a.at)}`}
                </small>
              </span>
              <span className="pf-row-go">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && a.analysis && (
              <div className="pf-acard-body"><AiText text={a.analysis} /></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Reviews tab ────────────────────────────────────────────────── */
function ReviewsTab({ t }) {
  const [items, setItems] = useState(null);
  const [names, setNames] = useState({});

  useEffect(() => {
    getMyReviews().then(async (revs) => {
      setItems(revs);
      const map = {};
      await Promise.all(revs.map(async (r) => {
        if (!r.productId) return;
        try {
          if (r.productId.startsWith('blog:')) {
            const s = r.productId.slice(5);
            const a = await pb.collection('articles').getFirstListItem(`slug="${s.replace(/"/g, '\\"')}"`, { $autoCancel: false });
            if (a) map[r.productId] = a.title_tr || a.title_en || a.title_de || s;
          } else {
            const p = await getProduct(r.productId);
            if (p) map[r.productId] = p.name;
          }
        } catch { /* noop */ }
      }));
      setNames(map);
    });
  }, []);

  const reviewLink = (productId) => (productId.startsWith('blog:') ? `/blog/${productId.slice(5)}` : productPath(productId));

  async function remove(id) {
    setItems((list) => list.filter((r) => r.id !== id));
    try { await deleteMyReview(id); } catch { /* noop */ }
  }

  if (items === null) return <Loading t={t} />;
  if (!items.length) return <Empty icon="⭐" text={t('pf.noReviews')} />;

  return (
    <div className="pf-list fade-up">
      {items.map((r) => (
        <div key={r.id} className="pf-rev">
          <div className="pf-rev-top">
            <span className="pf-stars">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={i <= r.rating ? 'on' : ''}>★</span>
              ))}
            </span>
            <span className="pf-rev-date">{fmtDate(r.created)}</span>
            <button className="pf-rev-del" onClick={() => remove(r.id)}
              aria-label={t('pf.delete')} title={t('pf.delete')}>🗑</button>
          </div>
          {r.text && <p className="pf-rev-text">{r.text}</p>}
          {r.productId && (
            <Link to={reviewLink(r.productId)} className="pf-rev-link">
              {names[r.productId] || (r.productId.startsWith('blog:') ? t('pf.viewArticle') : t('pf.viewProduct'))} →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Liked articles tab ─────────────────────────────────────────── */
function LikedTab({ t }) {
  const { lang } = useI18n();
  const [items, setItems] = useState(null);
  const pick = (a, f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
  const coverOf = (a) => { const p0 = (Array.isArray(a.products) ? a.products : [])[0] || {}; return a.cover || (a.coverFile ? fileUrl(a, a.coverFile) : (p0.image || p0.imageUrl || '')); };

  useEffect(() => { getMyLikedArticles().then(setItems); }, []);

  if (items === null) return <Loading t={t} />;
  if (!items.length) return <Empty icon="❤" text={t('pf.noLiked')} />;

  return (
    <div className="pf-list fade-up">
      {items.map((a) => (
        <Link key={a.id} to={articlePath(a, lang)} className="pf-liked">
          {coverOf(a) ? <img className="pf-liked-img" src={coverOf(a)} alt={pick(a, 'title')} loading="lazy" /> : null}
          <span className="pf-liked-title">{pick(a, 'title')}</span>
          <span className="pf-liked-go">→</span>
        </Link>
      ))}
    </div>
  );
}

/* ─── History tab — search + quiz ────────────────────────────────── */
function HistoryTab({ user, t }) {
  const search = readSearchHistory(user);
  const quiz = readQuizHistory(user);
  const [openQuiz, setOpenQuiz] = useState(null);

  if (!search.length && !quiz.length) {
    return <Empty icon="🕘" text={t('pf.noHistory')} />;
  }
  return (
    <div className="fade-up">
      {search.length > 0 && (
        <div className="pf-card pf-hist">
          <h3>🔍 {t('pf.searchHistory')}</h3>
          <div className="pf-chips">
            {search.slice(0, 30).map((s, i) => (
              s.productId ? (
                <Link key={i} to={productPath(s.productId)} className="pf-chip">{s.query}</Link>
              ) : (
                <Link key={i} to={`/?q=${encodeURIComponent(s.query || '')}`} className="pf-chip">
                  {s.query}
                </Link>
              )
            ))}
          </div>
        </div>
      )}
      {quiz.length > 0 && (
        <div className="pf-card pf-hist">
          <h3>🎯 {t('pf.quizHistory')}</h3>
          <div className="pf-list">
            {quiz.slice(0, 20).map((q, i) => {
              const isOpen = openQuiz === i;
              return (
                <div key={i} className={'pf-acard' + (isOpen ? ' open' : '')}>
                  <button className="pf-row" onClick={() => setOpenQuiz(isOpen ? null : i)}>
                    <span className="pf-row-ic">🎯</span>
                    <span className="pf-row-main">
                      <b>{t('pf.quizEntry', { n: i + 1 })}</b>
                      <small>{fmtDate(q.timestamp)}</small>
                    </span>
                    <span className="pf-row-go">{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (q.result || q.recommendation) && (
                    <div className="pf-acard-body">
                      <AiText text={q.result || q.recommendation} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
