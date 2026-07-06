import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { setCompareList } from '../lib/compare';
import {
  refreshUser, updateProfile, requestVerification, requestAccountDeletion,
} from '../lib/pocketbase';
import { pb, fileUrl } from '../lib/pocketbase';
import { formatQorCoins } from '../lib/qorCoins';
import {
  getComparisons, getMyReviews, deleteMyReview, getMyLikedArticles,
  getMyFavoriteProducts,
} from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { articlePath } from '../lib/routes';
import { getProduct } from '../lib/typesense';
import ProductImg from '../components/ProductImg.jsx';
import { premiumStatus } from '../lib/premium';
import { catMeta } from '../lib/format';
import { productPath } from '../lib/routes';
import { displayProductName } from '../lib/productNames';
import { useT } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import './Profile.css';

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export default function Profile() {
  const t = useT();
  const { user, openAuth, logout } = useAuth();

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

  return <ProfileBody user={user} logout={logout} t={t} />;
}

function ProfileBody({ user, logout, t }) {
  const name = user.name || user.displayName || user.email?.split('@')[0] || 'User';
  const [tab, setTab] = useState('overview');

  const TABS = [
    { key: 'overview', label: t('pf.tabOverview') },
    { key: 'comparisons', label: t('pf.tabComparisons') },
    { key: 'reviews', label: t('pf.tabReviews') },
    { key: 'liked', label: t('pf.tabLiked') },
    { key: 'account', label: t('pf.tabAccount') },
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

      {tab === 'overview' && <Overview user={user} t={t} />}
      {tab === 'comparisons' && <ComparisonsTab t={t} />}
      {tab === 'reviews' && <ReviewsTab t={t} />}
      {tab === 'liked' && <LikedTab t={t} />}
      {tab === 'account' && <AccountTab user={user} t={t} />}
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
// Premium users see ONE consolidated premium card (badge + until-date + the
// "unlimited AI, never spends Qor Coins" perk) — Premium is stated once, not
// spread across a membership card AND a coin card. Free users keep two distinct
// cards: the Premium upsell + their finite Qor Coin balance.
// Account deletion lives in its own "Hesap" tab; the old compare-count stat and
// "Profilin" quiz card were removed (quiz is set once at onboarding).
function Overview({ user, t }) {
  const prem = premiumStatus(user);
  const premUntil = prem.expiresAt
    ? new Date(prem.expiresAt).toLocaleDateString()
    : '';

  if (prem.isPremium) {
    return (
      <div className="fade-up">
        <div className="pf-card pf-premium">
          <div className="pf-premium-top">
            <div className="pf-premium-badge">✦</div>
            <div className="pf-premium-text">
              <strong>{t('pf.memberPremium')}</strong>
              <span>{premUntil ? t('pf.premiumUntil', { date: premUntil }) : t('pf.premiumActive')}</span>
            </div>
            <span className="pf-premium-inf" aria-hidden="true">∞</span>
          </div>
          <div className="pf-premium-perk">
            <span className="pf-premium-perk-tag">{t('pf.coinUnlimited')}</span>
            <span className="pf-premium-perk-txt">{t('pf.coinPremiumDesc')}</span>
          </div>
        </div>
      </div>
    );
  }

  const coins = formatQorCoins(user.bonusQCoins, user.language || 'en');
  return (
    <div className="fade-up">
      <div className="pf-card pf-membership">
        <div className="pf-mem-badge">Q</div>
        <div className="pf-mem-text">
          <strong>{t('pf.memberFree')}</strong>
          <span>{t('pf.premiumApp')}</span>
        </div>
        <Link to="/premium" className="btn pf-mem-cta">{t('nav.premium')}</Link>
      </div>

      <div className="pf-card pf-coins">
        <div className="pf-coin-badge"><span className="coin-dot">Q</span></div>
        <div>
          <div className="pf-coin-num">{coins}</div>
          <div className="pf-coin-lbl">{t('pf.coinBalance')}</div>
        </div>
        <p>{t('pf.coinDesc')}</p>
      </div>
    </div>
  );
}

/* ─── Account tab — sign-out + account deletion ──────────────────── */
function AccountTab({ user, t }) {
  return (
    <div className="fade-up">
      <DangerZone user={user} t={t} />
    </div>
  );
}

/* ─── Danger zone — account deletion ─────────────────────────────── */
function DangerZone({ user, t }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('');
  const [errMsg, setErrMsg] = useState('');
  async function confirm() {
    setState('sending');
    setErrMsg('');
    try { await requestAccountDeletion(); setState('sent'); }
    catch (e) {
      setErrMsg(e?.response?.message || e?.data?.message || e?.message || '');
      setState('error');
    }
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
          {state === 'error' && <p className="pf-danger-err">{t('pf.deleteErr')}{errMsg ? ` (${errMsg})` : ''}</p>}
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

/* ─── Reviews tab ────────────────────────────────────────────────── */
// Every review the user left — product reviews, blog reviews AND comparison
// reviews — merged from the same PB collections the app writes (`reviews` +
// `comparison_reviews`), so it stays in sync with the phone.
function ReviewsTab({ t }) {
  const { lang } = useI18n();
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const [names, setNames] = useState({});

  useEffect(() => {
    getMyReviews().then(async (revs) => {
      setItems(revs);
      // Resolve display names for every referenced product / article once.
      const productIds = new Set();
      const blogIds = new Set();
      revs.forEach((r) => {
        if (r.kind === 'blog' && r.productId) blogIds.add(r.productId);
        else if (r.kind === 'product' && r.productId) productIds.add(r.productId);
        (r.productIds || []).forEach((id) => productIds.add(id));
      });
      const map = {};
      await Promise.all([
        ...[...productIds].map(async (id) => {
          try { const p = await getProduct(id); if (p) map[id] = displayProductName(p, lang) || p.name; } catch { /* noop */ }
        }),
        ...[...blogIds].map(async (bid) => {
          try {
            const s = bid.slice(5);
            const a = await pb.collection('articles').getFirstListItem(`slug="${s.replace(/"/g, '\\"')}"`, { $autoCancel: false });
            if (a) map[bid] = a[`title_${lang}`] || a.title_tr || a.title_en || a.title_de || s;
          } catch { /* noop */ }
        }),
      ]);
      setNames(map);
    });
  }, [lang]);

  async function remove(item) {
    setItems((list) => list.filter((r) => r.id !== item.id));
    try { await deleteMyReview(item); } catch { /* noop */ }
  }

  function openComparison(ids, revId) {
    if (!ids || ids.length < 2) return;
    setCompareList(ids);
    // #rev-<id> lets CompareReviews scroll straight to this exact comment once
    // the compared products (and their shared review thread) have loaded.
    nav(`/compare#rev-${revId}`);
  }

  if (items === null) return <Loading t={t} />;
  if (!items.length) return <Empty icon="⭐" text={t('pf.noReviews')} />;

  const cmpLabel = (r) => {
    const parts = (r.productIds || []).map((id) => names[id]).filter(Boolean);
    return parts.length ? parts.join(' vs ') : t('pf.viewComparison');
  };

  return (
    <div className="pf-list fade-up">
      {items.map((r) => (
        <div key={r.id} className="pf-rev">
          <div className="pf-rev-top">
            {r.rating > 0 && (
              <span className="pf-stars">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={i <= r.rating ? 'on' : ''}>★</span>
                ))}
              </span>
            )}
            <span className="pf-rev-kind">
              {r.kind === 'comparison' ? `⚖️ ${t('pf.kindComparison')}` : r.kind === 'blog' ? '📝' : '📦'}
            </span>
            <span className="pf-rev-date">{fmtDate(r.created)}</span>
            <button className="pf-rev-del" onClick={() => remove(r)}
              aria-label={t('pf.delete')} title={t('pf.delete')}>🗑</button>
          </div>
          {r.text && <p className="pf-rev-text">{r.text}</p>}
          {r.kind === 'comparison' ? (
            <button type="button" className="pf-rev-link pf-rev-link-btn" onClick={() => openComparison(r.productIds, r.id)}>
              {cmpLabel(r)} →
            </button>
          ) : r.productId ? (
            <Link
              to={(r.kind === 'blog' ? `/blog/${r.productId.slice(5)}` : productPath(r.productId)) + `#rev-${r.id}`}
              className="pf-rev-link"
            >
              {names[r.productId] || (r.kind === 'blog' ? t('pf.viewArticle') : t('pf.viewProduct'))} →
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ─── Liked tab — favourited products + liked articles ───────────── */
// "Beğendiklerim" now shows BOTH the products the user hearted (favorites id
// array on the user record, shared with the app) and the blog articles they
// liked — previously only articles appeared.
function LikedTab({ t }) {
  const { lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [products, setProducts] = useState(null);
  const [articles, setArticles] = useState(null);
  const pick = (a, f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
  const coverOf = (a) => { const p0 = (Array.isArray(a.products) ? a.products : [])[0] || {}; return a.cover || (a.coverFile ? fileUrl(a, a.coverFile) : (p0.image || p0.imageUrl || '')); };

  useEffect(() => {
    getMyFavoriteProducts().then(setProducts);
    getMyLikedArticles().then(setArticles);
  }, []);

  if (products === null || articles === null) return <Loading t={t} />;
  if (!products.length && !articles.length) return <Empty icon="❤" text={t('pf.noLiked')} />;

  return (
    <div className="fade-up">
      {products.length > 0 && (
        <div className="pf-liked-section">
          <h3 className="pf-liked-head">❤ {L('Products', 'Ürünler', 'Produkte')}</h3>
          <div className="pf-list">
            {products.map((p) => (
              <Link key={p.id} to={productPath(p)} className="pf-liked">
                {p.imageUrl ? <ProductImg src={p.imageUrl} alt={displayProductName(p, lang)} size="thumb" className="pf-liked-img" /> : null}
                <span className="pf-liked-title">{displayProductName(p, lang) || p.name}</span>
                <span className="pf-liked-go">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {articles.length > 0 && (
        <div className="pf-liked-section">
          <h3 className="pf-liked-head">📝 {L('Articles', 'Yazılar', 'Artikel')}</h3>
          <div className="pf-list">
            {articles.map((a) => (
              <Link key={a.id} to={articlePath(a, lang)} className="pf-liked">
                {coverOf(a) ? <img className="pf-liked-img" src={coverOf(a)} alt={pick(a, 'title')} loading="lazy" /> : null}
                <span className="pf-liked-title">{pick(a, 'title')}</span>
                <span className="pf-liked-go">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
