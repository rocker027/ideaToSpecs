/**
 * 標準化錯誤處理中間件
 * 提供全域錯誤處理、請求 ID 追蹤和統一錯誤回應格式
 */

import { 
  AppError, 
  classifyError, 
  logError, 
  formatErrorResponse, 
  generateRequestId,
  createError 
} from '../utils/errorHandler.js';
import { isDevelopment } from '../config/serverConfig.js';
import pino from 'pino';

const logger = pino();

/**
 * 請求 ID 中間件
 * 為每個請求生成唯一 ID 並添加到請求和回應標頭中
 */
export const requestIdMiddleware = (req, res, next) => {
  // 從標頭獲取現有 ID 或生成新的
  const requestId = req.get('X-Request-ID') || generateRequestId();
  
  // 添加到請求對象
  req.requestId = requestId;
  req.id = requestId; // 向後兼容
  
  // 添加到回應標頭
  res.set('X-Request-ID', requestId);
  
  next();
};

/**
 * 404 錯誤處理中間件
 * 處理未匹配的路由
 */
export const notFoundHandler = (req, res, next) => {
  const error = createError.endpointNotFound(req.originalUrl, req.method);
  error.setRequestId(req.requestId);
  next(error);
};

/**
 * 全域錯誤處理中間件
 * 統一處理所有應用程式錯誤
 */
export const globalErrorHandler = (err, req, res, next) => {
  // 如果回應已經發送，將錯誤傳遞給預設的 Express 錯誤處理器
  if (res.headersSent) {
    return next(err);
  }

  // 確保錯誤是 AppError 實例
  let error = err instanceof AppError ? err : classifyError(err, {
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // 設置請求 ID
  if (req.requestId && !error.requestId) {
    error.setRequestId(req.requestId);
  }

  // 添加請求上下文到錯誤元數據
  error.addMetadata('path', req.path);
  error.addMetadata('method', req.method);
  error.addMetadata('userAgent', req.get('User-Agent'));
  error.addMetadata('ip', req.ip);

  // 記錄錯誤
  logError(error, {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    body: req.body,
    query: req.query,
    params: req.params
  });

  // 格式化錯誤回應
  const errorResponse = formatErrorResponse(error, isDevelopment());

  // 發送錯誤回應
  res.status(error.statusCode).json(errorResponse);
};

/**
 * 非同步錯誤捕獲中間件
 * 為路由處理器提供自動錯誤捕獲
 */
export const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      // 確保錯誤有請求 ID
      if (error instanceof AppError && req.requestId) {
        error.setRequestId(req.requestId);
      }
      next(error);
    });
  };
};

/**
 * 驗證錯誤處理中間件
 * 處理 Joi 驗證錯誤
 */
export const validationErrorHandler = (error, req, res, next) => {
  if (error.name === 'ValidationError' && error.details) {
    const validationError = createError.validation(
      'Request validation failed',
      error.details[0].path.join('.')
    );
    
    validationError.setRequestId(req.requestId);
    validationError.addMetadata('validationDetails', error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    })));
    
    return next(validationError);
  }
  
  next(error);
};

/**
 * 速率限制錯誤處理中間件
 * 處理 express-rate-limit 錯誤
 */
export const rateLimitErrorHandler = (error, req, res, next) => {
  if (error.status === 429 || error.code === 'RATE_LIMITED') {
    const rateLimitError = createError.rateLimitExceeded(
      error.limit,
      error.windowMs,
      req.path
    );
    
    rateLimitError.setRequestId(req.requestId);
    rateLimitError.addMetadata('retryAfter', error.retryAfter);
    rateLimitError.addMetadata('remaining', error.remaining);
    
    return next(rateLimitError);
  }
  
  next(error);
};

/**
 * 資料庫錯誤處理中間件
 * 處理資料庫相關錯誤
 */
export const databaseErrorHandler = (error, req, res, next) => {
  // SQLite/libSQL 錯誤
  if (error.code && error.code.startsWith('SQLITE_')) {
    let dbError;
    
    switch (error.code) {
      case 'SQLITE_CONSTRAINT':
      case 'SQLITE_CONSTRAINT_UNIQUE':
        dbError = createError.duplicateEntry('unknown', null);
        break;
      case 'SQLITE_BUSY':
        dbError = createError.databaseTimeout('query');
        break;
      case 'SQLITE_NOTFOUND':
        dbError = createError.notFound('Database record', null);
        break;
      default:
        dbError = createError.databaseQueryFailed(error.message, error);
    }
    
    dbError.setRequestId(req.requestId);
    dbError.addMetadata('sqliteCode', error.code);
    
    return next(dbError);
  }
  
  // Turso/libSQL 特定錯誤
  if (error.message && error.message.includes('libsql')) {
    const dbError = createError.databaseConnectionFailed(error);
    dbError.setRequestId(req.requestId);
    return next(dbError);
  }
  
  next(error);
};

/**
 * 外部服務錯誤處理中間件
 * 處理外部服務（如 Gemini CLI）錯誤
 */
export const externalServiceErrorHandler = (error, req, res, next) => {
  const errorMessage = error.message || '';
  
  // Gemini CLI 相關錯誤
  if (errorMessage.includes('gemini') || errorMessage.includes('Gemini')) {
    let geminiError;
    
    if (errorMessage.includes('timeout')) {
      geminiError = createError.geminiCliTimeout(error.timeout);
    } else if (errorMessage.includes('auth') || errorMessage.includes('login')) {
      geminiError = createError.geminiCliAuthFailed(error);
    } else if (errorMessage.includes('not found') || errorMessage.includes('command not found')) {
      geminiError = createError.geminiCliNotAvailable('CLI not installed or not in PATH');
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      geminiError = createError.rateLimitExceeded(null, null, 'Gemini API');
    } else {
      geminiError = createError.geminiCliError('generation', error);
    }
    
    geminiError.setRequestId(req.requestId);
    return next(geminiError);
  }
  
  // 其他外部服務錯誤
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    const serviceError = createError.externalServiceError('unknown', error);
    serviceError.setRequestId(req.requestId);
    return next(serviceError);
  }
  
  next(error);
};

/**
 * WebSocket 錯誤處理中間件
 * 處理 WebSocket 相關錯誤
 */
export const websocketErrorHandler = (error, context = {}) => {
  let wsError;
  
  if (error.message && error.message.includes('WebSocket')) {
    if (error.message.includes('connection')) {
      wsError = createError.websocketConnectionFailed(error.message);
    } else if (error.message.includes('send') || error.message.includes('emit')) {
      wsError = createError.websocketSendFailed(context.messageType);
    } else {
      wsError = createError.websocketConnectionFailed(error.message);
    }
  } else {
    wsError = createError.websocketConnectionFailed('Unknown WebSocket error');
  }
  
  if (context.requestId) {
    wsError.setRequestId(context.requestId);
  }
  
  return wsError;
};

/**
 * 健康檢查錯誤處理器
 * 為健康檢查端點提供特殊的錯誤處理
 */
export const healthCheckErrorHandler = (error, service = 'unknown') => {
  let healthError;
  
  if (error instanceof AppError) {
    return error;
  }
  
  // 根據服務類型創建適當的錯誤
  if (service === 'database') {
    healthError = createError.databaseConnectionFailed(error);
  } else if (service === 'gemini') {
    healthError = createError.geminiCliNotAvailable(error.message);
  } else if (service === 'websocket') {
    healthError = createError.websocketConnectionFailed(error.message);
  } else {
    healthError = createError.serviceUnavailable(service, error.message);
  }
  
  return healthError;
};

/**
 * 統一錯誤處理中間件堆疊
 * 按順序應用所有錯誤處理中間件
 */
export const errorHandlerStack = [
  validationErrorHandler,
  rateLimitErrorHandler,
  databaseErrorHandler,
  externalServiceErrorHandler,
  globalErrorHandler
];

/**
 * 開發環境錯誤詳情增強器
 * 在開發環境中添加額外的錯誤信息
 */
export const developmentErrorEnhancer = (error, req) => {
  if (!isDevelopment()) {
    return error;
  }
  
  // 添加開發環境特有的元數據
  if (error instanceof AppError) {
    error.addMetadata('developmentInfo', {
      nodeVersion: process.version,
      platform: process.platform,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });
  }
  
  return error;
};

export default {
  requestIdMiddleware,
  notFoundHandler,
  globalErrorHandler,
  catchAsync,
  validationErrorHandler,
  rateLimitErrorHandler,
  databaseErrorHandler,
  externalServiceErrorHandler,
  websocketErrorHandler,
  healthCheckErrorHandler,
  errorHandlerStack,
  developmentErrorEnhancer
};