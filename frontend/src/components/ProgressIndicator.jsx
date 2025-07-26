import { useState, useEffect } from 'react';
import './ProgressIndicator.css';

const PROGRESS_STAGES = {
  started: { label: 'Starting...', progress: 10 },
  processing: { label: 'Processing your idea...', progress: 50 },
  completed: { label: 'Completed!', progress: 100 },
  failed: { label: 'Failed', progress: 0 }
};

function ProgressIndicator({ 
  status = 'idle', 
  message = '', 
  jobId = null,
  onCancel = null,
  showDetails = false 
}) {
  const [currentStage, setCurrentStage] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState(null);

  // Timer for elapsed time
  useEffect(() => {
    let interval = null;
    
    if (status === 'started' || status === 'processing') {
      if (!startTime) {
        setStartTime(Date.now());
      }
      
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (startTime || Date.now())) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    } else if (status === 'completed' || status === 'failed') {
      if (interval) {
        clearInterval(interval);
      }
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status, startTime]);

  // Update progress based on status
  useEffect(() => {
    if (status in PROGRESS_STAGES) {
      setCurrentStage(status);
      const targetProgress = PROGRESS_STAGES[status].progress;
      
      // Animate progress bar
      const startProgress = progress;
      const duration = 500; // 500ms animation
      const startTime = Date.now();
      
      const animateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progressRatio = Math.min(elapsed / duration, 1);
        const currentProgress = startProgress + (targetProgress - startProgress) * progressRatio;
        
        setProgress(currentProgress);
        
        if (progressRatio < 1) {
          requestAnimationFrame(animateProgress);
        }
      };
      
      requestAnimationFrame(animateProgress);
    } else if (status === 'idle') {
      setProgress(0);
      setCurrentStage('idle');
      setElapsedTime(0);
      setStartTime(null);
    }
  }, [status]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'started':
      case 'processing':
        return (
          <div className="progress-indicator__spinner">
            <svg viewBox="0 0 24 24" className="progress-indicator__spinner-svg">
              <circle 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="2" 
                fill="none" 
                strokeLinecap="round"
                strokeDasharray="31.416"
                strokeDashoffset="31.416"
              />
            </svg>
          </div>
        );
      case 'completed':
        return (
          <svg className="progress-indicator__icon progress-indicator__icon--success" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="progress-indicator__icon progress-indicator__icon--error" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  if (status === 'idle') {
    return null;
  }

  return (
    <div className={`progress-indicator progress-indicator--${status}`}>
      <div className="progress-indicator__header">
        <div className="progress-indicator__status">
          {getStatusIcon()}
          <span className="progress-indicator__label">
            {message || PROGRESS_STAGES[status]?.label || 'Processing...'}
          </span>
        </div>
        
        {onCancel && (status === 'started' || status === 'processing') && (
          <button 
            onClick={onCancel}
            className="progress-indicator__cancel"
            aria-label="Cancel generation"
          >
            Cancel
          </button>
        )}
      </div>

      {(status === 'started' || status === 'processing') && (
        <div className="progress-indicator__progress">
          <div className="progress-indicator__progress-bar">
            <div 
              className="progress-indicator__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="progress-indicator__percentage">
            {Math.round(progress)}%
          </span>
        </div>
      )}

      {showDetails && (
        <div className="progress-indicator__details">
          {jobId && (
            <div className="progress-indicator__job-id">
              Job ID: <code>{jobId}</code>
            </div>
          )}
          {elapsedTime > 0 && (
            <div className="progress-indicator__time">
              Elapsed: {formatTime(elapsedTime)}
            </div>
          )}
          {status === 'processing' && (
            <div className="progress-indicator__estimate">
              Estimated time: 30-120 seconds
            </div>
          )}
        </div>
      )}

      {status === 'failed' && (
        <div className="progress-indicator__error-details">
          <p>Generation failed. This could be due to:</p>
          <ul>
            <li>Network connectivity issues</li>
            <li>Gemini AI service unavailable</li>
            <li>Invalid input format</li>
          </ul>
          <p>Please try again or check your connection.</p>
        </div>
      )}
    </div>
  );
}

export default ProgressIndicator;