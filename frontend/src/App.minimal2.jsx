import React, { useState } from 'react';
import AuthStatus from './components/AuthStatus';
import { SecureMarkdown } from './components/SecureMarkdown.jsx';
import AuthProvider, { useAuth } from './components/AuthProvider.jsx';
import LoginModal from './components/LoginModal.jsx';

// 內部應用組件（具有身份驗證功能）
function AppContent() {
  const { user, isLoading, apiRequest } = useAuth();
  const [idea, setIdea] = useState('');
  const [message, setMessage] = useState('Application loaded successfully!');
  const [generatedSpec, setGeneratedSpec] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!idea.trim() || idea.trim().length < 2) {
      setMessage('請至少輸入2個字符!');
      return;
    }

    setMessage('🔄 Generating specification...');
    setIsGenerating(true);
    setGeneratedSpec('');
    
    try {
      const response = await apiRequest('http://localhost:3001/api/generate', {
        method: 'POST',
        body: JSON.stringify({ idea: idea.trim() })
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.generatedSpec || result.specification) {
          const spec = result.generatedSpec || result.specification;
          setGeneratedSpec(spec);
          setMessage('✅ Specification generated successfully!');
          return;
        }
      }
      
      // Handle different error scenarios
      let errorMessage = '';
      
      if (response.status === 400) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.details && Array.isArray(errorData.details)) {
          errorMessage = `❌ Input validation failed: ${errorData.details.map(d => d.message).join(', ')}`;
        } else if (errorData.message) {
          errorMessage = `❌ ${errorData.message}`;
        } else {
          errorMessage = '❌ Invalid input. Please check your idea and try again.';
        }
      } else if (response.status === 404) {
        errorMessage = '❌ API endpoint not found. Please check if the backend server is running.';
      } else if (response.status === 500) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.message && errorData.message.includes('Gemini CLI')) {
          errorMessage = '❌ Gemini CLI configuration issue. Please check API key configuration.';
        } else {
          errorMessage = '❌ Server error occurred. Please try again later.';
        }
      } else if (response.status === 503) {
        errorMessage = '❌ Service temporarily unavailable. Please try again in a few moments.';
      } else {
        errorMessage = `❌ Request failed (Status: ${response.status}). Please try again.`;
      }
      
      throw new Error(errorMessage);
    } catch (error) {
      console.error('Generation failed:', error);
      
      // Handle network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        setMessage('❌ Cannot connect to server. Please check if backend is running on port 3001.');
      } else if (error.message.startsWith('❌')) {
        // Already formatted error message
        setMessage(error.message);
      } else {
        setMessage(`❌ Failed to generate specification: ${error.message}`);
      }
      
      setGeneratedSpec('');
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy to clipboard function
  const handleCopy = async () => {
    if (!generatedSpec) return;
    
    try {
      await navigator.clipboard.writeText(generatedSpec);
      setMessage('📋 Specification copied to clipboard!');
      setTimeout(() => setMessage('✅ Specification generated successfully!'), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      setMessage('❌ Failed to copy to clipboard');
    }
  };

  // Download as markdown file
  const handleDownload = () => {
    if (!generatedSpec) return;
    
    const blob = new Blob([generatedSpec], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${idea.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_')}_specification.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setMessage('💾 Specification downloaded!');
    setTimeout(() => setMessage('✅ Specification generated successfully!'), 2000);
  };

  // Clear all function
  const handleClear = () => {
    setIdea('');
    setGeneratedSpec('');
    setMessage('Application ready for new idea!');
  };

  return (
    <div style={{ 
      padding: '2rem', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f5f5',
      minHeight: '100vh'
    }}>
      <header style={{ 
        backgroundColor: 'white', 
        padding: '1rem', 
        borderRadius: '8px',
        marginBottom: '2rem',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, color: '#333' }}>Idea-to-Specs Generator</h1>
            <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
              Transform your ideas into specifications
            </p>
          </div>
          {user && (
            <div style={{ 
              fontSize: '0.9rem', 
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>👤 {user.username}</span>
              <span style={{ 
                backgroundColor: user.role === 'admin' ? '#10b981' : '#6b7280',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '3px',
                fontSize: '0.8rem'
              }}>
                {user.role}
              </span>
            </div>
          )}
        </div>
      </header>

      <main style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        {/* Gemini CLI Authentication Status */}
        <AuthStatus />
        
        <form onSubmit={handleSubmit} style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            💡 Enter your product idea:
          </label>
          
          {/* Example suggestions */}
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: '#e7f3ff',
            borderRadius: '4px',
            border: '1px solid #bee5eb'
          }}>
            <div style={{ fontSize: '0.9rem', color: '#0c5460', marginBottom: '0.5rem' }}>
              <strong>💡 範例想法 (點擊使用):</strong>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {[
                '製作一個todo list',
                '開發線上購物網站',
                '設計健身追蹤app',
                '建立學習管理系統',
                '創建社交媒體平台',
                '開發餐廳點餐系統'
              ].map((example, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setIdea(example)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: 'white',
                    border: '1px solid #bee5eb',
                    borderRadius: '3px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    color: '#0c5460'
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="描述你的產品想法... (例如: 製作一個todo list、開發線上購物網站、設計健身追蹤app)"
            rows={4}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem',
              boxSizing: 'border-box',
              resize: 'vertical'
            }}
          />
          
          {/* Character count */}
          <div style={{
            marginTop: '0.5rem',
            fontSize: '0.8rem',
            color: '#6c757d',
            textAlign: 'right'
          }}>
            {idea.length} characters {idea.length >= 2 ? '✅' : '⚠️'}
            {idea.length < 2 && ' (至少需要2個字符)'}
          </div>
          
          <div style={{ 
            marginTop: '1rem',
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap'
          }}>
            <button
              type="submit"
              disabled={isGenerating || idea.length < 2}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: (isGenerating || idea.length < 2) ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: (isGenerating || idea.length < 2) ? 'not-allowed' : 'pointer',
                opacity: (isGenerating || idea.length < 2) ? 0.7 : 1
              }}
            >
              {isGenerating ? '⏳ Generating...' : '🚀 Generate Specification'}
            </button>
            
            <button
              type="button"
              onClick={handleClear}
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: 'pointer'
              }}
            >
              🗑️ Clear
            </button>
          </div>
        </form>

        {/* Status Section */}
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '1rem', 
          borderRadius: '4px',
          border: '1px solid #e9ecef',
          marginBottom: '1rem'
        }}>
          <strong>Status:</strong> 
          <div style={{ 
            marginTop: '0.5rem',
            lineHeight: '1.5'
          }}>
            {message}
          </div>
          
          {/* Help section for Gemini CLI configuration */}
          {message.includes('Gemini CLI') && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: '#e7f3ff',
              borderRadius: '4px',
              border: '1px solid #bee5eb',
              fontSize: '0.9rem'
            }}>
              <div style={{ marginBottom: '0.5rem', fontWeight: 'bold', color: '#0c5460' }}>
                💡 How to configure Gemini CLI:
              </div>
              <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#0c5460' }}>
                <li>Get an API key from: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: '#0056b3' }}>Google AI Studio</a></li>
                <li>Run: <code style={{ backgroundColor: '#f8f9fa', padding: '2px 4px', borderRadius: '3px' }}>gemini config set api_key YOUR_API_KEY</code></li>
                <li>Test with: <code style={{ backgroundColor: '#f8f9fa', padding: '2px 4px', borderRadius: '3px' }}>gemini -p "test"</code></li>
              </ol>
            </div>
          )}
        </div>

        {/* Generated Specification Section */}
        {generatedSpec && (
          <div style={{
            backgroundColor: 'white',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            {/* Header with action buttons */}
            <div style={{
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              borderBottom: '1px solid #dee2e6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}>
              <h3 style={{ margin: 0, color: '#495057' }}>📄 Generated Specification</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={handleCopy}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  📋 Copy
                </button>
                <button
                  onClick={handleDownload}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  💾 Download
                </button>
              </div>
            </div>
            
            {/* Specification content */}
            <div style={{
              padding: '1.5rem',
              maxHeight: '400px',
              overflowY: 'auto',
              backgroundColor: '#fafafa'
            }}>
              <SecureMarkdown 
                content={generatedSpec}
                style={{
                  fontFamily: 'Monaco, "Lucida Console", monospace',
                  fontSize: '0.9rem'
                }}
                allowHtml={false}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <footer style={{
          marginTop: '2rem',
          padding: '1rem',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: '#6c757d',
          borderTop: '1px solid #e9ecef'
        }}>
          💡 Powered by AI • 🚀 Transform ideas into specifications • 
          {generatedSpec && (
            <span> • 📊 Specification length: {generatedSpec.length} characters</span>
          )}
        </footer>
      </main>
    </div>
  );
}

// 主要的 App 組件，包含身份驗證提供者
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;