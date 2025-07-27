import React, { useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastProvider';
import './App.fixed.css';

// Simple working version
function SimpleApp() {
  const [idea, setIdea] = useState('');
  const [spec, setSpec] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!idea.trim()) {
      toast.showWarning('Please enter an idea');
      return;
    }

    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSpec(`# Generated Specification for: "${idea}"\n\n## Overview\nThis is a sample specification based on your idea.\n\n## Features\n- Feature 1\n- Feature 2\n- Feature 3\n\n## Requirements\n- Requirement 1\n- Requirement 2`);
      toast.showSuccess('Specification generated!');
    } catch (error) {
      toast.showError('Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-content">
          <div className="app__title-section">
            <h1 className="app__title">Idea-to-Specs Generator</h1>
            <p className="app__subtitle">
              Transform your ideas into detailed product specifications
            </p>
          </div>
          
          <div className="app__status">
            <div className="app__status-indicator app__status-indicator--connected">
              Status: Ready
            </div>
          </div>
        </div>
      </header>

      <main className="app__main">
        <div className="app__content">
          <div className="app__input-section">
            <h3>Enter Your Idea</h3>
            <form onSubmit={handleSubmit}>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Describe your product idea here..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !idea.trim()}
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: loading ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Generating...' : 'Generate Specification'}
              </button>
            </form>
          </div>
          
          <div className="app__output-section">
            <h3>Generated Specification</h3>
            {spec ? (
              <div style={{
                whiteSpace: 'pre-wrap',
                backgroundColor: '#f8fafc',
                padding: '1rem',
                borderRadius: '0.375rem',
                border: '1px solid #e2e8f0'
              }}>
                {spec}
              </div>
            ) : (
              <div style={{ 
                color: '#6b7280',
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '2rem'
              }}>
                Your generated specification will appear here
              </div>
            )}
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
      <ToastProvider maxToasts={3}>
        <SimpleApp />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;