import React, { useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';

// Minimal working version to test basic functionality
function MinimalApp() {
  const [message, setMessage] = useState('Application is loading...');

  React.useEffect(() => {
    // Simple async operation to test
    setTimeout(() => {
      setMessage('✅ Application loaded successfully!');
    }, 1000);
  }, []);

  return (
    <div style={{ 
      padding: '40px', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f5f5',
      minHeight: '100vh'
    }}>
      <h1 style={{ color: '#333' }}>Idea-to-Specs Generator</h1>
      <p style={{ 
        fontSize: '18px',
        color: message.includes('✅') ? 'green' : 'orange'
      }}>
        {message}
      </p>
      
      {message.includes('✅') && (
        <div style={{ marginTop: '20px' }}>
          <button 
            onClick={() => setMessage('🔄 Button clicked!')}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Test Button
          </button>
        </div>
      )}
    </div>
  );
}

// Main App with error boundary and providers
function App() {
  return (
    <ErrorBoundary>
      <ToastProvider maxToasts={3}>
        <MinimalApp />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;