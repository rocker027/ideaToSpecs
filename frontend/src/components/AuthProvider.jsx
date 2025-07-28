/**
 * 身份驗證狀態管理組件
 * 提供應用程式級別的身份驗證狀態管理
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // 初始化時檢查本地存儲的 session
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const storedSessionId = localStorage.getItem('sessionId');
      const storedUser = localStorage.getItem('user');

      if (storedSessionId && storedUser) {
        // 驗證 session 是否仍然有效
        const response = await fetch('/api/auth/user', {
          headers: {
            'X-Session-ID': storedSessionId
          }
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setSessionId(storedSessionId);
          setIsAuthenticated(true);
        } else {
          // Session 無效，清除本地存儲
          localStorage.removeItem('sessionId');
          localStorage.removeItem('user');
        }
      }
    } catch (error) {
      console.error('Session check error:', error);
      // 網路錯誤時，假設為本地開發環境
      setUser({ id: 'local-dev', username: 'developer', role: 'local' });
      setIsAuthenticated(true);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username, password) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        setSessionId(data.sessionId);
        setIsAuthenticated(true);
        
        localStorage.setItem('sessionId', data.sessionId);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.message };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: '連接錯誤' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (sessionId) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'X-Session-ID': sessionId
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setSessionId(null);
      setIsAuthenticated(false);
      localStorage.removeItem('sessionId');
      localStorage.removeItem('user');
    }
  };

  // API 請求輔助函數，自動添加身份驗證 header
  const apiRequest = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (sessionId) {
      headers['X-Session-ID'] = sessionId;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    // 如果返回 401，可能 session 已過期
    if (response.status === 401 && sessionId) {
      console.warn('Session expired, logging out...');
      logout();
    }

    return response;
  };

  const value = {
    user,
    sessionId,
    isLoading,
    isAuthenticated,
    login,
    logout,
    apiRequest,
    checkExistingSession
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;