import { useState, useEffect } from 'react';
import { websocketService } from '../services/api';
import './ConnectionStatus.css';

function ConnectionStatus({ showDetails = false, onStatusChange = null }) {
  const [connectionState, setConnectionState] = useState({
    connected: false,
    socketId: null,
    error: null,
    reason: null,
    lastConnected: null,
    reconnectAttempts: 0
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Initialize WebSocket connection
    websocketService.connect();

    // Listen for connection status changes
    const removeConnectionListener = websocketService.onConnectionChange((status) => {
      setConnectionState(prev => ({
        ...prev,
        connected: status.connected,
        socketId: status.socketId || null,
        error: status.error || null,
        reason: status.reason || null,
        lastConnected: status.connected ? new Date() : prev.lastConnected,
        reconnectAttempts: status.connected ? 0 : prev.reconnectAttempts + 1
      }));

      // Notify parent component of status change
      if (onStatusChange) {
        onStatusChange(status);
      }
    });

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      // Attempt to reconnect WebSocket when back online
      if (!websocketService.isConnected()) {
        websocketService.connect();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      removeConnectionListener();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onStatusChange]);

  const handleRetryConnection = () => {
    websocketService.disconnect();
    setTimeout(() => {
      websocketService.connect();
    }, 1000);
  };

  const getStatusIcon = () => {
    if (!isOnline) {
      return (
        <svg className="connection-status__icon connection-status__icon--offline" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
        </svg>
      );
    }

    if (connectionState.connected) {
      return (
        <svg className="connection-status__icon connection-status__icon--connected" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      );
    }

    return (
      <svg className="connection-status__icon connection-status__icon--disconnected" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    );
  };

  const getStatusText = () => {
    if (!isOnline) {
      return 'Offline - No internet connection';
    }

    if (connectionState.connected) {
      return showDetails 
        ? `WebSocket Connected (${connectionState.socketId?.slice(0, 8)}...)`
        : 'Real-time connected';
    }

    return 'WebSocket disconnected - Using fallback mode';
  };

  const getStatusClass = () => {
    if (!isOnline) return 'offline';
    if (connectionState.connected) return 'connected';
    return 'disconnected';
  };

  const formatLastConnected = () => {
    if (!connectionState.lastConnected) return 'Never';
    
    const now = new Date();
    const diff = now - connectionState.lastConnected;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return connectionState.lastConnected.toLocaleDateString();
  };

  return (
    <div className={`connection-status connection-status--${getStatusClass()}`}>
      <div className="connection-status__main">
        <div className="connection-status__indicator">
          {getStatusIcon()}
          <span className="connection-status__text">
            {getStatusText()}
          </span>
        </div>
        
        {!isOnline && (
          <div className="connection-status__offline-notice">
            Please check your internet connection
          </div>
        )}
        
        {isOnline && !connectionState.connected && (
          <button 
            onClick={handleRetryConnection}
            className="connection-status__retry"
            aria-label="Retry WebSocket connection"
          >
            Retry
          </button>
        )}
      </div>

      {showDetails && (
        <div className="connection-status__details">
          <div className="connection-status__detail-row">
            <span className="connection-status__detail-label">Status:</span>
            <span className={`connection-status__detail-value connection-status__detail-value--${getStatusClass()}`}>
              {connectionState.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {connectionState.socketId && (
            <div className="connection-status__detail-row">
              <span className="connection-status__detail-label">Socket ID:</span>
              <code className="connection-status__detail-value">
                {connectionState.socketId}
              </code>
            </div>
          )}
          
          <div className="connection-status__detail-row">
            <span className="connection-status__detail-label">Last Connected:</span>
            <span className="connection-status__detail-value">
              {formatLastConnected()}
            </span>
          </div>
          
          {connectionState.reconnectAttempts > 0 && (
            <div className="connection-status__detail-row">
              <span className="connection-status__detail-label">Reconnect Attempts:</span>
              <span className="connection-status__detail-value">
                {connectionState.reconnectAttempts}
              </span>
            </div>
          )}
          
          {connectionState.error && (
            <div className="connection-status__detail-row">
              <span className="connection-status__detail-label">Error:</span>
              <span className="connection-status__detail-value connection-status__detail-value--error">
                {connectionState.error}
              </span>
            </div>
          )}
          
          {connectionState.reason && !connectionState.connected && (
            <div className="connection-status__detail-row">
              <span className="connection-status__detail-label">Reason:</span>
              <span className="connection-status__detail-value">
                {connectionState.reason}
              </span>
            </div>
          )}
        </div>
      )}

      {!connectionState.connected && isOnline && (
        <div className="connection-status__fallback-notice">
          <svg className="connection-status__fallback-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" />
          </svg>
          Using fallback mode - Features will work with polling instead of real-time updates
        </div>
      )}
    </div>
  );
}

export default ConnectionStatus;