import React, { useState, useEffect, useCallback } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastProvider';
import IdeaInput from './components/IdeaInput';
import SpecificationPreview from './components/SpecificationPreview';
import HistoryPanel from './components/HistoryPanel';
import ProgressIndicator from './components/ProgressIndicator';
import { apiService, websocketService, copyToClipboard } from './services/api';
import './App.fixed.css';

// Main application content
function AppContent() {
  const [currentSpec, setCurrentSpec] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [jobProgress, setJobProgress] = useState({ status: 'idle', jobId: null, message: '' });
  const [wsConnected, setWsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const toast = useToast();

  // Initialize WebSocket
  const initializeWebSocket = useCallback(() => {
    try {
      websocketService.initialize();
      
      const removeListener = websocketService.onConnectionChange((status) => {
        setWsConnected(status.connected);
        
        if (status.connected) {
          console.log('WebSocket connected');
        } else if (status.error) {
          console.warn('WebSocket connection failed:', status.error);
        }
      });
      
      return removeListener;
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      return () => {};
    }
  }, []);

  // Check backend health
  const checkBackendHealth = useCallback(async () => {
    try {
      setBackendStatus('checking');
      await apiService.healthCheck();
      setBackendStatus('connected');
    } catch (err) {
      console.error('Backend health check failed:', err);
      setBackendStatus('disconnected');
      
      if (isOnline && toast) {
        toast.showError('Backend service is unavailable', { duration: 5000 });
      }
    }
  }, [isOnline, toast]);

  // Initialize app
  useEffect(() => {
    const init = async () => {
      try {
        // Check backend health
        await checkBackendHealth();
        
        // Initialize WebSocket
        const cleanup = initializeWebSocket();
        
        // Setup online/offline listeners
        const handleOnline = () => {
          setIsOnline(true);
          checkBackendHealth();
        };
        
        const handleOffline = () => {
          setIsOnline(false);
        };
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
          cleanup();
          websocketService.cleanup();
        };
      } catch (error) {
        console.error('App initialization failed:', error);
        setError('Failed to initialize application');
      }
    };
    
    init();
  }, [checkBackendHealth, initializeWebSocket]);

  // Handle idea submission
  const handleIdeaSubmit = useCallback(async (userInput) => {
    if (!isOnline) {
      toast.showError('You are offline. Please check your internet connection.');
      return;
    }
    
    if (backendStatus !== 'connected') {
      toast.showError('Backend service is not available. Please try again later.');
      return;
    }

    setLoading(true);
    setError('');
    setJobProgress({ status: 'started', jobId: null, message: 'Starting generation...' });

    try {
      const onProgress = (update) => {
        setJobProgress({
          status: update.status,
          jobId: update.jobId,
          message: update.message || `Status: ${update.status}`
        });
      };

      const result = await apiService.generateSpecWithFallback(userInput, onProgress);
      
      if (result && result.generatedSpec) {
        setCurrentSpec({
          id: result.id,
          userInput: result.userInput,
          specification: result.generatedSpec,
          processingTime: result.processingTime
        });
        setJobProgress({ status: 'completed', jobId: result.id, message: 'Generation completed!' });
        toast.showSuccess('Specification generated successfully!', { duration: 4000 });
      } else {
        throw new Error('No specification generated');
      }
    } catch (error) {
      console.error('Generation failed:', error);
      setError(error.message || 'Failed to generate specification');
      setJobProgress({ status: 'failed', jobId: null, message: 'Generation failed' });
      toast.showError(error.message || 'Failed to generate specification', { duration: 6000 });
    } finally {
      setLoading(false);
      
      // Reset progress after delay
      setTimeout(() => {
        setJobProgress({ status: 'idle', jobId: null, message: '' });
      }, 3000);
    }
  }, [isOnline, backendStatus, toast]);

  // Handle history selection
  const handleHistorySelect = (historyItem) => {
    setCurrentSpec(historyItem);
    setError('');
  };

  // Handle copy to clipboard
  const handleCopy = useCallback(async (text) => {
    try {
      const textToCopy = text || currentSpec?.specification;
      if (!textToCopy) {
        toast.showWarning('No specification to copy');
        return;
      }
      
      const success = await copyToClipboard(textToCopy);
      
      if (success) {
        toast.showSuccess('Specification copied to clipboard!', { duration: 3000 });
      } else {
        toast.showError('Failed to copy to clipboard', { duration: 3000 });
      }
    } catch (error) {
      console.error('Copy failed:', error);
      toast.showError('Failed to copy to clipboard', { duration: 3000 });
    }
  }, [currentSpec, toast]);

  // Render application
  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-content">
          <div className="app__title-section">
            <h1 className="app__title">Idea-to-Specs Generator</h1>
            <p className="app__subtitle">
              Transform your ideas into detailed product specifications using AI
            </p>
          </div>
          
          <div className="app__status">
            <div className={`app__status-indicator app__status-indicator--${backendStatus}`}>
              Backend: {backendStatus}
            </div>
            <div className={`app__status-indicator app__status-indicator--${wsConnected ? 'connected' : 'disconnected'}`}>
              WebSocket: {wsConnected ? 'connected' : 'disconnected'}
            </div>
          </div>
        </div>
      </header>

      <main className="app__main">
        <div className="app__content">
          <div className="app__input-section">
            <IdeaInput 
              onSubmit={handleIdeaSubmit} 
              loading={loading}
              disabled={!isOnline || backendStatus !== 'connected'}
            />
            
            <ProgressIndicator
              status={jobProgress.status}
              message={jobProgress.message}
            />
          </div>
          
          <div className="app__output-section">
            {error && (
              <div className="app__error">
                <p>❌ {error}</p>
                <button onClick={() => setError('')} className="app__error-close">
                  Dismiss
                </button>
              </div>
            )}
            
            {currentSpec && (
              <SpecificationPreview 
                specification={currentSpec.specification}
                userInput={currentSpec.userInput}
                onCopy={handleCopy}
              />
            )}
          </div>
          
          <div className="app__history-section">
            <HistoryPanel onSelect={handleHistorySelect} />
          </div>
        </div>
      </main>
    </div>
  );
}

// Main App with providers
function App() {
  return (
    <ErrorBoundary>
      <ToastProvider maxToasts={5}>
        <AppContent />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;