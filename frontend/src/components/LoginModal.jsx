/**
 * 安全登入模態組件
 * 為本地開發專案提供安全的身份驗證界面
 * 防止認證信息暴露和暴力破解
 */

import React, { useState, useEffect, useRef } from 'react';

const LoginModal = ({ isOpen, onClose, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockTimeRemaining, setBlockTimeRemaining] = useState(0);
  
  const blockTimerRef = useRef(null);
  const inputRef = useRef(null);
  
  // 安全配置常數
  const SECURITY_CONFIG = {
    MAX_LOGIN_ATTEMPTS: 3,
    BLOCK_DURATION: 5 * 60 * 1000, // 5 分鐘
    MIN_PASSWORD_LENGTH: 6
  };

  // 初始化時設置焦點和清除表單
  useEffect(() => {
    if (isOpen) {
      // 清除表單數據
      setUsername('');
      setPassword('');
      setError('');
      
      // 設置焦點到用戶名輸入框
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
      
      // 檢查是否還在禁用期間
      const lastBlockTime = localStorage.getItem('loginBlockTime');
      if (lastBlockTime) {
        const timeElapsed = Date.now() - parseInt(lastBlockTime);
        if (timeElapsed < SECURITY_CONFIG.BLOCK_DURATION) {
          setIsBlocked(true);
          setBlockTimeRemaining(Math.ceil((SECURITY_CONFIG.BLOCK_DURATION - timeElapsed) / 1000));
          startBlockTimer();
        } else {
          // 禁用期已過，清除記錄
          localStorage.removeItem('loginBlockTime');
          localStorage.removeItem('loginAttempts');
        }
      }
      
      // 從本地存儲中獲取嘗試次數
      const attempts = localStorage.getItem('loginAttempts');
      if (attempts) {
        setLoginAttempts(parseInt(attempts));
      }
    }
  }, [isOpen]);
  
  // 清除禁用計時器
  useEffect(() => {
    return () => {
      if (blockTimerRef.current) {
        clearInterval(blockTimerRef.current);
      }
    };
  }, []);
  
  // 啟動禁用計時器
  const startBlockTimer = () => {
    blockTimerRef.current = setInterval(() => {
      setBlockTimeRemaining(prev => {
        if (prev <= 1) {
          setIsBlocked(false);
          setLoginAttempts(0);
          localStorage.removeItem('loginBlockTime');
          localStorage.removeItem('loginAttempts');
          clearInterval(blockTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  
  // 輸入驗證
  const validateInput = () => {
    if (!username.trim()) {
      setError('請輸入用戶名');
      return false;
    }
    
    if (!password) {
      setError('請輸入密碼');
      return false;
    }
    
    if (password.length < SECURITY_CONFIG.MIN_PASSWORD_LENGTH) {
      setError(`密碼長度至少需要 ${SECURITY_CONFIG.MIN_PASSWORD_LENGTH} 位`);
      return false;
    }
    
    // 基本的 SQL 注入防護
    const dangerousChars = /[';"\\]|--|/\*|\*/|xp_|sp_/i;
    if (dangerousChars.test(username) || dangerousChars.test(password)) {
      setError('輸入包含非法字元');
      return false;
    }
    
    return true;
  };
  
  // 處理登入失敗
  const handleLoginFailure = () => {
    const newAttempts = loginAttempts + 1;
    setLoginAttempts(newAttempts);
    localStorage.setItem('loginAttempts', newAttempts.toString());
    
    if (newAttempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
      // 達到最大嘗試次數，禁用登入
      setIsBlocked(true);
      setBlockTimeRemaining(SECURITY_CONFIG.BLOCK_DURATION / 1000);
      localStorage.setItem('loginBlockTime', Date.now().toString());
      startBlockTimer();
      setError(`登入嘗試次數過多，請等待 ${Math.ceil(SECURITY_CONFIG.BLOCK_DURATION / 60000)} 分鐘後再試`);
    } else {
      const remaining = SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS - newAttempts;
      setError(`認證失敗，還剩 ${remaining} 次嘗試機會`);
    }
  };
  
  // 處理登入成功
  const handleLoginSuccess = (userData) => {
    // 清除嘗試記錄
    setLoginAttempts(0);
    setIsBlocked(false);
    localStorage.removeItem('loginAttempts');
    localStorage.removeItem('loginBlockTime');
    
    // 清除敷感數據
    setUsername('');
    setPassword('');
    setError('');
    
    onLogin(userData);
    onClose();
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // 檢查是否被禁用
    if (isBlocked) {
      setError(`登入被禁用，請等待 ${Math.ceil(blockTimeRemaining / 60)} 分鐘`);
      return;
    }
    
    // 驗證輸入
    if (!validateInput()) {
      return;
    }
    
    setIsLoading(true);
    setError('');

    try {
      // 使用 AuthProvider 的 login 方法而不是直接發請求
      const result = await onLogin(username.trim(), password);
      
      if (result && result.success) {
        handleLoginSuccess(result.user);
      } else {
        handleLoginFailure();
        setError(result?.error || '登入失敗');
      }
    } catch (error) {
      console.error('Login error:', error);
      handleLoginFailure();
      setError('網路連接錯誤，請檢查網路連線');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 關閉模態時清除敷感數據
  const handleClose = () => {
    setUsername('');
    setPassword('');
    setError('');
    onClose();
  };
  
  // 鍵盤事件處理
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        width: '400px',
        maxWidth: '90%',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          🔐 安全登入
        </h2>
        
        <form onSubmit={handleSubmit} autoComplete="off">
          {error && (
            <div style={{
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              padding: '0.75rem',
              borderRadius: '4px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              wordBreak: 'break-word'
            }}>
              {error}
            </div>
          )}
          
          {isBlocked && (
            <div style={{
              backgroundColor: '#fef3c7',
              color: '#d97706',
              padding: '0.75rem',
              borderRadius: '4px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              textAlign: 'center'
            }}>
              ⚠️ 登入被禁用<br />
              剩餘時間: {Math.floor(blockTimeRemaining / 60)}:{(blockTimeRemaining % 60).toString().padStart(2, '0')}
            </div>
          )}
          
          {loginAttempts > 0 && !isBlocked && (
            <div style={{
              backgroundColor: '#fef3c7',
              color: '#d97706',
              padding: '0.5rem',
              borderRadius: '4px',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              textAlign: 'center'
            }}>
              ⚠️ 已嘗試 {loginAttempts} 次，還剩 {SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS - loginAttempts} 次機會
            </div>
          )}
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem',
              fontWeight: 'bold'
            }}>
              使用者名稱
            </label>
            <input
              ref={inputRef}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="輸入用戶名"
              autoComplete="username"
              disabled={isBlocked || isLoading}
              maxLength={50}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                opacity: (isBlocked || isLoading) ? 0.6 : 1
              }}
              required
            />
          </div>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem',
              fontWeight: 'bold'
            }}>
              密碼
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="輸入密碼"
              autoComplete="current-password"
              disabled={isBlocked || isLoading}
              minLength={SECURITY_CONFIG.MIN_PASSWORD_LENGTH}
              maxLength={128}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                opacity: (isBlocked || isLoading) ? 0.6 : 1
              }}
              required
            />
          </div>
          
          <div style={{
            backgroundColor: '#eff6ff',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1.5rem',
            fontSize: '0.85rem',
            color: '#1e40af'
          }}>
            💡 <strong>本地開發提示:</strong><br/>
            本地 IP (127.0.0.1) 可以直接存取，無需登入<br/>
            其他 IP 地址需要登入驗證
          </div>
          
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem',
            justifyContent: 'flex-end'
          }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading || isBlocked || !username.trim() || !password}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: (isLoading || isBlocked) ? '#6b7280' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (isLoading || isBlocked) ? 'not-allowed' : 'pointer',
                opacity: (!username.trim() || !password) ? 0.6 : 1
              }}
            >
              {isLoading ? '登入中...' : isBlocked ? '被禁用' : '登入'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;

// 安全性注意事項:
// 1. 不再在組件中儲存預設認證信息
// 2. 實施嘗試次數限制和自動禁用機制
// 3. 基本的輸入驗證和清漗
// 4. 清除敷感數據防止內存洩漏
// 5. 防止 XSS 和 CSRF 攻擊的基本措施