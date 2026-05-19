import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCompare } from '../lib/compare';
import {
  refreshUser, updateProfile, requestVerification, requestAccountDeletion,
} from '../lib/pocketbase';
import { useT } from '../i18n/index.jsx';
import './Profile.css';

export default function Profile() {
  const t = useT();
  const { user, openAuth, logout } = useAuth();
  const { ids } = useCompare();

  // Pull a fresh copy on mount so the coin balance / verified flag are current.
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
  const coins = Math.round(Number(user.bonusQCoins) || 0);
  const joined = user.created
    ? new Date(user.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : '—';

  // ── Name editing ───────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [savingName, setSavingName] = useState(false);

  async function saveName() {
    const next = draft.trim();
    if (!next || next === name) { setEditing(false); return; }
    setSavingName(true);
    try {
      await updateProfile({ name: next, displayName: next });
      setEditing(false);
    } catch { /* keep editing open on failure */ }
    finally { setSavingName(false); }
  }

  // ── Email verification ─────────────────────────────────────────
  const [verifyState, setVerifyState] = useState(''); // '' | 'sending' | 'sent' | 'error'
  async function resendVerification() {
    setVerifyState('sending');
    try {
      await requestVerification(user.email);
      setVerifyState('sent');
    } catch {
      setVerifyState('error');
    }
  }

  // ── Account deletion ───────────────────────────────────────────
  const [delOpen, setDelOpen] = useState(false);
  const [delState, setDelState] = useState(''); // '' | 'sending' | 'sent' | 'error'
  async function confirmDelete() {
    setDelState('sending');
    try {
      await requestAccountDeletion();
      setDelState('sent');
    } catch {
      setDelState('error');
    }
  }

  return (
    <div className="container pf">
      {/* EMAIL VERIFICATION BANNER */}
      {!user.verified && (
        <div className="pf-verify fade-up">
          <span className="pf-verify-ic">✉️</span>
          <div className="pf-verify-tx">
            <strong>{t('pf.verifyTitle')}</strong>
            <span>{t('pf.verifyDesc', { email: user.email })}</span>
          </div>
          {verifyState === 'sent' ? (
            <span className="pf-verify-done">{t('pf.verifySent')}</span>
          ) : (
            <button className="btn btn-ghost" disabled={verifyState === 'sending'}
              onClick={resendVerification}>
              {verifyState === 'sending' ? '…' : t('pf.verifyResend')}
            </button>
          )}
          {verifyState === 'error' && <span className="pf-verify-err">{t('pf.verifyErr')}</span>}
        </div>
      )}

      {/* IDENTITY */}
      <div className="pf-card pf-id fade-up">
        <div className="pf-avatar">{name[0]?.toUpperCase() || 'U'}</div>
        <div className="pf-id-text">
          {editing ? (
            <div className="pf-name-edit">
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                maxLength={60} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} />
              <button className="btn btn-primary" disabled={savingName} onClick={saveName}>
                {savingName ? '…' : t('pf.save')}
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

      <div className="pf-grid">
        <div className="pf-card pf-coins fade-up">
          <div className="pf-coin-badge"><span className="coin-dot">Q</span></div>
          <div>
            <div className="pf-coin-num">{coins}</div>
            <div className="pf-coin-lbl">{t('pf.coinBalance')}</div>
          </div>
          <p>{t('pf.coinDesc')}</p>
        </div>

        <div className="pf-card pf-stat fade-up">
          <div className="pf-stat-num">{ids.length}</div>
          <div className="pf-stat-lbl">{t('pf.compareCount')}</div>
          <Link to="/compare" className="btn btn-ghost">{t('pf.openList')}</Link>
        </div>
      </div>

      <div className="pf-card pf-links fade-up">
        <h3>{t('pf.quickAccess')}</h3>
        <div className="pf-link-row">
          <Link to="/">📦 {t('nav.home')}</Link>
          <Link to="/compare">⚖️ {t('nav.compare')}</Link>
          <a href="/privacy.html">🔒 {t('footer.privacy')}</a>
          <a href="/terms.html">📄 {t('footer.terms')}</a>
        </div>
      </div>

      {/* DANGER ZONE — account deletion */}
      <div className="pf-card pf-danger fade-up">
        <h3>{t('pf.dangerTitle')}</h3>
        {delState === 'sent' ? (
          <p className="pf-danger-sent">{t('pf.deleteSent', { email: user.email })}</p>
        ) : !delOpen ? (
          <>
            <p>{t('pf.deleteDesc')}</p>
            <button className="btn pf-danger-btn" onClick={() => setDelOpen(true)}>
              {t('pf.deleteAccount')}
            </button>
          </>
        ) : (
          <>
            <p className="pf-danger-warn">{t('pf.deleteConfirm')}</p>
            <div className="pf-danger-actions">
              <button className="btn pf-danger-btn" disabled={delState === 'sending'}
                onClick={confirmDelete}>
                {delState === 'sending' ? '…' : t('pf.deleteYes')}
              </button>
              <button className="btn btn-ghost" onClick={() => { setDelOpen(false); setDelState(''); }}>
                {t('pf.cancel')}
              </button>
            </div>
            {delState === 'error' && <p className="pf-danger-err">{t('pf.deleteErr')}</p>}
          </>
        )}
      </div>
    </div>
  );
}
