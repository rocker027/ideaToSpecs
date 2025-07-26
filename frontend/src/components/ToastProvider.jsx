import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import './ToastProvider.css';

const ToastContext = createContext();

// Hook to use toast notifications
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Toast types
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  LOADING: 'loading'
};

// Individual Toast Component
function Toast({ toast, onClose }) {
  const { id, type, title, message, duration, persistent, actions } = toast;

  useEffect(() => {
    if (!persistent && duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, persistent, onClose]);

  const getIcon = () => {
    switch (type) {
      case TOAST_TYPES.SUCCESS:
        return (
          <svg className="toast__icon toast__icon--success" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case TOAST_TYPES.ERROR:
        return (
          <svg className="toast__icon toast__icon--error" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case TOAST_TYPES.WARNING:
        return (
          <svg className="toast__icon toast__icon--warning" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case TOAST_TYPES.INFO:
        return (
          <svg className="toast__icon toast__icon--info" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
      case TOAST_TYPES.LOADING:
        return (
          <div className="toast__icon toast__icon--loading">
            <svg viewBox="0 0 24 24" className="toast__spinner">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="31.416" strokeDashoffset="31.416" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`toast toast--${type}`} role="alert" aria-live="polite">
      <div className="toast__content">
        <div className="toast__header">
          {getIcon()}
          <div className="toast__text">
            {title && <div className="toast__title">{title}</div>}
            {message && <div className="toast__message">{message}</div>}
          </div>
          <button
            className="toast__close"
            onClick={() => onClose(id)}
            aria-label="Close notification"
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        {actions && actions.length > 0 && (
          <div className="toast__actions">
            {actions.map((action, index) => (
              <button
                key={index}
                className={`toast__action toast__action--${action.type || 'primary'}`}
                onClick={() => {
                  action.handler();
                  if (action.closeOnClick !== false) {
                    onClose(id);
                  }
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {!persistent && duration > 0 && (
        <div 
          className="toast__progress" 
          style={{ 
            animationDuration: `${duration}ms` 
          }}
        />
      )}
    </div>
  );
}

// Toast Container Component
function ToastContainer({ toasts, onClose }) {
  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}

// Toast Provider Component
export function ToastProvider({ children, maxToasts = 5 }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toastData) => {
    const id = Date.now() + Math.random();
    const toast = {
      id,
      type: TOAST_TYPES.INFO,
      duration: 5000,
      persistent: false,
      ...toastData
    };

    setToasts(prev => {
      const newToasts = [toast, ...prev];
      // Limit the number of toasts
      if (newToasts.length > maxToasts) {
        return newToasts.slice(0, maxToasts);
      }
      return newToasts;
    });

    return id;
  }, [maxToasts]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const updateToast = useCallback((id, updates) => {
    setToasts(prev => prev.map(toast => 
      toast.id === id ? { ...toast, ...updates } : toast
    ));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods for different toast types
  const showSuccess = useCallback((message, options = {}) => {
    return addToast({
      type: TOAST_TYPES.SUCCESS,
      message,
      ...options
    });
  }, [addToast]);

  const showError = useCallback((message, options = {}) => {
    return addToast({
      type: TOAST_TYPES.ERROR,
      message,
      duration: 8000, // Longer duration for errors
      ...options
    });
  }, [addToast]);

  const showWarning = useCallback((message, options = {}) => {
    return addToast({
      type: TOAST_TYPES.WARNING,
      message,
      duration: 6000,
      ...options
    });
  }, [addToast]);

  const showInfo = useCallback((message, options = {}) => {
    return addToast({
      type: TOAST_TYPES.INFO,
      message,
      ...options
    });
  }, [addToast]);

  const showLoading = useCallback((message, options = {}) => {
    return addToast({
      type: TOAST_TYPES.LOADING,
      message,
      persistent: true, // Loading toasts persist by default
      ...options
    });
  }, [addToast]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Escape key to close all toasts
      if (event.key === 'Escape' && toasts.length > 0) {
        clearAllToasts();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toasts.length, clearAllToasts]);

  const contextValue = {
    addToast,
    removeToast,
    updateToast,
    clearAllToasts,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading,
    toasts
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}