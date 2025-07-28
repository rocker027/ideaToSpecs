/**
 * 日誌中間件模組
 * 處理請求日誌、性能監控和錯誤日誌
 */

import morgan from 'morgan';
import pino from 'pino';
import { LOGGING_CONFIG, isDevelopment } from '../config/serverConfig.js';
import databaseService from '../services/databaseService.js';

// 創建 Pino 日誌器
const logger = pino(LOGGING_CONFIG);

/**
 * 設置 Morgan HTTP 請求日誌
 */
export function setupMorganLogger() {
  if (isDevelopment()) {
    return morgan('dev');
  } else {
    return morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim(), 'HTTP Request')
      }
    });
  }
}

/**
 * 自定義請求/回應日誌中間件
 */
export function requestResponseLogger(req, res, next) {
  const startTime = Date.now();
  const originalSend = res.send;
  
  // 記錄請求開始
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    sessionId: req.headers['x-session-id'],
    userId: req.user?.id
  }, 'Request started');
  
  // 覆蓋 res.send 以記錄回應
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const responseSize = Buffer.byteLength(typeof data === 'string' ? data : JSON.stringify(data));
    
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: `${Math.round(responseSize / 1024)}KB`,
      userAgent: req.get('User-Agent')?.substring(0, 100),
      ip: req.ip,
      userId: req.user?.id,
      sessionId: req.headers['x-session-id']
    };
    
    if (res.statusCode >= 400) {
      logger.error({
        ...logData,
        errorData: isDevelopment() ? data : 'Error data hidden in production'
      }, 'HTTP Error Response');
    } else if (duration > 5000) { // 慢請求警告
      logger.warn({
        ...logData,
        slow: true
      }, 'Slow HTTP Request');
    } else {
      logger.info(logData, 'HTTP Request Completed');
    }
    
    // 異步記錄性能指標到資料庫
    if (req.path.startsWith('/api/')) {
      recordPerformanceMetric(
        req.path,
        req.method,
        duration,
        res.statusCode,
        res.statusCode >= 400 ? data : null
      ).catch(err => {
        logger.debug({ error: err }, 'Failed to record performance metric');
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
}

/**
 * 錯誤日誌中間件
 */
export function errorLogger(err, req, res, next) {
  const errorInfo = {
    error: {
      message: err.message,
      stack: isDevelopment() ? err.stack : undefined,
      name: err.name,
      code: err.code
    },
    request: {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: isDevelopment() ? req.body : undefined,
      params: req.params,
      query: req.query,
      headers: isDevelopment() ? req.headers : {
        'content-type': req.get('Content-Type'),
        'user-agent': req.get('User-Agent')
      }
    },
    user: req.user?.id,
    timestamp: new Date().toISOString()
  };
  
  // 根據錯誤類型使用不同的日誌級別
  if (err.status && err.status < 500) {
    logger.warn(errorInfo, 'Client Error');
  } else {
    logger.error(errorInfo, 'Server Error');
  }
  
  next(err);
}

/**
 * WebSocket 連接日誌
 */
export function logWebSocketConnection(socket, eventType, data = {}) {
  logger.info({
    socketId: socket.id,
    eventType,
    userId: socket.user?.id,
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent'],
    timestamp: new Date().toISOString(),
    ...data
  }, 'WebSocket Event');
}

/**
 * 資料庫操作日誌
 */
export function logDatabaseOperation(operation, details = {}) {
  logger.debug({
    operation,
    timestamp: new Date().toISOString(),
    ...details
  }, 'Database Operation');
}

/**
 * 安全事件日誌
 */
export function logSecurityEvent(eventType, details = {}) {
  logger.warn({
    eventType,
    timestamp: new Date().toISOString(),
    ...details
  }, 'Security Event');
}

/**
 * 性能指標日誌
 */
export function logPerformanceMetric(metric, value, tags = {}) {
  logger.info({
    metric,
    value,
    tags,
    timestamp: new Date().toISOString()
  }, 'Performance Metric');
}

/**
 * 業務邏輯日誌
 */
export function logBusinessEvent(event, details = {}) {
  logger.info({
    event,
    timestamp: new Date().toISOString(),
    ...details
  }, 'Business Event');
}

/**
 * 系統健康狀態日誌
 */
export function logHealthCheck(service, status, details = {}) {
  const logLevel = status === 'healthy' ? 'info' : 'warn';
  logger[logLevel]({
    service,
    status,
    timestamp: new Date().toISOString(),
    ...details
  }, 'Health Check');
}

/**
 * 清理敏感資訊的日誌過濾器
 */
export function sanitizeLogData(data) {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'cookie',
    'session'
  ];
  
  const sanitized = { ...data };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  // 遞歸處理嵌套對象
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value);
    }
  }
  
  return sanitized;
}

/**
 * 記錄性能指標到資料庫
 */
async function recordPerformanceMetric(endpoint, method, duration, statusCode, error = null) {
  try {
    await databaseService.logPerformanceMetric(endpoint, method, duration, statusCode, error);
  } catch (err) {
    logger.debug({ error: err }, 'Failed to record performance metric to database');
  }
}

/**
 * 結構化日誌格式化器
 */
export function formatStructuredLog(level, message, metadata = {}) {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitizeLogData(metadata)
  };
}

/**
 * 取得日誌統計
 */
export function getLogStats() {
  return {
    level: logger.level,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
}

/**
 * 日誌輪轉觸發器（簡單實現）
 */
export function triggerLogRotation() {
  logger.info('Log rotation triggered', 'Log Management');
  // 在實際應用中，這裡會實現日誌文件輪轉邏輯
}

/**
 * 異步日誌寫入器（批量處理）
 */
class AsyncLogWriter {
  constructor(batchSize = 100, flushInterval = 5000) {
    this.batch = [];
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    
    // 定期刷新日誌
    setInterval(() => {
      this.flush();
    }, flushInterval);
  }
  
  add(logEntry) {
    this.batch.push({
      ...logEntry,
      timestamp: new Date().toISOString()
    });
    
    if (this.batch.length >= this.batchSize) {
      this.flush();
    }
  }
  
  flush() {
    if (this.batch.length === 0) return;
    
    const logsToFlush = [...this.batch];
    this.batch = [];
    
    // 這裡可以實現批量寫入到外部日誌系統
    logsToFlush.forEach(entry => {
      logger.info(entry, 'Batch Log Entry');
    });
  }
}

// 創建異步日誌寫入器實例
export const asyncLogWriter = new AsyncLogWriter();

// 導出日誌器實例
export { logger };

export default {
  setupMorganLogger,
  requestResponseLogger,
  errorLogger,
  logWebSocketConnection,
  logDatabaseOperation,
  logSecurityEvent,
  logPerformanceMetric,
  logBusinessEvent,
  logHealthCheck,
  sanitizeLogData,
  formatStructuredLog,
  getLogStats,
  triggerLogRotation,
  asyncLogWriter,
  logger
};