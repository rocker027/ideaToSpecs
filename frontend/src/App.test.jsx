import React from 'react';
import ErrorBoundary from './components/ErrorBoundary';

// Simplified test version of App
function TestApp() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Test App</h1>
      <p>If you can see this, React is working correctly.</p>
      <button onClick={() => console.log('Button clicked')}>
        Test Button
      </button>
    </div>
  );
}

// Test App with Error Boundary
function App() {
  return (
    <ErrorBoundary>
      <TestApp />
    </ErrorBoundary>
  );
}

export default App;