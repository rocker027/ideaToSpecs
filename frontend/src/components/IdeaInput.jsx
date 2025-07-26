import { useState } from 'react';
import './IdeaInput.css';

const IdeaInput = ({ onSubmit, loading = false, disabled = false }) => {
  const [userInput, setUserInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (disabled || loading) {
      return;
    }
    
    // Validation
    if (!userInput.trim()) {
      setError('Please enter your idea or description');
      return;
    }
    
    if (userInput.trim().length < 10) {
      setError('Please provide more details (at least 10 characters)');
      return;
    }

    setError('');
    
    try {
      await onSubmit(userInput.trim());
      setUserInput(''); // Clear input on successful submission
    } catch (err) {
      setError(err.message || 'Failed to generate specification');
    }
  };

  const handleInputChange = (e) => {
    setUserInput(e.target.value);
    if (error) setError(''); // Clear error when user starts typing
  };

  const handleKeyDown = (e) => {
    // Allow Ctrl+Enter or Cmd+Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <div className="idea-input">
      <h2>Describe your idea</h2>
      <p className="idea-input__description">
        Enter your product idea, feature request, or concept. The more details you provide, 
        the better the specification will be.
      </p>
      
      <form onSubmit={handleSubmit} className="idea-input__form">
        <div className="idea-input__field">
          <textarea
            value={userInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Example: I want to build a mobile app that helps users track their daily water intake, set reminders, and visualize their hydration progress over time..."
            className={`idea-input__textarea ${error ? 'idea-input__textarea--error' : ''} ${disabled ? 'idea-input__textarea--disabled' : ''}`}
            rows={6}
            maxLength={2000}
            disabled={loading || disabled}
          />
          <div className="idea-input__char-count">
            {userInput.length}/2000 characters
          </div>
        </div>
        
        {error && (
          <div className="idea-input__error" role="alert">
            {error}
          </div>
        )}
        
        <button
          type="submit"
          className="idea-input__submit"
          disabled={loading || disabled || !userInput.trim()}
        >
          {loading ? (
            <>
              <span className="idea-input__spinner"></span>
              Generating Specification...
            </>
          ) : (
            'Generate Specification'
          )}
        </button>
        
        <div className="idea-input__tips">
          <strong>Pro tip:</strong> Use Ctrl+Enter (Windows) or Cmd+Enter (Mac) to submit quickly
        </div>
      </form>
    </div>
  );
};

export default IdeaInput;