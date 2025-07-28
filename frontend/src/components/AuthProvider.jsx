/**
 * 安全身份驗證狀態管理組件
 * 提供應用程式級別的身份驗證狀態管理
 * 使用 HTTP-only cookies 和 CSRF 防護
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AuthContext = createContext();

// 安全配置常數
const SECURITY_CONFIG = {
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 分鐘
  TOKEN_REFRESH_INTERVAL: 25 * 60 * 1000, // 25 分鐘
  MAX_IDLE_TIME: 15 * 60 * 1000, // 15 分鐘無活動自動登出
  CSRF_HEADER: 'X-CSRF-Token',
  SESSION_HEADER: 'X-Session-ID'
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [csrfToken, setCsrfToken] = useState(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  
  // 使用 useRef 來存儲計時器，避免重新渲染時丟失
  const sessionTimeoutRef = useRef(null);
  const tokenRefreshRef = useRef(null);
  const idleTimeoutRef = useRef(null);

  // 初始化身份驗證和安全監控
  useEffect(() => {
    initializeAuth();
    setupSecurityMonitoring();
    
    return () => {
      clearAllTimers();
    };
  }, []);
  
  // 監控用戶活動以重置閒置計時器
  useEffect(() => {
    const handleUserActivity = () => {
      setLastActivity(Date.now());
      resetIdleTimer();
    };
    
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, true);
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity, true);
      });
    };
  }, [isAuthenticated]);

  // 清除所有計時器
  const clearAllTimers = useCallback(() => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
    if (tokenRefreshRef.current) {
      clearInterval(tokenRefreshRef.current);
      tokenRefreshRef.current = null;
    }
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);
  
  // 重置閒置計時器
  const resetIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    
    if (isAuthenticated) {
      idleTimeoutRef.current = setTimeout(() => {
        console.warn('User idle timeout, logging out...');
        logout(true); // 自動登出
      }, SECURITY_CONFIG.MAX_IDLE_TIME);
    }
  }, [isAuthenticated]);
  
  // 獲取 CSRF Token
  const fetchCSRFToken = async () => {
    try {
      const response = await fetch('/api/auth/csrf-token', {
        method: 'GET',
        credentials: 'include' // 包含 HTTP-only cookies
      });
      
      if (response.ok) {
        const data = await response.json();
        setCsrfToken(data.csrfToken);
        return data.csrfToken;
      }
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
    }
    return null;
  };
  
  // 初始化身份驗證
  const initializeAuth = async () => {
    try {
      // 獲取 CSRF Token
      const token = await fetchCSRFToken();
      if (!token) {
        console.warn('Failed to get CSRF token');
      }
      
      // 檢查現有 session（通過 HTTP-only cookie）
      const response = await fetch('/api/auth/user', {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...(token && { [SECURITY_CONFIG.CSRF_HEADER]: token })
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setIsAuthenticated(true);
        setupSessionManagement();
      } else if (response.status === 401) {
        // 未認證，清除狀態
        handleAuthenticationFailure();
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      // 網路錯誤時的處理
      handleNetworkError();
    } finally {
      setIsLoading(false);
    }
  };
  
  // 處理認證失敗
  const handleAuthenticationFailure = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    setCsrfToken(null);
    clearAllTimers();
  }, [clearAllTimers]);
  
  // 處理網路錯誤（本地開發環境）
  const handleNetworkError = () => {
    // 僅在開發環境中設置本地開發用戶
    if (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') {
      console.warn('Network error detected, assuming local development environment');
      setUser({ id: 'local-dev', username: 'developer', role: 'local' });
      setIsAuthenticated(true);
    }
  };

  // 設置 Session 管理
  const setupSessionManagement = useCallback(() => {
    // 設置 session 超時
    sessionTimeoutRef.current = setTimeout(() => {
      console.warn('Session timeout, logging out...');
      logout(true);
    }, SECURITY_CONFIG.SESSION_TIMEOUT);
    
    // 設置 token 刷新
    tokenRefreshRef.current = setInterval(async () => {
      await refreshToken();
    }, SECURITY_CONFIG.TOKEN_REFRESH_INTERVAL);
    
    // 重置閒置計時器
    resetIdleTimer();
  }, [resetIdleTimer]);
  
  // 設置安全監控
  const setupSecurityMonitoring = () => {
    // 監控頁面可見性變化
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 頁面隱藏時記錄時間
        sessionStorage.setItem('pageHiddenAt', Date.now().toString());
      } else {
        // 頁面重新可見時檢查是否需要重新認證
        const hiddenAt = sessionStorage.getItem('pageHiddenAt');
        if (hiddenAt && isAuthenticated) {
          const hiddenDuration = Date.now() - parseInt(hiddenAt);
          if (hiddenDuration > SECURITY_CONFIG.MAX_IDLE_TIME) {
            console.warn('Page was hidden too long, re-authenticating...');
            initializeAuth();
          }
        }
        sessionStorage.removeItem('pageHiddenAt');
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  };
  
  // 刷新認證 Token
  const refreshToken = async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { [SECURITY_CONFIG.CSRF_HEADER]: csrfToken })
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
        console.log('Token refreshed successfully');
        return true;
      } else if (response.status === 401) {
        // Token 刷新失败，需要重新登入
        console.warn('Token refresh failed, re-authentication required');
        logout(true);
        return false;
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  };
  
  // 安全登入函數
  const login = async (username, password) => {
    setIsLoading(true);
    try {
      // 確保有 CSRF Token
      let token = csrfToken;
      if (!token) {
        token = await fetchCSRFToken();
      }
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include', // 包含 HTTP-only cookies
        headers: {
          'Content-Type': 'application/json',
          ...(token && { [SECURITY_CONFIG.CSRF_HEADER]: token })
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        setIsAuthenticated(true);
        
        // 更新 CSRF Token
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
        
        // 設置 session 管理
        setupSessionManagement();
        
        return { success: true, user: data.user };
      } else {
        // 安全地處理錯誤，不暴露敏感信息
        const errorMessage = response.status === 401 ? '認證失敗' : 
                           response.status === 429 ? '嘗試次數過多，請稍後再試' : 
                           '登入錯誤';
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: '網路連接錯誤' };
    } finally {
      setIsLoading(false);
    }
  };

  // 安全登出函數
  const logout = async (isAutomatic = false) => {
    try {
      // 清除所有計時器
      clearAllTimers();
      
      // 呼叫後端登出 API
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { [SECURITY_CONFIG.CSRF_HEADER]: csrfToken })
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // 清除所有認證狀態
      setUser(null);
      setIsAuthenticated(false);
      setCsrfToken(null);
      setLastActivity(Date.now());
      
      // 清除任何可能的本地存儲（向後兼容）
      localStorage.removeItem('sessionId');
      localStorage.removeItem('user');
      sessionStorage.clear();
      
      if (isAutomatic) {
        // 自動登出時顯示通知
        if (window.showToast) {
          window.showToast('會話已過期，請重新登入', 'warning');
        }
      }
    }
  };

  // 安全 API 請求輔助函數
  const apiRequest = async (url, options = {}) => {
    // 更新用戶活動時間
    setLastActivity(Date.now());
    resetIdleTimer();
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // 添加 CSRF Token
    if (csrfToken) {
      headers[SECURITY_CONFIG.CSRF_HEADER] = csrfToken;
    }

    const response = await fetch(url, {
      ...options,
      credentials: 'include', // 包含 HTTP-only cookies
      headers
    });

    // 處理認證相關的回應狀態
    if (response.status === 401) {
      console.warn('Authentication failed, logging out...');
      logout(true);
    } else if (response.status === 403) {
      console.warn('CSRF token validation failed');
      // 嘗試刷新 CSRF Token
      const newToken = await fetchCSRFToken();
      if (newToken && options.retryWithNewCSRF !== false) {
        // 重試一次請求
        return apiRequest(url, { ...options, retryWithNewCSRF: false });
      }
    }

    return response;
  };
  
  // 檢查認證狀態
  const checkAuthStatus = async () => {
    if (!isAuthenticated) return false;
    
    try {
      const response = await fetch('/api/auth/status', {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...(csrfToken && { [SECURITY_CONFIG.CSRF_HEADER]: csrfToken })
        }
      });
      
      if (response.ok) {
        return true;
      } else if (response.status === 401) {
        logout(true);
        return false;
      }
    } catch (error) {
      console.error('Auth status check error:', error);
    }
    
    return false;
  };

  const value = {
    user,
    isLoading,
    isAuthenticated,
    csrfToken,
    lastActivity,
    login,
    logout,
    apiRequest,
    refreshToken,
    checkAuthStatus,
    // 安全工具函數
    resetIdleTimer,
    isSessionValid: () => {
      if (!isAuthenticated) return false;
      const now = Date.now();
      return (now - lastActivity) < SECURITY_CONFIG.MAX_IDLE_TIME;
    }
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
export { SECURITY_CONFIG };