import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { setCurrentRole } from '../lib/roleStore';
import { connectSocket, disconnectSocket } from '../lib/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [socketTick, setSocketTick] = useState(0);
  const [initializing, setInitializing] = useState(true);

  const login = useCallback(async (role) => {
    const { user: loggedInUser } = await api.login(role);
    setCurrentRole(role);
    connectSocket(role);
    setUser(loggedInUser);
    localStorage.setItem('carevs-role', role);
    setSocketTick((t) => t + 1);
    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    setCurrentRole(null);
    disconnectSocket();
    setUser(null);
    localStorage.removeItem('carevs-role');
  }, []);

  useEffect(() => {
    const savedRole = localStorage.getItem('carevs-role');
    if (savedRole) {
      login(savedRole)
        .catch(() => localStorage.removeItem('carevs-role'))
        .finally(() => setInitializing(false));
    } else {
      setInitializing(false);
    }
    return () => disconnectSocket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, socketTick, initializing }),
    [user, login, logout, socketTick, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
