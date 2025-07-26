import ReactMarkdown from 'react-markdown';
import ActionButtons from './ActionButtons';
import './SpecificationPreview.css';

const SpecificationPreview = ({ 
  specification, 
  userInput, 
  specId = null,
  loading = false,
  onCopy,
  onDownload 
}) => {
  if (loading) {
    return (
      <div className="spec-preview spec-preview--loading">
        <div className="spec-preview__loading">
          <div className="spec-preview__spinner"></div>
          <h3>Generating your specification...</h3>
          <p>This may take a few moments as we analyze your idea and create a detailed specification.</p>
        </div>
      </div>
    );
  }

  if (!specification) {
    return (
      <div className="spec-preview spec-preview--empty">
        <div className="spec-preview__empty">
          <div className="spec-preview__empty-icon">📄</div>
          <h3>No specification yet</h3>
          <p>Enter your idea above to generate a detailed product specification.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="spec-preview">
      <div className="spec-preview__header">
        <div className="spec-preview__title">
          <h2>Generated Specification</h2>
          {userInput && (
            <p className="spec-preview__original-idea">
              <strong>Original idea:</strong> {userInput.length > 100 ? `${userInput.substring(0, 100)}...` : userInput}
            </p>
          )}
        </div>
        
        <ActionButtons
          specification={specification}
          specId={specId}
          onCopy={onCopy}
          onDownload={onDownload}
        />
      </div>
      
      <div className="spec-preview__content">
        <div className="spec-preview__markdown">
          <ReactMarkdown
            components={{
              // Custom rendering for better styling
              h1: ({ children, ...props }) => <h1 className="spec-h1" {...props}>{children}</h1>,
              h2: ({ children, ...props }) => <h2 className="spec-h2" {...props}>{children}</h2>,
              h3: ({ children, ...props }) => <h3 className="spec-h3" {...props}>{children}</h3>,
              h4: ({ children, ...props }) => <h4 className="spec-h4" {...props}>{children}</h4>,
              p: ({ children, ...props }) => <p className="spec-p" {...props}>{children}</p>,
              ul: ({ children, ...props }) => <ul className="spec-ul" {...props}>{children}</ul>,
              ol: ({ children, ...props }) => <ol className="spec-ol" {...props}>{children}</ol>,
              li: ({ children, ...props }) => <li className="spec-li" {...props}>{children}</li>,
              blockquote: ({ children, ...props }) => <blockquote className="spec-blockquote" {...props}>{children}</blockquote>,
              code: ({ inline, children, ...props }) => 
                inline ? 
                  <code className="spec-code-inline" {...props}>{children}</code> : 
                  <code className="spec-code-block" {...props}>{children}</code>,
              pre: ({ children, ...props }) => <pre className="spec-pre" {...props}>{children}</pre>,
              table: ({ children, ...props }) => (
                <div className="spec-table-wrapper">
                  <table className="spec-table" {...props}>{children}</table>
                </div>
              ),
              th: ({ children, ...props }) => <th className="spec-th" {...props}>{children}</th>,
              td: ({ children, ...props }) => <td className="spec-td" {...props}>{children}</td>,
              hr: ({ ...props }) => <hr className="spec-hr" {...props} />,
              a: ({ children, href, ...props }) => (
                <a 
                  className="spec-link" 
                  href={href} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  {...props}
                >
                  {children}
                </a>
              ),
            }}
          >
            {specification}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default SpecificationPreview;