import React from 'react';

// Ultra minimal version for debugging
function App() {
  console.log('App component rendering...');
  
  return React.createElement('div', {
    style: {
      padding: '20px',
      fontSize: '18px',
      backgroundColor: '#f0f0f0',
      minHeight: '100vh'
    }
  }, [
    React.createElement('h1', { key: 'title' }, 'Debug App'),
    React.createElement('p', { key: 'message' }, 'If you see this, React is working!'),
    React.createElement('p', { key: 'timestamp' }, `Loaded at: ${new Date().toLocaleTimeString()}`)
  ]);
}

export default App;