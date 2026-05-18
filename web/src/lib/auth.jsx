import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthChange, signOut as pbSignOut } from './pocketbase';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => onAuthChange(setUser), []);

  const openAuth = useCallback(() => setModalOpen(true), []);
  const closeAuth = useCallback(() => setModalOpen(false), []);
  const logout = useCallback(() => pbSignOut(), []);

  return (
    <AuthCtx.Provider value={{ user, modalOpen, openAuth, closeAuth, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
