import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfileResponseDto } from '@vit-carpool/contracts';

interface AuthContextType {
  user: UserProfileResponseDto | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: UserProfileResponseDto) => void;
  logout: (isExpired?: boolean) => void;
  refreshProfile: (activeToken?: string | null) => Promise<void>;
}

export const AUTH_UNAUTHORIZED_EVENT = 'vit:auth:unauthorized';

export function notifyUnauthorized() {
  window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('vit_auth_token'));
  const [user, setUser] = useState<UserProfileResponseDto | null>(() => {
    const cached = localStorage.getItem('vit_auth_user');
    return cached ? JSON.parse(cached) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    // If a token exists in storage, start in loading state to validate with server
    return Boolean(localStorage.getItem('vit_auth_token'));
  });

  const logout = useCallback((isExpired = false) => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('vit_auth_token');
    localStorage.removeItem('vit_auth_user');
    if (isExpired) {
      sessionStorage.setItem('vit_session_expired', 'true');
    }
  }, []);

  const refreshProfile = useCallback(
    async (activeToken?: string | null) => {
      const tokenToUse = activeToken !== undefined ? activeToken : token;
      if (!tokenToUse) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch('/api/users/me', {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
            Accept: 'application/json',
          },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          localStorage.setItem('vit_auth_user', JSON.stringify(data));
        } else if (res.status === 401 || res.status === 404) {
          // Token is expired, invalid, or user record deleted
          logout(true);
        }
      } catch {
        // Offline / network failure fallback: preserve cached state if available
      } finally {
        setIsLoading(false);
      }
    },
    [token, logout],
  );

  // Validate session against server on startup and whenever token changes
  useEffect(() => {
    if (token) {
      refreshProfile(token);
    } else {
      setIsLoading(false);
    }
  }, [token]);

  // Global listener for 401 Unauthorized events from any API call
  useEffect(() => {
    const handleUnauthorized = () => {
      logout(true);
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [logout]);

  const login = (newToken: string, newUser: UserProfileResponseDto) => {
    sessionStorage.removeItem('vit_session_expired');
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('vit_auth_token', newToken);
    localStorage.setItem('vit_auth_user', JSON.stringify(newUser));
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
