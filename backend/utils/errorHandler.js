/**
 * 標準化錯誤處理工具
 * 提供錯誤包裝、分類和格式化功能
 */

import { 
  ERROR_CODES, 
  ERROR_CODE_TO_TYPE, 
  ERROR_CODE_TO_SEVERITY, 
  ERROR_CODE_TO_HTTP_STATUS, 
  USER_FRIENDLY_MESSAGES,
  ERROR_TYPES,
  ERROR_SEVERITY
} from './errorTypes.js';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

const logger = pino();

/**
 * 標準化錯誤類別
 */
export class AppError extends Error {
  constructor(code, message, originalError = null, metadata = {}) {
    super(message);
    
    this.name = 'AppError';
    this.code = code;
    this.type = ERROR_CODE_TO_TYPE[code] || ERROR_TYPES.UNKNOWN;
    this.severity = ERROR_CODE_TO_SEVERITY[code] || ERROR_SEVERITY.MEDIUM;
    this.statusCode = ERROR_CODE_TO_HTTP_STATUS[code] || 500;
    this.userMessage = USER_FRIENDLY_MESSAGES[code] || message;
    this.originalError = originalError;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
    this.requestId = null; // 將在中間件中設置
    
    // 捕獲堆疊信息
    Error.captureStackTrace(this, AppError);
  }

  /**
   * 設置請求 ID
   */
  setRequestId(requestId) {
    this.requestId = requestId;
    return this;
  }

  /**
   * 添加元數據
   */
  addMetadata(key, value) {
    this.metadata[key] = value;
    return this;
  }

  /**
   * 轉換為 JSON 格式
   */
  toJSON() {
    return {
      error: this.userMessage,
      code: this.code,
      type: this.type,
      severity: this.severity,
      timestamp: this.timestamp,
      requestId: this.requestId,
      metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined
    };
  }

  /**
   * 轉換為詳細格式（開發環境用）
   */
  toDetailedJSON() {
    return {
      ...this.toJSON(),
      message: this.message,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
  }
}

/**
 * 錯誤工廠函數
 */
export const createError = {
  // 驗證錯誤
  validation: (message, field = null) => 
    new AppError(ERROR_CODES.VALIDATION_FAILED, message, null, { field }),
  
  invalidInput: (field, value = null) => 
    new AppError(ERROR_CODES.INVALID_INPUT, `Invalid input for field: ${field}`, null, { field, value }),
  
  missingField: (field) => 
    new AppError(ERROR_CODES.MISSING_REQUIRED_FIELD, `Missing required field: ${field}`, null, { field }),
  
  invalidFormat: (field, expectedFormat) => 
    new AppError(ERROR_CODES.INVALID_FORMAT, `Invalid format for field: ${field}`, null, { field, expectedFormat }),

  // 認證錯誤
  authenticationFailed: (reason = null) => 
    new AppError(ERROR_CODES.AUTHENTICATION_FAILED, 'Authentication failed', null, { reason }),
  
  tokenExpired: (tokenType = 'access') => 
    new AppError(ERROR_CODES.TOKEN_EXPIRED, 'Token has expired', null, { tokenType }),
  
  tokenInvalid: (tokenType = 'access') => 
    new AppError(ERROR_CODES.TOKEN_INVALID, 'Token is invalid', null, { tokenType }),

  // 授權錯誤
  authorizationFailed: (resource = null, action = null) => 
    new AppError(ERROR_CODES.AUTHORIZATION_FAILED, 'Authorization failed', null, { resource, action }),
  
  accessDenied: (resource = null) => 
    new AppError(ERROR_CODES.ACCESS_DENIED, 'Access denied', null, { resource }),

  // 資源錯誤
  notFound: (resource, id = null) => 
    new AppError(ERROR_CODES.RESOURCE_NOT_FOUND, `${resource} not found`, null, { resource, id }),
  
  endpointNotFound: (path, method) => 
    new AppError(ERROR_CODES.ENDPOINT_NOT_FOUND, `Endpoint not found: ${method} ${path}`, null, { path, method }),

  // 衝突錯誤
  conflict: (resource, reason = null) => 
    new AppError(ERROR_CODES.RESOURCE_CONFLICT, `Resource conflict: ${resource}`, null, { resource, reason }),
  
  duplicateEntry: (field, value = null) => 
    new AppError(ERROR_CODES.DUPLICATE_ENTRY, `Duplicate entry for field: ${field}`, null, { field, value }),

  // 速率限制
  rateLimitExceeded: (limit, windowMs, endpoint = null) => 
    new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded', null, { limit, windowMs, endpoint }),

  // 系統錯誤
  internalError: (message = 'Internal server error', originalError = null) => 
    new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, message, originalError),
  
  serviceUnavailable: (service = null, reason = null) => 
    new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, 'Service unavailable', null, { service, reason }),
  
  configurationError: (setting, value = null) => 
    new AppError(ERROR_CODES.CONFIGURATION_ERROR, `Configuration error: ${setting}`, null, { setting, value }),

  // 資料庫錯誤
  databaseConnectionFailed: (originalError = null) => 
    new AppError(ERROR_CODES.DATABASE_CONNECTION_FAILED, 'Database connection failed', originalError),
  
  databaseQueryFailed: (query = null, originalError = null) => 
    new AppError(ERROR_CODES.DATABASE_QUERY_FAILED, 'Database query failed', originalError, { query }),
  
  databaseTimeout: (operation = null) => 
    new AppError(ERROR_CODES.DATABASE_TIMEOUT, 'Database operation timeout', null, { operation }),

  // 外部服務錯誤
  externalServiceError: (service, originalError = null) => 
    new AppError(ERROR_CODES.EXTERNAL_SERVICE_ERROR, `External service error: ${service}`, originalError, { service }),
  
  geminiCliError: (operation = null, originalError = null) => 
    new AppError(ERROR_CODES.GEMINI_CLI_ERROR, 'Gemini CLI error', originalError, { operation }),
  
  geminiCliTimeout: (timeout = null) => 
    new AppError(ERROR_CODES.GEMINI_CLI_TIMEOUT, 'Gemini CLI timeout', null, { timeout }),
  
  geminiCliNotAvailable: (reason = null) => 
    new AppError(ERROR_CODES.GEMINI_CLI_NOT_AVAILABLE, 'Gemini CLI not available', null, { reason }),
  
  geminiCliAuthFailed: (originalError = null) => 
    new AppError(ERROR_CODES.GEMINI_CLI_AUTH_FAILED, 'Gemini CLI authentication failed', originalError),

  // 網路錯誤
  networkError: (originalError = null) => 
    new AppError(ERROR_CODES.NETWORK_ERROR, 'Network error', originalError),
  
  connectionTimeout: (timeout = null, host = null) => 
    new AppError(ERROR_CODES.CONNECTION_TIMEOUT, 'Connection timeout', null, { timeout, host }),
  
  connectionRefused: (host = null, port = null) => 
    new AppError(ERROR_CODES.CONNECTION_REFUSED, 'Connection refused', null, { host, port }),

  // WebSocket 錯誤
  websocketConnectionFailed: (reason = null) => 
    new AppError(ERROR_CODES.WEBSOCKET_CONNECTION_FAILED, 'WebSocket connection failed', null, { reason }),
  
  websocketSendFailed: (messageType = null) => 
    new AppError(ERROR_CODES.WEBSOCKET_SEND_FAILED, 'WebSocket send failed', null, { messageType }),

  // 未知錯誤
  unknown: (message = 'Unknown error', originalError = null) => 
    new AppError(ERROR_CODES.UNKNOWN_ERROR, message, originalError)
};

/**
 * 錯誤分類器 - 將原生錯誤轉換為 AppError
 */
export const classifyError = (error, context = {}) => {
  // 如果已經是 AppError，直接返回
  if (error instanceof AppError) {
    return error;
  }

  // 根據錯誤類型和訊息進行分類
  const errorMessage = error.message || 'Unknown error';
  const errorName = error.name || 'Error';

  // 資料庫錯誤
  if (error.code === 'SQLITE_CONSTRAINT' || errorMessage.includes('UNIQUE constraint')) {
    return createError.duplicateEntry('unknown', null);
  }
  
  if (error.code === 'SQLITE_BUSY' || errorMessage.includes('database is locked')) {
    return createError.databaseTimeout('query');
  }
  
  if (errorMessage.includes('no such table') || errorMessage.includes('no such column')) {
    return createError.databaseQueryFailed(errorMessage, error);
  }

  // 網路錯誤
  if (error.code === 'ENOTFOUND') {
    return createError.networkError(error);
  }
  
  if (error.code === 'ECONNREFUSED') {
    return createError.connectionRefused(error.address, error.port);
  }
  
  if (error.code === 'ETIMEDOUT' || errorMessage.includes('timeout')) {
    return createError.connectionTimeout(error.timeout, error.host);
  }

  // Gemini CLI 錯誤
  if (errorMessage.includes('gemini') || errorMessage.includes('Gemini')) {
    if (errorMessage.includes('timeout')) {
      return createError.geminiCliTimeout(error.timeout);
    }
    if (errorMessage.includes('auth') || errorMessage.includes('authentication')) {
      return createError.geminiCliAuthFailed(error);
    }
    if (errorMessage.includes('not found') || errorMessage.includes('command not found')) {
      return createError.geminiCliNotAvailable('CLI not installed');
    }
    return createError.geminiCliError(context.operation, error);
  }

  // 驗證錯誤
  if (errorName === 'ValidationError' || errorMessage.includes('validation')) {
    return createError.validation(errorMessage, context.field);
  }

  // HTTP 錯誤
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;
    if (status === 404) {
      return createError.notFound(context.resource || 'Resource', context.id);
    }
    if (status === 401) {
      return createError.authenticationFailed(errorMessage);
    }
    if (status === 403) {
      return createError.authorizationFailed(context.resource, context.action);
    }
    if (status === 409) {
      return createError.conflict(context.resource || 'Resource', errorMessage);
    }
    if (status === 429) {
      return createError.rateLimitExceeded(null, null, context.endpoint);
    }
  }

  // 系統錯誤
  if (error.code === 'ENOENT') {
    return createError.notFound('File', context.path);
  }

  // 默認為內部錯誤
  return createError.internalError(errorMessage, error);
};

/**
 * 錯誤日誌記錄器
 */
export const logError = (error, context = {}) => {
  const logData = {
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      type: error.type,
      severity: error.severity,
      requestId: error.requestId,
      metadata: error.metadata
    },
    context,
    timestamp: new Date().toISOString()
  };

  // 根據嚴重程度選擇日誌等級
  switch (error.severity) {
    case ERROR_SEVERITY.LOW:
      logger.debug(logData, 'Low severity error');
      break;
    case ERROR_SEVERITY.MEDIUM:
      logger.warn(logData, 'Medium severity error');
      break;
    case ERROR_SEVERITY.HIGH:
      logger.error(logData, 'High severity error');
      break;
    case ERROR_SEVERITY.CRITICAL:
      logger.fatal(logData, 'Critical error');
      break;
    default:
      logger.error(logData, 'Error');
  }

  // 對於高嚴重程度錯誤，記錄堆疊
  if (error.severity === ERROR_SEVERITY.HIGH || error.severity === ERROR_SEVERITY.CRITICAL) {
    logger.error({ stack: error.stack }, 'Error stack trace');
  }
};

/**
 * 非同步錯誤包裝器
 */
export const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 錯誤回應格式化器
 */
export const formatErrorResponse = (error, isDevelopment = false) => {
  // 確保是 AppError 實例
  if (!(error instanceof AppError)) {
    error = classifyError(error);
  }

  const response = error.toJSON();

  // 在開發環境中添加詳細信息
  if (isDevelopment) {
    const detailed = error.toDetailedJSON();
    response.details = detailed.message;
    response.stack = detailed.stack;
    response.originalError = detailed.originalError;
  }

  return response;
};

/**
 * 請求 ID 生成器
 */
export const generateRequestId = () => {
  return uuidv4();
};