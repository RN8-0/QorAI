import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import {
  signIn, register, signInWithGoogle, requestPasswordReset, authErrorKey,
} from '../lib/pocketbase';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n/index.jsx';
import './AuthModal.css';

const MIN_PASSWORD = 8;
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const GENDER_KEY = {
  Male: 'auth.genderMale',
  Female: 'auth.genderFemale',
  'Non-binary': 'auth.genderNonBinary',
  'Prefer not to say': 'auth.genderPreferNot',
};

// Whole years between a YYYY-MM-DD birth date and today.
function ageFrom(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  const y = Number(year) || 2000;
  const m = Number(month) || 1;
  return new Date(y, m, 0).getDate();
}

export default function AuthModal() {
  const { t, lang } = useI18n();
  const { modalOpen, closeAuth } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | register | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState('');
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

  const currentYear = new Date().getFullYear();
  const monthNames = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US', { month: 'long' }).format(new Date(2020, i, 1)),
  })), [lang]);
  const yearOptions = useMemo(() => Array.from({ length: 88 }, (_, i) => String(currentYear - 13 - i)), [currentYear]);
  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth(birthYear, birthMonth) }, (_, i) => String(i + 1)),
    [birthMonth, birthYear],
  );

  if (!modalOpen) return null;

  function switchMode(next) {
    setMode(next);
    setErr('');
    setNotice('');
    setShowPw(false);
  }

  function updateBirthPart(part, value) {
    let day = part === 'day' ? value : birthDay;
    let month = part === 'month' ? value : birthMonth;
    let year = part === 'year' ? value : birthYear;
    if (day && month && year) {
      const maxDay = daysInMonth(year, month);
      if (Number(day) > maxDay) day = String(maxDay);
    }
    setBirthDay(day);
    setBirthMonth(month);
    setBirthYear(year);
    setBirthDate(day && month && year ? `${year}-${pad2(month)}-${pad2(day)}` : '');
  }

  async function google() {
    setErr(''); setNotice(''); setBusy(true);
    try {
      await signInWithGoogle();
      trackEvent('login', { method: 'google' });
      closeAuth();
    } catch (e) {
      setErr(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
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

    if (mode === 'signin') {
      if (!email || !password) { setErr(t('auth.errEmpty')); return; }
      setBusy(true);
      try {
        await signIn(email, password);
        trackEvent('login', { method: 'email' });
        closeAuth();
      } catch (e2) {
        setErr(t(authErrorKey(e2)));
      } finally {
        setBusy(false);
      }
      return;
    }

    // ── register — mirrors the mobile app's required fields ──
    if (!name || !email || !password || !confirm || !birthDate || !gender) {
      setErr(t('auth.errFields'));
      return;
    }
    if (password.length < MIN_PASSWORD) { setErr(t('auth.errPassword')); return; }
    if (password !== confirm) { setErr(t('auth.errPwMatch')); return; }
    const age = ageFrom(birthDate);
    if (age == null) { setErr(t('auth.errFields')); return; }
    if (age < 13) { setErr(t('auth.errAge13')); return; }

    setBusy(true);
    try {
      await register({
        email,
        password,
        name,
        birthDate: new Date(birthDate).toISOString(),
        gender,
      });
      trackEvent('sign_up', { method: 'email' });
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
          <img src="/assets/qor_logo_512.png?v=20260605a" alt="Qor AI" />
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

        {mode !== 'reset' && (
          <>
            <button type="button" className="auth-google" disabled={busy} onClick={google}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2.05H12v3.88h5.9a5.05 5.05 0 0 1-2.19 3.31v2.75h3.54c2.07-1.9 3.25-4.71 3.25-7.89z" />
                <path fill="#34A853" d="M12 23c2.96 0 5.45-.98 7.26-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.72 1.05-2.86 0-5.28-1.93-6.15-4.53H2.2v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.2a11 11 0 0 0 0 9.9l3.65-2.84z" />
                <path fill="#EA4335" d="M12 4.75c1.61 0 3.06.55 4.2 1.64l3.14-3.14C17.45 1.46 14.96.5 12 .5A11 11 0 0 0 2.2 7.05L5.85 9.9C6.72 7.3 9.14 4.75 12 4.75z" />
              </svg>
              {t('auth.continueGoogle')}
            </button>
            <div className="auth-divider"><span>{t('auth.or')}</span></div>
          </>
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

          {mode === 'register' && (
            <>
              <input type={showPw ? 'text' : 'password'} placeholder={t('auth.confirmPassword')}
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password" required />
              <label className="auth-field-label">{t('auth.birthDate')}</label>
              <div className="auth-date-picker">
                <select value={birthDay} onChange={(e) => updateBirthPart('day', e.target.value)}
                  className={birthDay ? '' : 'auth-select-empty'} required>
                  <option value="" disabled>{lang === 'tr' ? 'Gün' : lang === 'de' ? 'Tag' : 'Day'}</option>
                  {dayOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={birthMonth} onChange={(e) => updateBirthPart('month', e.target.value)}
                  className={birthMonth ? '' : 'auth-select-empty'} required>
                  <option value="" disabled>{lang === 'tr' ? 'Ay' : lang === 'de' ? 'Monat' : 'Month'}</option>
                  {monthNames.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={birthYear} onChange={(e) => updateBirthPart('year', e.target.value)}
                  className={birthYear ? '' : 'auth-select-empty'} required>
                  <option value="" disabled>{lang === 'tr' ? 'Yıl' : lang === 'de' ? 'Jahr' : 'Year'}</option>
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <select value={gender} onChange={(e) => setGender(e.target.value)}
                className={gender ? '' : 'auth-select-empty'} required>
                <option value="" disabled>{t('auth.gender')}</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>{t(GENDER_KEY[g])}</option>
                ))}
              </select>
            </>
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

        {mode === 'reset' && (
          <button type="button" className="auth-back" onClick={() => switchMode('signin')}>
            {t('auth.backToSignin')}
          </button>
        )}
      </div>
    </div>
  );
}
