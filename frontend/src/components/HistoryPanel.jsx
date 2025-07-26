import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import './HistoryPanel.css';

const HistoryPanel = ({ onSelectHistory, currentSpecId = null }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage] = useState(10);
  const [deleteLoading, setDeleteLoading] = useState({});

  // Load history when component mounts or when search/page changes
  useEffect(() => {
    loadHistory();
  }, [currentPage, searchTerm]);

  const loadHistory = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await apiService.getHistory(currentPage, itemsPerPage, searchTerm);
      setHistory(response.data || []);
      setCurrentPage(response.currentPage || 1);
      setTotalPages(response.totalPages || 1);
      setTotalItems(response.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleSelectHistory = async (historyItem) => {
    try {
      const fullSpec = await apiService.getSpec(historyItem.id);
      onSelectHistory({
        id: fullSpec.id,
        userInput: fullSpec.user_input,
        specification: fullSpec.generated_spec,
        createdAt: fullSpec.created_at
      });
    } catch (err) {
      setError(err.message || 'Failed to load specification');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this specification?')) {
      return;
    }

    setDeleteLoading(prev => ({ ...prev, [id]: true }));
    
    try {
      await apiService.deleteSpec(id);
      // Reload history after deletion
      await loadHistory();
      
      // If the deleted item was currently selected, clear the selection
      if (currentSpecId === id) {
        onSelectHistory(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete specification');
    } finally {
      setDeleteLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateText = (text, maxLength = 60) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="history-panel">
      <div className="history-panel__header">
        <h3>Previous Specifications</h3>
        <div className="history-panel__search">
          <input
            type="text"
            placeholder="Search specifications..."
            value={searchTerm}
            onChange={handleSearch}
            className="history-panel__search-input"
          />
          <svg className="history-panel__search-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {error && (
        <div className="history-panel__error" role="alert">
          {error}
          <button 
            onClick={loadHistory} 
            className="history-panel__retry"
          >
            Retry
          </button>
        </div>
      )}

      <div className="history-panel__content">
        {loading ? (
          <div className="history-panel__loading">
            <div className="history-panel__spinner"></div>
            <p>Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="history-panel__empty">
            {searchTerm ? (
              <>
                <p>No specifications found matching "{searchTerm}"</p>
                <button 
                  onClick={() => setSearchTerm('')} 
                  className="history-panel__clear-search"
                >
                  Clear search
                </button>
              </>
            ) : (
              <p>No specifications generated yet. Create your first one above!</p>
            )}
          </div>
        ) : (
          <>
            <div className="history-panel__list">
              {history.map((item) => (
                <div
                  key={item.id}
                  className={`history-panel__item ${currentSpecId === item.id ? 'history-panel__item--active' : ''}`}
                >
                  <div 
                    className="history-panel__item-content"
                    onClick={() => handleSelectHistory(item)}
                  >
                    <div className="history-panel__item-text">
                      {truncateText(item.user_input)}
                    </div>
                    <div className="history-panel__item-date">
                      {formatDate(item.created_at)}
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    className="history-panel__delete"
                    disabled={deleteLoading[item.id]}
                    title="Delete specification"
                  >
                    {deleteLoading[item.id] ? (
                      <div className="history-panel__delete-spinner"></div>
                    ) : (
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="history-panel__pagination">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="history-panel__page-btn"
                >
                  Previous
                </button>
                
                <span className="history-panel__page-info">
                  Page {currentPage} of {totalPages} ({totalItems} total)
                </span>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="history-panel__page-btn"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;