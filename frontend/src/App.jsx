import { useState, useEffect, useCallback, useRef } from 'react';
import IdeaInput from './components/IdeaInput';
import SpecificationPreview from './components/SpecificationPreview';
import HistoryPanel from './components/HistoryPanel';
import ProgressIndicator from './components/ProgressIndicator';
import ConnectionStatus from './components/ConnectionStatus';
import { ToastProvider, useToast } from './components/ToastProvider';
import { ScreenReaderAnnouncer, SkipLinks, AccessibilitySettings, LoadingAnnouncement } from './components/AccessibilityHelper';
import { useGlobalKeyboardShortcuts } from './hooks/useKeyboardShortcuts.jsx';
import { KeyboardShortcutsHelp } from './hooks/useKeyboardShortcuts.jsx';
import { apiService, websocketService } from './services/api';
import './App.css';
import './components/KeyboardShortcutsHelp.css';
import './components/AccessibilityHelper.css';

function AppContent() {
  const [currentSpec, setCurrentSpec] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [jobProgress, setJobProgress] = useState({ status: 'idle', jobId: null, message: '' });
  const [wsConnected, setWsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);
  const toast = useToast();
  
  // Refs for keyboard navigation
  const inputRef = useRef(null);
  const historyRef = useRef(null);
  const previewRef = useRef(null);

  // Check backend health on app load
  useEffect(() => {
    checkBackendHealth();
    initializeWebSocket();
    
    // Setup online/offline listeners
    const handleOnline = () => {
      setIsOnline(true);
      toast.showSuccess('Connection restored', { duration: 3000 });
      checkBackendHealth();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.showWarning('You are offline', { persistent: true });
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      websocketService.cleanup();
    };
  }, [toast]);
  
  const initializeWebSocket = useCallback(() => {
    websocketService.initialize();
    
    // Listen for WebSocket connection changes
    const removeListener = websocketService.onConnectionChange((status) => {
      setWsConnected(status.connected);
      
      if (status.connected) {
        toast.showSuccess('Real-time connection established', { duration: 3000 });
      } else if (status.error) {
        toast.showWarning('Real-time connection failed, using fallback mode', { duration: 5000 });
      }
    });
    
    return removeListener;
  }, [toast]);
  
  // Keyboard shortcuts setup
  const keyboardCallbacks = {
    showHelp: () => setShowShortcutsHelp(true),
    closeModals: () => {
      setShowShortcutsHelp(false);
      setShowAccessibilitySettings(false);
      toast.clearAllToasts();
    },
    focusInput: () => {
      const input = inputRef.current?.querySelector('textarea');
      if (input) {
        input.focus();
        window.announceToScreenReader?.('Focused on idea input');
      }
    },
    focusHistory: () => {
      const history = historyRef.current;
      if (history) {
        const firstButton = history.querySelector('button');
        if (firstButton) {
          firstButton.focus();
          window.announceToScreenReader?.('Focused on history panel');
        }
      }
    },
    submitForm: () => {
      const textarea = inputRef.current?.querySelector('textarea');
      if (textarea && textarea.value.trim().length >= 10) {
        const form = textarea.closest('form');
        if (form) {
          const submitButton = form.querySelector('button[type="submit"]');
          if (submitButton && !submitButton.disabled) {
            submitButton.click();
          }
        }
      }
    },
    copySpec: () => {
      if (currentSpec?.specification) {
        handleCopy();
      } else {
        toast.showWarning('No specification available to copy');
      }
    },
    downloadSpec: () => {
      if (currentSpec?.id) {
        handleDownload(currentSpec.id);
      } else {
        toast.showWarning('No specification available to download');
      }
    },
    announceStatus: () => {
      const statusMessage = [];
      statusMessage.push(`Backend: ${backendStatus}`);
      statusMessage.push(`WebSocket: ${wsConnected ? 'connected' : 'disconnected'}`);
      statusMessage.push(`Network: ${isOnline ? 'online' : 'offline'}`);
      if (loading) statusMessage.push('Currently generating specification');
      if (currentSpec) statusMessage.push('Specification available');
      
      window.announceToScreenReader?.(statusMessage.join(', '), 'assertive');
    },
    showAccessibilitySettings: () => setShowAccessibilitySettings(true),
    skipToMain: () => {
      const main = document.querySelector('#main-content');
      if (main) {
        main.focus();
        main.scrollIntoView({ behavior: 'smooth' });
        window.announceToScreenReader?.('Navigated to main content');
      }
    }
  };
  
  useGlobalKeyboardShortcuts(keyboardCallbacks);

  const checkBackendHealth = useCallback(async () => {
    try {
      const healthData = await apiService.healthCheck();
      setBackendStatus('connected');
      
      // Show detailed health info if available
      if (healthData.services) {
        const unhealthyServices = Object.entries(healthData.services)
          .filter(([, status]) => status !== 'healthy')
          .map(([service]) => service);
        
        if (unhealthyServices.length > 0) {
          toast.showWarning(
            `Some services may be limited: ${unhealthyServices.join(', ')}`,
            { duration: 6000 }
          );
        }
      }
    } catch (err) {
      console.error('Backend health check failed:', err);
      setBackendStatus('disconnected');
      
      if (isOnline) {
        toast.showError(
          'Backend service is unavailable. Please try again later.',
          { 
            duration: 8000,
            actions: [{
              label: 'Retry',
              handler: checkBackendHealth,
              type: 'primary'
            }]
          }
        );
      }
    }
  }, [isOnline, toast]);

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
    setJobProgress({ status: 'started', jobId: null, message: 'Initializing...' });
    
    let loadingToastId = null;
    
    try {
      // Show loading toast for longer operations
      loadingToastId = toast.showLoading(
        'Generating specification... This may take 30-120 seconds.',
        { persistent: true }
      );
      
      const response = await apiService.generateSpecWithFallback(
        userInput,
        (progressUpdate) => {
          console.log('Progress update:', progressUpdate);
          setJobProgress({
            status: progressUpdate.status,
            jobId: progressUpdate.jobId,
            message: progressUpdate.message || ''
          });
          
          // Update loading toast with progress
          if (loadingToastId && progressUpdate.status === 'processing') {
            toast.updateToast(loadingToastId, {
              message: 'Processing your idea... Please wait.'
            });
          }
        }
      );
      
      // Handle the response
      if (response.specification) {
        setCurrentSpec({
          id: response.id,
          userInput: userInput,
          specification: response.specification,
          createdAt: response.created_at || new Date().toISOString()
        });
        
        setJobProgress({ status: 'completed', jobId: response.id, message: 'Specification generated successfully!' });
        
        // Remove loading toast and show success
        if (loadingToastId) {
          toast.removeToast(loadingToastId);
        }
        toast.showSuccess(
          'Specification generated successfully!',
          {
            duration: 4000,
            actions: [{
              label: 'Copy to Clipboard',
              handler: () => handleCopy(response.specification),
              type: 'secondary'
            }]
          }
        );
      } else {
        throw new Error('No specification received from server');
      }
    } catch (err) {
      console.error('Error generating specification:', err);
      
      const errorMessage = err.message || 'Failed to generate specification';
      setError(errorMessage);
      setJobProgress({ status: 'failed', jobId: null, message: errorMessage });
      
      // Remove loading toast and show error
      if (loadingToastId) {
        toast.removeToast(loadingToastId);
      }
      
      toast.showError(
        errorMessage,
        {
          duration: 8000,
          actions: [
            {
              label: 'Try Again',
              handler: () => handleIdeaSubmit(userInput),
              type: 'primary'
            },
            {
              label: 'Check Status',
              handler: checkBackendHealth,
              type: 'secondary'
            }
          ]
        }
      );
    } finally {
      setLoading(false);
      
      // Reset progress after a delay
      setTimeout(() => {
        setJobProgress({ status: 'idle', jobId: null, message: '' });
      }, 3000);
    }
  }, [isOnline, backendStatus, toast, checkBackendHealth]);

  const handleHistorySelect = (historyItem) => {
    setCurrentSpec(historyItem);
    setError(''); // Clear any previous errors
  };

  const handleCopy = useCallback(async (text) => {
    try {
      const textToCopy = text || currentSpec?.specification;
      if (!textToCopy) {
        toast.showWarning('No specification to copy');
        return;
      }
      
      // Use the copyToClipboard utility from api service
      const { copyToClipboard } = await import('./services/api');
      const success = await copyToClipboard(textToCopy);
      
      if (success) {
        toast.showSuccess('Specification copied to clipboard!', { duration: 3000 });
      } else {
        throw new Error('Copy failed');
      }
    } catch (err) {
      console.error('Copy failed:', err);
      toast.showError(
        'Failed to copy to clipboard. Please try selecting and copying manually.',
        { duration: 5000 }
      );
    }
  }, [currentSpec?.specification, toast]);

  const handleDownload = useCallback(async (specId) => {
    if (!isOnline) {
      toast.showError('You are offline. Cannot download file.');
      return;
    }
    
    const downloadToastId = toast.showLoading('Preparing download...');
    
    try {
      await apiService.downloadSpec(specId);
      
      toast.removeToast(downloadToastId);
      toast.showSuccess(
        'Specification downloaded successfully!',
        { duration: 4000 }
      );
    } catch (err) {
      console.error('Download failed:', err);
      const errorMessage = err.message || 'Failed to download specification';
      
      toast.removeToast(downloadToastId);
      toast.showError(
        errorMessage,
        {
          duration: 6000,
          actions: [{
            label: 'Try Again',
            handler: () => handleDownload(specId),
            type: 'primary'
          }]
        }
      );
      
      setError(errorMessage);
    }
  }, [isOnline, toast]);

  return (
    <div className="app">
      <SkipLinks />
      <ScreenReaderAnnouncer />
      <LoadingAnnouncement isLoading={loading} message="Generating specification, please wait..." />
      
      <header className="app__header">
        <h1 className="app__title">Idea to Specifications Generator</h1>
        <p className="app__subtitle">
          Transform your product ideas into detailed specifications using AI
        </p>
        
        <div className="app__status-container">
          <div className={`app__status app__status--${backendStatus}`}>
            <div className="app__status-indicator"></div>
            {backendStatus === 'checking' && 'Checking backend connection...'}
            {backendStatus === 'connected' && 'Backend connected'}
            {backendStatus === 'disconnected' && (
              <>
                Backend disconnected 
                <button 
                  onClick={checkBackendHealth} 
                  className="app__retry-btn"
                >
                  Retry
                </button>
              </>
            )}
          </div>
          
          <ConnectionStatus 
            showDetails={false}
            onStatusChange={(status) => {
              console.log('WebSocket status changed:', status);
            }}
          />
        </div>
        
        {/* Accessibility and Help Buttons */}
        <div className="app__header-actions">
          <button
            onClick={() => setShowAccessibilitySettings(true)}
            className="app__action-btn"
            aria-label="Open accessibility settings"
            title="Accessibility Settings (Alt+A)"
          >
            ⚙️ A11y
          </button>
          <button
            onClick={() => setShowShortcutsHelp(true)}
            className="app__action-btn"
            aria-label="Show keyboard shortcuts"
            title="Keyboard Shortcuts (Ctrl+/ or F1)"
          >
            ⌘ Help
          </button>
        </div>
      </header>

      <main id="main-content" className="app__main" tabIndex="-1">
        <div className="app__content">
          <div className="app__input-section">
            <div id="idea-input" ref={inputRef}>
              <IdeaInput 
                onSubmit={handleIdeaSubmit} 
                loading={loading}
                disabled={!isOnline || backendStatus !== 'connected'}
              />
            </div>
            
            {/* Progress Indicator */}
            <ProgressIndicator
              status={jobProgress.status}
              message={jobProgress.message}
              jobId={jobProgress.jobId}
              showDetails={true}
              onCancel={() => {
                // TODO: Implement job cancellation if supported by backend
                toast.showInfo('Job cancellation is not yet supported');
              }}
            />
            
            {error && (
              <div className="app__error" role="alert">
                <svg className="app__error-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
                <button 
                  onClick={() => setError('')} 
                  className="app__error-close"
                  aria-label="Close error message"
                >
                  ×
                </button>
              </div>
            )}
            
            <div id="specification-preview" ref={previewRef}>
              <SpecificationPreview
                specification={currentSpec?.specification}
                userInput={currentSpec?.userInput}
                specId={currentSpec?.id}
                loading={loading}
                onCopy={() => handleCopy()}
                onDownload={handleDownload}
              />
            </div>
          </div>
          
          <aside className="app__sidebar">
            <div id="history-panel" ref={historyRef}>
              <HistoryPanel 
                onSelectHistory={handleHistorySelect}
                currentSpecId={currentSpec?.id}
              />
            </div>
          </aside>
        </div>
      </main>

      <footer className="app__footer">
        <p>Powered by Gemini AI | Built with React + Node.js</p>
      </footer>
      
      {/* Modal dialogs */}
      {showShortcutsHelp && (
        <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
      )}
      
      {showAccessibilitySettings && (
        <AccessibilitySettings 
          isOpen={showAccessibilitySettings}
          onClose={() => setShowAccessibilitySettings(false)} 
        />
      )}
    </div>
  );
}

// Main App component with Toast Provider
function App() {
  return (
    <ToastProvider maxToasts={5}>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
