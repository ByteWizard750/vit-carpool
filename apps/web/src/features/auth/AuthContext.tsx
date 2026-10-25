import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfileResponseDto } from '@vit-carpool/contracts';

interface AuthContextType {
  user: UserProfileResponseDto | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: UserProfileResponseDto) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('vit_auth_token'));
  const [user, setUser] = useState<UserProfileResponseDto | null>(() => {
    const cached = localStorage.getItem('vit_auth_user');
    return cached ? JSON.parse(cached) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const refreshProfile = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        localStorage.setItem('vit_auth_user', JSON.stringify(data));
      } else if (res.status === 401) {
        logout();
      }
    } catch {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token && !user) {
      refreshProfile();
    }
  }, [token]);

  const login = (newToken: string, newUser: UserProfileResponseDto) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('vit_auth_token', newToken);
    localStorage.setItem('vit_auth_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('vit_auth_token');
    localStorage.removeItem('vit_auth_user');
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
