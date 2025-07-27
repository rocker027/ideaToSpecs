import React, { useState, useEffect } from 'react';
import api from '../services/api';

function AuthStatus() {
  const [authStatus, setAuthStatus] = useState('checking');
  
  useEffect(() => {
    checkAuthStatus();
  }, []);
  
  const checkAuthStatus = async () => {
    try {
      const response = await api.checkGeminiAuth();
      setAuthStatus(response.authenticated ? 'authenticated' : 'not-authenticated');
    } catch (error) {
      console.error('Auth status check failed:', error);
      setAuthStatus('error');
    }
  };
  
  if (authStatus === 'not-authenticated') {
    return (
      <div className="auth-warning" style={{
        backgroundColor: '#fff3cd',
        border: '1px solid #ffeaa7',
        borderRadius: '4px',
        padding: '1rem',
        marginBottom: '1rem',
        color: '#856404'
      }}>
        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
          ⚠️ Gemini CLI 未授權
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          請在終端機執行: <code style={{ 
            backgroundColor: '#f8f9fa', 
            padding: '2px 4px', 
            borderRadius: '3px',
            border: '1px solid #dee2e6'
          }}>gemini auth login</code>
        </p>
      </div>
    );
  }
  
  if (authStatus === 'error') {
    return (
      <div className="auth-error" style={{
        backgroundColor: '#f8d7da',
        border: '1px solid #f5c6cb',
        borderRadius: '4px',
        padding: '1rem',
        marginBottom: '1rem',
        color: '#721c24'
      }}>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          ❌ 無法檢查 Gemini CLI 授權狀態
        </p>
      </div>
    );
  }
  
  if (authStatus === 'checking') {
    return (
      <div className="auth-checking" style={{
        backgroundColor: '#d1ecf1',
        border: '1px solid #bee5eb',
        borderRadius: '4px',
        padding: '1rem',
        marginBottom: '1rem',
        color: '#0c5460'
      }}>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          🔍 檢查 Gemini CLI 授權狀態...
        </p>
      </div>
    );
  }
  
  // If authenticated, don't show anything
  return null;
}

export default AuthStatus;