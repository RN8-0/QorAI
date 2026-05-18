import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { signIn, register, authErrorKey } from '../lib/pocketbase';
import { trackEvent } from '../lib/analytics';
import { useT } from '../i18n/index.jsx';
import './AuthModal.css';

export default function AuthModal() {
  const t = useT();
  const { modalOpen, closeAuth } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (modalOpen) { setErr(''); setBusy(false); }
  }, [modalOpen]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeAuth(); };
    if (modalOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen, closeAuth]);

  if (!modalOpen) return null;

  async function submit(e) {
    e.preventDefault();
    if (!email || !password) { setErr(t('auth.errEmpty')); return; }
    setBusy(true); setErr('');
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

  return (
    <div className="auth-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeAuth()}>
      <div className="auth-modal fade-up" role="dialog" aria-modal="true">
        <button className="auth-close" onClick={closeAuth} aria-label="✕">✕</button>
        <div className="auth-head">
          <img src="/assets/logo.png" alt="Qor AI" />
          <h2>{t('auth.welcome')}</h2>
          <p>{t('auth.subtitle')}</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setErr(''); }}>
            {t('auth.signin')}
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setErr(''); }}>
            {t('auth.register')}
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <input type="text" placeholder={t('auth.name')} value={name}
              onChange={(e) => setName(e.target.value)} autoComplete="name" />
          )}
          <input type="email" placeholder={t('auth.email')} value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <input type="password" placeholder={t('auth.password')} value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
          {err && <div className="auth-err">{err}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '…' : mode === 'signin' ? t('auth.signin') : t('auth.createAccount')}
          </button>
        </form>

        <p className="auth-foot">{t('auth.coinGift', { n: 20 })}</p>
      </div>
    </div>
  );
}
