import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastProvider';
import Button from './components/ui/Button';
import TextField from './components/ui/TextField';
import Card from './components/ui/Card';
import LanguageSwitch from './components/LanguageSwitch';
import './App.css';

// Simple working version
function SimpleApp() {
  const [idea, setIdea] = useState('');
  const [spec, setSpec] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking'); // checking, connected, disconnected
  const toast = useToast();
  const { t } = useTranslation();

  // 複製到剪貼簿功能
  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(spec);
      toast.showSuccess(t('messages.specCopied'));
    } catch (err) {
      // 備用方案：使用 textarea 複製
      const textArea = document.createElement('textarea');
      textArea.value = spec;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.showSuccess(t('messages.specCopied'));
    }
  };

  // 下載為 Markdown 文件
  const handleDownload = () => {
    try {
      const blob = new Blob([spec], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // 生成文件名（基於時間戳和想法的前幾個字）
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
      const ideaPrefix = idea.trim().slice(0, 20).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const filename = `spec_${ideaPrefix}_${timestamp}.md`;
      
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.showSuccess(t('messages.specDownloaded', { filename }));
    } catch (error) {
      console.error('Download failed:', error);
      toast.showError(t('messages.downloadFailed'));
    }
  };

  // Check API health on component mount
  useEffect(() => {
    const checkApiHealth = async () => {
      try {
        // Create AbortController for timeout functionality
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch('/api/health', {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log('API health check successful - button should be enabled');
          setApiStatus('connected');
        } else {
          console.warn('API health check failed with status:', response.status);
          setApiStatus('disconnected');
        }
      } catch (error) {
        console.warn('API health check failed:', error);
        setApiStatus('disconnected');
      }
    };

    checkApiHealth();
    
    // Set up periodic health checks every 30 seconds
    const healthCheckInterval = setInterval(checkApiHealth, 30000);
    
    return () => clearInterval(healthCheckInterval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!idea.trim()) {
      toast.showWarning(t('messages.enterIdea'));
      return;
    }

    if (idea.trim().length < 10) {
      toast.showWarning(t('messages.ideaTooShort'));
      return;
    }

    if (apiStatus === 'disconnected') {
      toast.showError(t('messages.apiNotAvailable'));
      return;
    }

    setLoading(true);
    try {
      console.log('Sending request to /api/generate with idea:', idea.trim());
      
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          idea: idea.trim() 
        }),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      const responseText = await response.text();
      console.log('Raw response text (first 200 chars):', responseText.substring(0, 200));

      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse error response as JSON:', parseError);
          throw new Error(`Server error: ${response.status} - ${responseText.substring(0, 100)}`);
        }
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse success response as JSON:', parseError);
        console.error('Response text:', responseText);
        throw new Error(t('messages.invalidResponse'));
      }
      
      console.log('Parsed data keys:', Object.keys(data));
      
      if (data.generatedSpec) {
        setSpec(data.generatedSpec);
        toast.showSuccess(t('messages.specGenerated'));
      } else if (data.specification) {
        setSpec(data.specification);
        toast.showSuccess(t('messages.specGenerated'));
      } else {
        console.error('Response data:', data);
        throw new Error('No specification received from server');
      }
    } catch (error) {
      console.error('Error generating specification:', error);
      
      let errorMessage = t('messages.generateFailed');
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = t('messages.connectionError');
      } else if (error.message.includes('Server error: 5')) {
        errorMessage = t('messages.serverError');
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.showError(errorMessage);
      setSpec(''); // Clear any previous specification
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-content">
          <div className="app__title-section">
            <h1 className="app__title">{t('app.title')}</h1>
            <p className="app__subtitle">
              {t('app.subtitle')}
            </p>
          </div>
          
          <div className="app__status">
            <div className={`app__status-indicator app__status-indicator--${apiStatus}`}>
              {apiStatus === 'checking' && t('status.checking')}
              {apiStatus === 'connected' && t('status.connected')}
              {apiStatus === 'disconnected' && t('status.disconnected')}
            </div>
            <LanguageSwitch />
          </div>
        </div>
      </header>

      <main className="app__main">
        <div className="app__content">
          <Card variant="elevated" className="app__input-card">
            <div className="md-card__content">
              <h3 className="md-card__title">{t('form.inputTitle')}</h3>
              <p className="md-card__description">
                {t('form.inputDescription')}
              </p>
              <form onSubmit={handleSubmit}>
                <TextField
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder={t('form.placeholder')}
                  multiline
                  rows={4}
                  disabled={loading}
                  variant="outlined"
                />
                <div className="app__form-actions">
                  <Button
                    type="submit"
                    variant="filled"
                    disabled={loading || !idea.trim() || apiStatus !== 'connected'}
                    loading={loading}
                    onClick={() => {
                      console.log('Button clicked - states:', { loading, idea: idea.trim(), apiStatus });
                    }}
                  >
                    {loading ? t('form.generating') : t('form.generateButton')}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
          
          <Card variant="elevated" className="app__output-card">
            <div className="md-card__content">
              <div className="spec-header">
                <h3 className="md-card__title">{t('specification.title')}</h3>
                {spec && (
                  <div className="spec-actions">
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleCopyToClipboard}
                      className="spec-action-btn"
                    >
                      📋 {t('specification.copyButton')}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small" 
                      onClick={handleDownload}
                      className="spec-action-btn"
                    >
                      💾 {t('specification.downloadButton')}
                    </Button>
                  </div>
                )}
              </div>
              {spec ? (
                <div className="specification-content markdown-content">
                  <ReactMarkdown>{spec}</ReactMarkdown>
                </div>
              ) : (
                <div className="placeholder">
                  {t('specification.placeholder')}
                </div>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

// Main App with providers
function App() {
  return (
    <ErrorBoundary>
      <ToastProvider maxToasts={3}>
        <SimpleApp />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;