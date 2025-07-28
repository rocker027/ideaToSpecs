/**
 * 伺服器配置模組
 * 集中管理所有伺服器設定和環境變數
 */

import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Joi from 'joi';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 基本伺服器配置
export const SERVER_CONFIG = {
  port: process.env.PORT || 3001,
  host: '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  version: '1.0.0'
};

// 資料庫配置
export const DATABASE_CONFIG = {
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '..', '..', 'database', 'local.db')}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
  connectionTimeout: 10000,
  queryTimeout: 30000
};

// 安全配置
export const SECURITY_CONFIG = {
  // CORS 設定
  cors: {
    origin: SERVER_CONFIG.nodeEnv === 'development' 
      ? ['http://localhost:3000', 'http://localhost:5173'] 
      : process.env.ALLOWED_ORIGINS?.split(',') || false,
    credentials: true,
    optionsSuccessStatus: 200
  },
  
  // Helmet 安全標頭
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: SERVER_CONFIG.nodeEnv === 'development' 
          ? ["'self'", "'unsafe-eval'"] 
          : ["'self'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        childSrc: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: SERVER_CONFIG.nodeEnv === 'production' ? [] : null
      }
    },
    crossOriginEmbedderPolicy: SERVER_CONFIG.nodeEnv === 'production',
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hidePoweredBy: true
  },
  
  // 速率限制配置
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: SERVER_CONFIG.nodeEnv === 'development' ? 1000 : 100,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // 生成端點專用速率限制
  generateRateLimit: {
    windowMs: 5 * 60 * 1000, // 5 分鐘
    max: SERVER_CONFIG.nodeEnv === 'development' ? 100 : 10,
    message: {
      error: 'Too many generation requests, please try again later.',
      retryAfter: '5 minutes'
    }
  }
};

// WebSocket 配置
export const WEBSOCKET_CONFIG = {
  cors: {
    origin: SERVER_CONFIG.nodeEnv === 'development' 
      ? ['http://localhost:3000', 'http://localhost:5173'] 
      : process.env.ALLOWED_ORIGINS?.split(',') || false,
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: false,
  maxHttpBufferSize: 1e6, // 1MB
  pingTimeout: 60000,
  pingInterval: 25000
};

// 日誌配置
export const LOGGING_CONFIG = {
  level: 'debug', // 強制設為 debug
  transport: SERVER_CONFIG.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
};

// Express 中間件配置
export const MIDDLEWARE_CONFIG = {
  json: {
    limit: '10mb'
  },
  urlencoded: {
    extended: true,
    limit: '10mb'
  },
  compression: {
    threshold: 1024,
    level: 6
  }
};

// 狀態監控配置
export const MONITORING_CONFIG = {
  title: 'Idea-to-Specs Status Monitor',
  path: '/status',
  spans: [
    { interval: 1, retention: 60 },    // 每秒記錄，保留 1 分鐘
    { interval: 5, retention: 60 },    // 每 5 秒記錄，保留 5 分鐘  
    { interval: 15, retention: 40 }    // 每 15 秒記錄，保留 10 分鐘
  ],
  chartVisibility: {
    cpu: true,
    mem: true,
    load: true,
    heap: true,
    responseTime: true,
    rps: true,
    statusCodes: true
  },
  healthChecks: [{
    protocol: 'http',
    host: 'localhost',
    path: '/api/health',
    port: SERVER_CONFIG.port
  }]
};

// Joi 驗證 schema
export const VALIDATION_SCHEMAS = {
  generateIdea: {
    idea: Joi.string().min(10).max(5000).required().messages({
      'string.min': 'Idea must be at least 10 characters long',
      'string.max': 'Idea cannot exceed 5000 characters',
      'any.required': 'Idea is required'
    })
  },
  
  historyQuery: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().max(200).optional()
  }
};

// 應用程式常數
export const APP_CONSTANTS = {
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 小時
  MAX_CONNECTIONS_PER_IP: SERVER_CONFIG.nodeEnv === 'development' ? 1000 : 100, // 開發環境允許更多連線
  SOCKET_EVENT_RATE_LIMIT: 50,
  SOCKET_EVENT_WINDOW: 60000, // 1 分鐘
  DATABASE_MAINTENANCE_INTERVAL: 24 * 60 * 60 * 1000, // 每日
  INITIAL_MAINTENANCE_DELAY: 5 * 60 * 1000, // 5 分鐘後執行首次維護
  GRACEFUL_SHUTDOWN_TIMEOUT: 30000 // 30 秒強制關閉超時
};

// 錯誤訊息
export const ERROR_MESSAGES = {
  VALIDATION_FAILED: 'Validation failed',
  AUTHENTICATION_REQUIRED: 'Authentication required',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  RESOURCE_NOT_FOUND: 'Resource not found',
  INTERNAL_SERVER_ERROR: 'Internal server error',
  SERVICE_UNAVAILABLE: 'Service unavailable',
  TOO_MANY_REQUESTS: 'Too many requests',
  WEBSOCKET_AUTH_FAILED: 'WebSocket authentication failed',
  WEBSOCKET_RATE_LIMIT: 'WebSocket connection rate limit exceeded'
};

// 成功訊息
export const SUCCESS_MESSAGES = {
  SPEC_GENERATED: 'Specification generated successfully',
  ENTRY_DELETED: 'Entry deleted successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful'
};

// API 端點資訊
export const API_ENDPOINTS = {
  'POST /api/generate': {
    description: 'Generate specification from idea using Gemini CLI',
    body: { idea: 'string (10-5000 chars)' },
    rateLimit: '10 requests per 5 minutes'
  },
  'GET /api/history': {
    description: 'Get paginated history with optional search',
    query: {
      page: 'number (default: 1)',
      limit: 'number (1-100, default: 20)',
      search: 'string (optional)'
    }
  },
  'GET /api/spec/:id': {
    description: 'Get specific specification by ID',
    params: { id: 'integer' }
  },
  'GET /api/download/:id': {
    description: 'Download specification as Markdown file',
    params: { id: 'integer' }
  },
  'DELETE /api/history/:id': {
    description: 'Delete specific history entry',
    params: { id: 'integer' }
  },
  'GET /api/health': {
    description: 'Health check and system status'
  },
  'GET /api/gemini/health': {
    description: 'Gemini CLI service health check'
  },
  'GET /status': {
    description: 'Status monitoring dashboard'
  }
};

// WebSocket 事件
export const WEBSOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  SUBSCRIBE_JOB: 'subscribe-job',
  UNSUBSCRIBE_JOB: 'unsubscribe-job',
  JOB_UPDATE: 'job-update',
  ERROR: 'error'
};

// 工作狀態
export const JOB_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing', 
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// 環境檢測輔助函數
export const isDevelopment = () => SERVER_CONFIG.nodeEnv === 'development';
export const isProduction = () => SERVER_CONFIG.nodeEnv === 'production';

// 配置驗證
export function validateConfig() {
  const requiredEnvVars = [];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn('Missing optional environment variables:', missingVars.join(', '));
  }
  
  // 驗證端口號
  if (isNaN(SERVER_CONFIG.port) || SERVER_CONFIG.port < 1 || SERVER_CONFIG.port > 65535) {
    throw new Error('Invalid PORT configuration');
  }
  
  return true;
}

// 預設導出
export default {
  SERVER_CONFIG,
  DATABASE_CONFIG,
  SECURITY_CONFIG,
  WEBSOCKET_CONFIG,
  LOGGING_CONFIG,
  MIDDLEWARE_CONFIG,
  MONITORING_CONFIG,
  VALIDATION_SCHEMAS,
  APP_CONSTANTS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  API_ENDPOINTS,
  WEBSOCKET_EVENTS,
  JOB_STATUSES,
  isDevelopment,
  isProduction,
  validateConfig
};