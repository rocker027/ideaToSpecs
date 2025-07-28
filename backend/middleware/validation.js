/**
 * 輸入驗證中間件模組
 * 提供通用的輸入驗證和錯誤處理
 */

import { validationResult, body, param, query, header } from 'express-validator';
import Joi from 'joi';
import { ERROR_MESSAGES, isDevelopment } from '../config/serverConfig.js';
import { logger } from './logging.js';

/**
 * Express Validator 錯誤處理中間件
 */
export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      value: error.value,
      message: error.msg,
      location: error.location
    }));
    
    logger.warn({
      path: req.path,
      method: req.method,
      errors: formattedErrors,
      body: isDevelopment() ? req.body : undefined
    }, 'Validation failed');
    
    return res.status(400).json({
      error: ERROR_MESSAGES.VALIDATION_FAILED,
      timestamp: new Date().toISOString(),
      details: formattedErrors
    });
  }
  
  next();
}

/**
 * Joi Schema 驗證中間件工廠函數
 */
export function validateWithJoi(schema, target = 'body') {
  return (req, res, next) => {
    const dataToValidate = target === 'body' ? req.body : 
                          target === 'query' ? req.query :
                          target === 'params' ? req.params : req[target];
    
    const { error, value } = schema.validate(dataToValidate, { 
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      const formattedErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      logger.warn({
        path: req.path,
        method: req.method,
        target,
        errors: formattedErrors,
        data: isDevelopment() ? dataToValidate : undefined
      }, 'Joi validation failed');
      
      return res.status(400).json({
        error: ERROR_MESSAGES.VALIDATION_FAILED,
        timestamp: new Date().toISOString(),
        details: formattedErrors
      });
    }
    
    // 將驗證後的資料存儲到 req 對象
    req.validatedData = value;
    next();
  };
}

/**
 * 常用的 Joi Schema
 */
export const commonSchemas = {
  // ID 參數驗證
  id: Joi.number().integer().min(1).required(),
  
  // 分頁參數
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),
  
  // 日期範圍
  dateRange: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate'))
  }),
  
  // 搜尋查詢
  search: Joi.object({
    q: Joi.string().min(1).max(200).trim(),
    category: Joi.string().valid('all', 'completed', 'failed', 'processing'),
    sortBy: Joi.string().valid('created_at', 'updated_at', 'processing_time_ms').default('created_at'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),
  
  // 用戶輸入想法
  ideaInput: Joi.object({
    idea: Joi.string()
      .min(10)
      .max(5000)
      .required()
      .trim()
      .custom((value, helpers) => {
        // 檢查是否包含可疑內容
        const suspiciousPatterns = [
          /<script/i,
          /javascript:/i,
          /vbscript:/i,
          /onload=/i,
          /onerror=/i
        ];
        
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(value)) {
            return helpers.error('string.suspicious');
          }
        }
        
        return value;
      })
      .messages({
        'string.min': 'Idea must be at least 10 characters long',
        'string.max': 'Idea cannot exceed 5000 characters',
        'string.suspicious': 'Idea contains potentially dangerous content',
        'any.required': 'Idea is required'
      })
  }),
  
  // 批量操作
  bulkIds: Joi.object({
    ids: Joi.array()
      .items(Joi.number().integer().min(1))
      .min(1)
      .max(100)
      .required()
  })
};

/**
 * Express Validator 常用驗證規則
 */
export const validationRules = {
  // ID 參數驗證
  validateId: () => [
    param('id')
      .isInt({ min: 1 })
      .withMessage('ID must be a positive integer')
      .toInt()
  ],
  
  // 分頁查詢驗證
  validatePagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Page must be between 1 and 1000')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt()
  ],
  
  // 搜尋查詢驗證
  validateSearch: () => [
    query('q')
      .optional()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters')
      .trim()
      .escape(),
    query('category')
      .optional()
      .isIn(['all', 'completed', 'failed', 'processing'])
      .withMessage('Invalid category'),
    query('sortBy')
      .optional()
      .isIn(['created_at', 'updated_at', 'processing_time_ms'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],
  
  // 日期範圍驗證
  validateDateRange: () => [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date')
      .toDate(),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date')
      .toDate()
      .custom((value, { req }) => {
        if (req.query.startDate && new Date(value) < new Date(req.query.startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      })
  ],
  
  // 用戶想法輸入驗證
  validateIdeaInput: () => [
    body('idea')
      .isLength({ min: 10, max: 5000 })
      .withMessage('Idea must be between 10 and 5000 characters')
      .trim()
      .custom((value) => {
        // 檢查可疑內容
        const suspiciousPatterns = [
          /<script/i,
          /javascript:/i,
          /vbscript:/i,
          /onload=/i,
          /onerror=/i
        ];
        
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(value)) {
            throw new Error('Idea contains potentially dangerous content');
          }
        }
        
        return true;
      })
  ],
  
  // 批量操作 ID 驗證
  validateBulkIds: () => [
    body('ids')
      .isArray({ min: 1, max: 100 })
      .withMessage('IDs must be an array with 1-100 items'),
    body('ids.*')
      .isInt({ min: 1 })
      .withMessage('Each ID must be a positive integer')
      .toInt()
  ],
  
  // API Key 驗證
  validateApiKey: () => [
    header('x-api-key')
      .optional()
      .isLength({ min: 32, max: 64 })
      .withMessage('API key must be between 32 and 64 characters')
      .isAlphanumeric()
      .withMessage('API key must contain only alphanumeric characters')
  ],
  
  // Session ID 驗證
  validateSessionId: () => [
    header('x-session-id')
      .optional()
      .isLength({ min: 32, max: 128 })
      .withMessage('Session ID must be between 32 and 128 characters')
      .isAlphanumeric()
      .withMessage('Session ID must contain only alphanumeric characters')
  ]
};

/**
 * 自定義驗證器
 */
export const customValidators = {
  // 檢查是否為有效的排序欄位
  isSortField: (value, validFields = []) => {
    return validFields.includes(value);
  },
  
  // 檢查是否為有效的狀態值
  isValidStatus: (value) => {
    const validStatuses = ['pending', 'processing', 'completed', 'failed'];
    return validStatuses.includes(value);
  },
  
  // 檢查 IP 地址格式
  isValidIP: (value) => {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(value);
  },
  
  // 檢查 URL 格式
  isValidURL: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  
  // 檢查檔案名稱安全性
  isSafeFilename: (value) => {
    const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    
    return !dangerousChars.test(value) && !reservedNames.test(value.split('.')[0]);
  }
};

/**
 * 清理和標準化輸入資料
 */
export function sanitizeInput(req, res, next) {
  // 清理字串輸入
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    
    return str
      .trim()
      .replace(/\s+/g, ' ') // 合併多個空格
      .substring(0, 10000); // 限制最大長度
  };
  
  // 遞歸清理對象
  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return typeof obj === 'string' ? sanitizeString(obj) : obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  };
  
  // 清理請求資料
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
}

/**
 * 檢查請求大小限制
 */
export function checkRequestSize(maxSize = 1024 * 1024) { // 預設 1MB
  return (req, res, next) => {
    const size = parseInt(req.get('Content-Length') || '0');
    
    if (size > maxSize) {
      logger.warn({
        path: req.path,
        method: req.method,
        contentLength: size,
        maxSize
      }, 'Request size exceeds limit');
      
      return res.status(413).json({
        error: 'Payload too large',
        message: `Request payload exceeds maximum size of ${maxSize} bytes`,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
}

export default {
  handleValidationErrors,
  validateWithJoi,
  commonSchemas,
  validationRules,
  customValidators,
  sanitizeInput,
  checkRequestSize
};