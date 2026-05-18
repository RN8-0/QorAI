import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { signIn, register, authErrorMessage } from '../lib/pocketbase';
import { trackEvent } from '../lib/analytics';
import './AuthModal.css';

export default function AuthModal() {
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
    if (!email || !password) { setErr('E-posta ve şifre gerekli.'); return; }
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
      setErr(authErrorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeAuth()}>
      <div className="auth-modal fade-up" role="dialog" aria-modal="true">
        <button className="auth-close" onClick={closeAuth} aria-label="Kapat">✕</button>
        <div className="auth-head">
          <img src="/assets/logo.png" alt="Qor AI" />
          <h2>Qor AI'a hoş geldin</h2>
          <p>Deneyimini kişiselleştirmek için giriş yap</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setErr(''); }}>
            Giriş Yap
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setErr(''); }}>
            Kayıt Ol
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <input type="text" placeholder="Adın (opsiyonel)" value={name}
              onChange={(e) => setName(e.target.value)} autoComplete="name" />
          )}
          <input type="email" placeholder="E-posta adresi" value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <input type="password" placeholder="Şifre" value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
          {err && <div className="auth-err">{err}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '…' : mode === 'signin' ? 'Giriş Yap' : 'Hesap Oluştur'}
          </button>
        </form>

        <p className="auth-foot">
          Yeni hesaplara hoş geldin hediyesi olarak <b>20 Qor Coin</b> verilir.
        </p>
      </div>
    </div>
  );
}
