/* ═══════════════════════════════════════════════════════════════
   Compair — Firebase Authentication
   ═══════════════════════════════════════════════════════════════ */

let auth = null;
let authMode = 'signin';

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  createAuthModal();
});

function initAuth() {
  try {
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: "AIzaSyA_YqZli9PSPeCzYl2x9FBv5SYK-m0kpEg",
        authDomain: "compair-99b6e.firebaseapp.com",
        projectId: "compair-99b6e",
        storageBucket: "compair-99b6e.firebasestorage.app",
        messagingSenderId: "510980756238",
        appId: "1:510980756238:web:b21d1e3613561d7c69fd5f"
      });
    }
    auth = firebase.auth();
    auth.onAuthStateChanged(handleAuthStateChange);
  } catch (e) {
    console.warn('Auth init error:', e);
  }
}

function handleAuthStateChange(user) {
  renderAuthButton(user);
  const menu = document.getElementById('auth-user-menu');
  if (menu) menu.classList.remove('open');
}

function renderAuthButton(user) {
  const container = document.getElementById('auth-btn-container');
  if (!container) return;

  if (user) {
    const avatarHtml = user.photoURL
      ? `<img src="${user.photoURL}" alt="${user.displayName || 'User'}" class="auth-avatar">`
      : `<div class="auth-avatar-placeholder">${((user.displayName || user.email || 'U')[0]).toUpperCase()}</div>`;
    const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
    container.innerHTML = `
      <div style="position:relative;">
        <button class="auth-user-btn" onclick="toggleUserMenu(event)">
          ${avatarHtml}
          <span class="auth-user-name">${displayName}</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="auth-user-menu" id="auth-user-menu">
          <div class="auth-user-info">
            ${user.displayName ? `<div style="font-size:13px;font-weight:700;margin-bottom:2px;">${user.displayName}</div>` : ''}
            <div class="auth-user-email">${user.email || ''}</div>
          </div>
          <button class="auth-signout-btn" onclick="signOutUser()">Sign Out</button>
        </div>
      </div>`;
  } else {
    container.innerHTML = `
      <button class="auth-signin-btn" onclick="openAuthModal()">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Sign In
      </button>`;
  }
}

function toggleUserMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('auth-user-menu');
  if (menu) menu.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const container = document.getElementById('auth-btn-container');
  if (container && !container.contains(e.target)) {
    const menu = document.getElementById('auth-user-menu');
    if (menu) menu.classList.remove('open');
  }
});

function createAuthModal() {
  if (document.getElementById('auth-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'auth-modal-overlay';
  modal.innerHTML = `
    <div class="auth-modal" role="dialog" aria-modal="true" aria-label="Sign In">
      <button class="auth-modal-close" onclick="closeAuthModal()" aria-label="Close">✕</button>
      <div class="auth-modal-header">
        <div class="auth-modal-logo">C</div>
        <h2>Welcome to Compair</h2>
        <p>Sign in to personalize your experience</p>
      </div>

      <button class="auth-google-btn" onclick="signInWithGoogle()">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div class="auth-divider">or</div>

      <div class="auth-tabs">
        <button class="auth-tab active" id="tab-signin" onclick="switchAuthTab('signin')">Sign In</button>
        <button class="auth-tab" id="tab-register" onclick="switchAuthTab('register')">Register</button>
      </div>

      <div class="auth-form" id="auth-form">
        <input type="email" id="auth-email" placeholder="Email address" autocomplete="email">
        <input type="password" id="auth-password" placeholder="Password" autocomplete="current-password">
        <div class="auth-error" id="auth-error" style="display:none;"></div>
        <button class="auth-submit" id="auth-submit" onclick="submitAuth()">Sign In</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });
  modal.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
}

function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('tab-signin')?.classList.toggle('active', mode === 'signin');
  document.getElementById('tab-register')?.classList.toggle('active', mode === 'register');
  const submitBtn = document.getElementById('auth-submit');
  if (submitBtn) submitBtn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  const pwdInput = document.getElementById('auth-password');
  if (pwdInput) pwdInput.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  hideAuthError();
}

function openAuthModal() {
  createAuthModal();
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
  }
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

async function signInWithGoogle() {
  if (!auth) { showAuthError('Authentication not available'); return; }
  try {
    hideAuthError();
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    closeAuthModal();
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      showAuthError(getAuthErrorMessage(e.code));
    }
  }
}

async function submitAuth() {
  if (!auth) { showAuthError('Authentication not available'); return; }
  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;
  if (!email || !password) { showAuthError('Please enter your email and password'); return; }

  const btn = document.getElementById('auth-submit');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    hideAuthError();
    if (authMode === 'signin') {
      await auth.signInWithEmailAndPassword(email, password);
    } else {
      await auth.createUserWithEmailAndPassword(email, password);
    }
    closeAuthModal();
  } catch (e) {
    showAuthError(getAuthErrorMessage(e.code));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
    }
  }
}

async function signOutUser() {
  if (!auth) return;
  try { await auth.signOut(); } catch (e) { console.warn('Sign out error:', e); }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function hideAuthError() {
  const el = document.getElementById('auth-error');
  if (el) el.style.display = 'none';
}

function getAuthErrorMessage(code) {
  const messages = {
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/email-already-in-use': 'An account already exists with this email',
    'auth/invalid-email': 'Please enter a valid email address',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/too-many-requests': 'Too many attempts. Please try again later',
    'auth/popup-closed-by-user': 'Sign-in popup was closed',
    'auth/network-request-failed': 'Network error. Check your connection',
    'auth/invalid-credential': 'Invalid email or password',
  };
  return messages[code] || 'An error occurred. Please try again';
}

// Expose
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.signInWithGoogle = signInWithGoogle;
window.submitAuth = submitAuth;
window.signOutUser = signOutUser;
window.switchAuthTab = switchAuthTab;
window.toggleUserMenu = toggleUserMenu;
