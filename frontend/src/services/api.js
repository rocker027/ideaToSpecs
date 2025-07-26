import axios from 'axios';
import { io } from 'socket.io-client';

// Base API configuration
const API_BASE_URL = 'http://localhost:3001/api';
const WEBSOCKET_URL = 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds timeout for API calls
  headers: {
    'Content-Type': 'application/json',
  },
});

// WebSocket connection management
let socket = null;
const jobSubscriptions = new Map();
const connectionCallbacks = new Set();

// Initialize WebSocket connection
const initializeWebSocket = () => {
  if (socket && socket.connected) {
    return socket;
  }
  
  socket = io(WEBSOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  });
  
  socket.on('connect', () => {
    console.log('WebSocket connected:', socket.id);
    connectionCallbacks.forEach(callback => callback({ connected: true, socketId: socket.id }));
  });
  
  socket.on('disconnect', (reason) => {
    console.log('WebSocket disconnected:', reason);
    connectionCallbacks.forEach(callback => callback({ connected: false, reason }));
  });
  
  socket.on('connect_error', (error) => {
    console.error('WebSocket connection error:', error);
    connectionCallbacks.forEach(callback => callback({ connected: false, error: error.message }));
  });
  
  socket.on('job-update', (update) => {
    console.log('Job update received:', update);
    const jobCallbacks = jobSubscriptions.get(update.jobId);
    if (jobCallbacks) {
      jobCallbacks.forEach(callback => {
        try {
          callback(update);
        } catch (error) {
          console.error('Error in job update callback:', error);
        }
      });
    }
  });
  
  return socket;
};

// WebSocket utilities
const websocketService = {
  // Connect to WebSocket
  connect: () => {
    return initializeWebSocket();
  },
  
  // Subscribe to job updates
  subscribeToJob: (jobId, callback) => {
    const socket = initializeWebSocket();
    
    if (!jobSubscriptions.has(jobId)) {
      jobSubscriptions.set(jobId, new Set());
    }
    
    jobSubscriptions.get(jobId).add(callback);
    socket.emit('subscribe-job', jobId);
    
    console.log(`Subscribed to job ${jobId}`);
    
    // Return unsubscribe function
    return () => {
      const callbacks = jobSubscriptions.get(jobId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          jobSubscriptions.delete(jobId);
          socket.emit('unsubscribe-job', jobId);
          console.log(`Unsubscribed from job ${jobId}`);
        }
      }
    };
  },
  
  // Add connection status listener
  onConnectionChange: (callback) => {
    connectionCallbacks.add(callback);
    
    // Return current status immediately if connected
    if (socket && socket.connected) {
      callback({ connected: true, socketId: socket.id });
    }
    
    // Return remove function
    return () => {
      connectionCallbacks.delete(callback);
    };
  },
  
  // Get connection status
  isConnected: () => {
    return socket && socket.connected;
  },
  
  // Disconnect WebSocket
  disconnect: () => {
    if (socket) {
      socket.disconnect();
      socket = null;
      jobSubscriptions.clear();
      connectionCallbacks.clear();
    }
  }
};

// API endpoints
export const apiService = {
  // Generate specification from idea with real-time updates
  generateSpec: async (idea, onProgress = null) => {
    try {
      const response = await api.post('/generate', { idea });
      const { jobId } = response.data;
      
      // If progress callback is provided, set up WebSocket subscription
      if (onProgress && jobId) {
        const unsubscribe = websocketService.subscribeToJob(jobId, (update) => {
          onProgress(update);
          
          // Auto-unsubscribe when job is completed or failed
          if (update.status === 'completed' || update.status === 'failed') {
            setTimeout(() => {
              unsubscribe();
            }, 1000); // Small delay to ensure final update is processed
          }
        });
        
        // Return enhanced response with unsubscribe function
        return {
          ...response.data,
          unsubscribe
        };
      }
      
      return response.data;
    } catch (error) {
      console.error('API Error - Generate Spec:', error);
      throw {
        message: error.response?.data?.error || 'Failed to generate specification',
        status: error.response?.status || 500
      };
    }
  },
  
  // Poll job status (fallback for when WebSocket is not available)
  pollJobStatus: async (jobId) => {
    try {
      const response = await api.get(`/job/${jobId}/status`);
      return response.data;
    } catch (error) {
      console.error('API Error - Poll Job Status:', error);
      throw {
        message: error.response?.data?.error || 'Failed to get job status',
        status: error.response?.status || 500
      };
    }
  },
  
  // Generate spec with automatic fallback to polling if WebSocket fails
  generateSpecWithFallback: async (idea, onProgress = null) => {
    const result = await apiService.generateSpec(idea, onProgress);
    
    // If WebSocket is not available or fails, fall back to polling
    if (!websocketService.isConnected() && onProgress && result.jobId) {
      console.log('WebSocket not available, falling back to polling');
      
      const pollInterval = setInterval(async () => {
        try {
          const status = await apiService.pollJobStatus(result.jobId);
          
          onProgress({
            jobId: result.jobId,
            status: status.status,
            timestamp: new Date().toISOString(),
            ...status
          });
          
          // Stop polling when job is completed or failed
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval);
          }
        } catch (error) {
          console.error('Polling error:', error);
          clearInterval(pollInterval);
        }
      }, 2000); // Poll every 2 seconds
      
      // Return result with stop polling function
      return {
        ...result,
        stopPolling: () => clearInterval(pollInterval)
      };
    }
    
    return result;
  },

  // Get history with pagination and search
  getHistory: async (page = 1, limit = 10, search = '') => {
    try {
      const response = await api.get('/history', {
        params: { page, limit, search }
      });
      return response.data;
    } catch (error) {
      console.error('API Error - Get History:', error);
      throw {
        message: error.response?.data?.error || 'Failed to fetch history',
        status: error.response?.status || 500
      };
    }
  },

  // Get single specification by ID
  getSpec: async (id) => {
    try {
      const response = await api.get(`/spec/${id}`);
      return response.data;
    } catch (error) {
      console.error('API Error - Get Spec:', error);
      throw {
        message: error.response?.data?.error || 'Failed to fetch specification',
        status: error.response?.status || 500
      };
    }
  },

  // Download specification as Markdown
  downloadSpec: async (id) => {
    try {
      const response = await api.get(`/download/${id}`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `specification-${id}.md`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      return true;
    } catch (error) {
      console.error('API Error - Download Spec:', error);
      throw {
        message: error.response?.data?.error || 'Failed to download specification',
        status: error.response?.status || 500
      };
    }
  },

  // Delete specification
  deleteSpec: async (id) => {
    try {
      const response = await api.delete(`/history/${id}`);
      return response.data;
    } catch (error) {
      console.error('API Error - Delete Spec:', error);
      throw {
        message: error.response?.data?.error || 'Failed to delete specification',
        status: error.response?.status || 500
      };
    }
  },

  // Health check
  healthCheck: async () => {
    try {
      const response = await api.get('/health');
      return response.data;
    } catch (error) {
      console.error('API Error - Health Check:', error);
      throw {
        message: error.response?.data?.error || 'Backend service unavailable',
        status: error.response?.status || 500
      };
    }
  }
};

// Utility functions
export const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      return true;
    }
  } catch (error) {
    console.error('Copy to clipboard failed:', error);
    return false;
  }
};

// Enhanced API service with WebSocket support
const enhancedApiService = {
  // Include all existing API methods
  ...apiService,
  
  // Add WebSocket service
  websocket: websocketService,
  
  // Convenience method to initialize everything
  initialize: () => {
    websocketService.connect();
    return enhancedApiService;
  },
  
  // Cleanup method
  cleanup: () => {
    websocketService.disconnect();
  }
};

export { websocketService };
export default enhancedApiService;