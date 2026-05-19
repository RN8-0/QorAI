import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { signIn, register, requestPasswordReset, authErrorKey } from '../lib/pocketbase';
import { trackEvent } from '../lib/analytics';
import { useT } from '../i18n/index.jsx';
import './AuthModal.css';

const MIN_PASSWORD = 8;

export default function AuthModal() {
  const t = useT();
  const { modalOpen, closeAuth } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | register | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (modalOpen) { setErr(''); setNotice(''); setBusy(false); }
  }, [modalOpen]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeAuth(); };
    if (modalOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen, closeAuth]);

  if (!modalOpen) return null;

  function switchMode(next) {
    setMode(next);
    setErr('');
    setNotice('');
    setShowPw(false);
  }

  async function submit(e) {
    e.preventDefault();
    setErr(''); setNotice('');

    if (mode === 'reset') {
      if (!email) { setErr(t('auth.errEmail')); return; }
      setBusy(true);
      try {
        await requestPasswordReset(email);
        trackEvent('password_reset_request');
        setNotice(t('auth.resetSent'));
      } catch (e2) {
        setErr(t(authErrorKey(e2)));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email || !password) { setErr(t('auth.errEmpty')); return; }
    if (mode === 'register' && password.length < MIN_PASSWORD) {
      setErr(t('auth.errPassword'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        trackEvent('login', { method: 'email' });
      } else {
        await register(email, password, name);
        trackEvent('sign_up', { method: 'email' });
      }
      closeAuth();
    } catch (e2) {
      setErr(t(authErrorKey(e2)));
    } finally {
      setBusy(false);
    }
  }

  const headTitle = mode === 'reset' ? t('auth.resetTitle') : t('auth.welcome');
  const headSub = mode === 'reset' ? t('auth.resetSubtitle') : t('auth.subtitle');

  return (
    <div className="auth-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeAuth()}>
      <div className="auth-modal fade-up" role="dialog" aria-modal="true">
        <button className="auth-close" onClick={closeAuth} aria-label="✕">✕</button>
        <div className="auth-head">
          <img src="/assets/logo.png" alt="Qor AI" />
          <h2>{headTitle}</h2>
          <p>{headSub}</p>
        </div>

        {mode !== 'reset' && (
          <div className="auth-tabs">
            <button className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')}>
              {t('auth.signin')}
            </button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
              {t('auth.register')}
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <input type="text" placeholder={t('auth.name')} value={name}
              onChange={(e) => setName(e.target.value)} autoComplete="name" />
          )}
          <input type="email" placeholder={t('auth.email')} value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />

          {mode !== 'reset' && (
            <div className="auth-pw">
              <input type={showPw ? 'text' : 'password'} placeholder={t('auth.password')}
                value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? MIN_PASSWORD : undefined} required />
              <button type="button" className="auth-pw-toggle"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? t('auth.hidePw') : t('auth.showPw')}>
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          )}

          {mode === 'signin' && (
            <button type="button" className="auth-forgot" onClick={() => switchMode('reset')}>
              {t('auth.forgot')}
            </button>
          )}

          {err && <div className="auth-err">{err}</div>}
          {notice && <div className="auth-notice">{notice}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '…'
              : mode === 'signin' ? t('auth.signin')
                : mode === 'register' ? t('auth.createAccount')
                  : t('auth.resetSend')}
          </button>
        </form>

        {mode === 'reset' ? (
          <button type="button" className="auth-back" onClick={() => switchMode('signin')}>
            {t('auth.backToSignin')}
          </button>
        ) : (
          <p className="auth-foot">{t('auth.coinGift', { n: 20 })}</p>
        )}
      </div>
    </div>
  );
}
