import { useState } from 'react';
import { copyToClipboard } from '../services/api';
import './ActionButtons.css';

const ActionButtons = ({ 
  specification, 
  specId = null, 
  onCopy = null, 
  onDownload = null 
}) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const handleCopy = async () => {
    try {
      const success = await copyToClipboard(specification);
      if (success) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        
        // Call parent callback if provided
        if (onCopy) {
          onCopy();
        }
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleDownload = async () => {
    if (!onDownload) return;
    
    try {
      setDownloadLoading(true);
      await onDownload(specId);
    } catch (error) {
      console.error('Failed to download specification:', error);
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <div className="action-buttons">
      <button
        onClick={handleCopy}
        className={`action-button action-button--copy ${copySuccess ? 'action-button--success' : ''}`}
        disabled={!specification}
        title="Copy specification to clipboard"
      >
        {copySuccess ? (
          <>
            <svg className="action-button__icon" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="action-button__icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
            </svg>
            Copy
          </>
        )}
      </button>

      {onDownload && (
        <button
          onClick={handleDownload}
          className="action-button action-button--download"
          disabled={!specification || downloadLoading}
          title="Download specification as Markdown file"
        >
          {downloadLoading ? (
            <>
              <div className="action-button__spinner"></div>
              Downloading...
            </>
          ) : (
            <>
              <svg className="action-button__icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Download
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default ActionButtons;