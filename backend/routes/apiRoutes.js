/**
 * API 路由定義
 * 組織所有 API 端點的路由配置
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';

// 導入控制器
import specController from '../controllers/specController.js';
import historyController from '../controllers/historyController.js';
import healthController from '../controllers/healthController.js';

// 導入中間件
import { requireAuth, optionalAuth, handleLogin, handleLogout, handleUserInfo } from '../middleware/auth.js';

// 導入配置
import { 
  SECURITY_CONFIG, 
  VALIDATION_SCHEMAS, 
  API_ENDPOINTS, 
  WEBSOCKET_EVENTS,
  JOB_STATUSES,
  isDevelopment 
} from '../config/serverConfig.js';

const router = express.Router();

// 創建速率限制器
const generateLimiter = rateLimit(SECURITY_CONFIG.generateRateLimit);

// 創建 Joi schema 驗證中間件
const validateRequest = (schema) => {
  return (req, res, next) => {
    const dataToValidate = req.method === 'GET' ? req.query : req.body;
    const joiSchema = Joi.object(schema);
    
    const { error, value } = joiSchema.validate(dataToValidate, { 
      abortEarly: false,
      stripUnknown: true 
    });
    
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    req.validatedData = value;
    next();
  };
};

// ==================== 身份驗證路由 ====================

/**
 * 用戶登入
 */
router.post('/auth/login', handleLogin);

/**
 * 用戶登出
 */
router.post('/auth/logout', optionalAuth, handleLogout);

/**
 * 取得用戶資訊
 */
router.get('/auth/user', requireAuth({ skipLocal: true }), handleUserInfo);

// ==================== 規格生成路由 ====================

/**
 * 生成規格文檔
 * POST /api/generate
 */
router.post('/generate', 
  generateLimiter,
  optionalAuth,
  validateRequest(VALIDATION_SCHEMAS.generateIdea),
  specController.generateSpec
);

/**
 * 取得特定規格文檔
 * GET /api/spec/:id
 */
router.get('/spec/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: errors.array()
      });
    }
    next();
  },
  specController.getSpec
);

/**
 * 下載規格文檔為 Markdown
 * GET /api/download/:id
 */
router.get('/download/:id', 
  param('id').isInt({ min: 1 }).withMessage('Invalid ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: errors.array()
      });
    }
    next();
  },
  specController.downloadSpec
);

/**
 * 取得規格統計
 * GET /api/spec/stats
 */
router.get('/spec/stats', specController.getStats);

// ==================== 歷史記錄路由 ====================

/**
 * 取得歷史記錄（分頁）
 * GET /api/history
 */
router.get('/history', 
  optionalAuth,
  validateRequest(VALIDATION_SCHEMAS.historyQuery),
  historyController.getHistory
);

/**
 * 刪除歷史記錄
 * DELETE /api/history/:id
 */
router.delete('/history/:id', 
  requireAuth({ skipLocal: true, requirePermission: 'delete' }),
  param('id').isInt({ min: 1 }).withMessage('Invalid ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: errors.array()
      });
    }
    next();
  },
  historyController.deleteHistory
);

/**
 * 取得歷史統計
 * GET /api/history/stats
 */
router.get('/history/stats', historyController.getHistoryStats);

/**
 * 取得數據庫性能統計
 * GET /api/history/performance
 */
router.get('/history/performance', 
  requireAuth({ skipLocal: true, requirePermission: 'admin' }),
  historyController.getDatabasePerformance
);

/**
 * 進階搜尋歷史記錄
 * GET /api/history/search
 */
router.get('/history/search', 
  query('query').optional().isLength({ max: 200 }),
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('page').optional().isInt({ min: 1, max: 1000 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isIn(['created_at', 'updated_at', 'processing_time_ms']),
  query('sortOrder').optional().isIn(['ASC', 'DESC']),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: errors.array()
      });
    }
    next();
  },
  historyController.searchHistory
);

/**
 * 批量刪除歷史記錄（管理員功能）
 * DELETE /api/history/bulk
 */
router.delete('/history/bulk',
  requireAuth({ skipLocal: true, requirePermission: 'delete' }),
  body('ids').isArray({ min: 1, max: 100 }),
  body('ids.*').isInt({ min: 1 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        timestamp: new Date().toISOString(),
        details: errors.array()
      });
    }
    next();
  },
  historyController.bulkDeleteHistory
);

// ==================== 健康檢查路由 ====================

/**
 * 系統健康檢查
 * GET /api/health
 */
router.get('/health', healthController.systemHealth);

/**
 * Gemini CLI 健康檢查
 * GET /api/gemini/health
 */
router.get('/gemini/health', healthController.geminiHealth);

/**
 * Gemini CLI 認證狀態
 * GET /api/gemini/auth-status
 */
router.get('/gemini/auth-status', healthController.geminiAuthStatus);

/**
 * 資料庫健康檢查
 * GET /api/database/health
 */
router.get('/database/health', healthController.databaseHealth);

/**
 * WebSocket 健康檢查
 * GET /api/websocket/health
 */
router.get('/websocket/health', healthController.websocketHealth);

/**
 * 就緒檢查（K8s readiness probe）
 * GET /api/ready
 */
router.get('/ready', healthController.readinessCheck);

/**
 * 活性檢查（K8s liveness probe）
 * GET /api/live
 */
router.get('/live', healthController.livenessCheck);

/**
 * 系統指標
 * GET /api/metrics
 */
router.get('/metrics', healthController.systemMetrics);

/**
 * 清除健康檢查緩存
 * POST /api/health/clear-cache
 */
router.post('/health/clear-cache', 
  requireAuth({ skipLocal: true, requirePermission: 'admin' }),
  healthController.clearHealthCache
);

// ==================== API 文檔路由 ====================

/**
 * API 文檔
 * GET /api/docs
 */
router.get('/docs', (req, res) => {
  res.json({
    title: 'Idea-to-Specifications API',
    version: '1.0.0',
    description: 'RESTful API for converting ideas into product development specifications',
    baseUrl: req.protocol + '://' + req.get('host') + '/api',
    endpoints: API_ENDPOINTS,
    websocketEvents: {
      [WEBSOCKET_EVENTS.CONNECTION]: 'Client connects to WebSocket',
      [WEBSOCKET_EVENTS.SUBSCRIBE_JOB]: 'Subscribe to job updates',
      [WEBSOCKET_EVENTS.UNSUBSCRIBE_JOB]: 'Unsubscribe from job updates', 
      [WEBSOCKET_EVENTS.JOB_UPDATE]: 'Receive real-time job status updates',
      [WEBSOCKET_EVENTS.DISCONNECT]: 'Client disconnects'
    },
    jobStatuses: Object.values(JOB_STATUSES),
    authentication: {
      methods: ['session', 'api-key'],
      headers: {
        session: 'X-Session-ID',
        apiKey: ['X-API-Key', 'Authorization: Bearer <token>']
      }
    },
    rateLimits: {
      general: '100 requests per 15 minutes',
      generation: '10 requests per 5 minutes'
    },
    timestamp: new Date().toISOString()
  });
});

// ==================== 開發環境測試路由 ====================

if (isDevelopment()) {
  /**
   * 簡單測試端點（僅開發環境）
   * GET /api/history-test
   */
  router.get('/history-test', specController.testEndpoint);
}

export default router;