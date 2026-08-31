import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types/library';
import { authRepository } from '../services/authRepository';
import { apiClient } from '../services/apiClient';

interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
  isLocked?: boolean;
  remainingSeconds?: number;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (regNumber: string, password?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Logout handler
  const logout = useCallback(async () => {
    await authRepository.logout();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  // Fetch current user from Central Server
  const refreshUser = useCallback(async () => {
    const token = apiClient.getToken();
    if (!token) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    try {
      const res = await authRepository.getCurrentUser();
      if (res.success && res.user) {
        setUser(res.user);
        setIsAuthenticated(true);
      } else {
        // Token is invalid or expired
        apiClient.setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.warn('[AuthContext] Error verifying session with Central Server:', err);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize and check session on startup
  useEffect(() => {
    refreshUser();

    // Subscribe to 401 Unauthorized events from apiClient
    const unsubscribe = apiClient.onUnauthorized(() => {
      console.warn('[AuthContext] Received 401 Unauthorized. Clearing session.');
      setUser(null);
      setIsAuthenticated(false);
      apiClient.setToken(null);
    });

    return () => {
      unsubscribe();
    };
  }, [refreshUser]);

  // Login handler
  const login = async (regNumber: string, password?: string): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const res = await authRepository.login({ registrationNumber: regNumber, password });
      if (res.success && res.data?.user) {
        setUser(res.data.user);
        setIsAuthenticated(true);
        return {
          success: true,
          user: res.data.user,
        };
      }

      const err = res.error;
      const isLocked = err?.code === 'USER_BLOCKED' || (err?.remainingSeconds ?? 0) > 0;

      return {
        success: false,
        error: err?.message || 'فشل تسجيل الدخول. يرجى التحقق من صحة البيانات.',
        isLocked,
        remainingSeconds: err?.remainingSeconds,
      };
    } catch (err: any) {
      return {
        success: false,
        error: 'تعذر الاتصال بالخادم المركزي. يرجى التحقق من اتصال الشبكة والمحاولة مرة أخرى.',
      };
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshUser,
        setUser,
      }}
    >
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
