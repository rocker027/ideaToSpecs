/**
 * 安全中間件模組
 * 包含安全標頭、CORS、速率限制等安全相關中間件
 */

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { SECURITY_CONFIG, SERVER_CONFIG, ERROR_MESSAGES, isDevelopment } from '../config/serverConfig.js';
import pino from 'pino';

const logger = pino();

/**
 * 設置 Helmet 安全標頭
 */
export function setupHelmet() {
  return helmet(SECURITY_CONFIG.helmet);
}

/**
 * 設置 CORS
 */
export function setupCORS() {
  return cors(SECURITY_CONFIG.cors);
}

/**
 * 設置通用速率限制
 */
export function setupRateLimit() {
  return rateLimit(SECURITY_CONFIG.rateLimit);
}

/**
 * 設置生成端點專用速率限制
 */
export function setupGenerateRateLimit() {
  return rateLimit(SECURITY_CONFIG.generateRateLimit);
}

/**
 * 額外的安全標頭中間件
 */
export function additionalSecurityHeaders(req, res, next) {
  // 防止 MIME 類型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // 防止頁面被嵌入到 iframe
  res.setHeader('X-Frame-Options', 'DENY');
  
  // 啟用瀏覽器的 XSS 過濾器
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // 權限策略（限制瀏覽器功能）
  res.setHeader('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  
  // 防止 DNS 預取洩漏
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  
  // 防止下載文件時的安全問題
  res.setHeader('X-Download-Options', 'noopen');
  
  // 僅在生產環境中啟用 HSTS
  if (!isDevelopment()) {
    res.setHeader('Strict-Transport-Security', 
      'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
}

/**
 * IP 白名單中間件
 */
export function ipWhitelist(allowedIPs = []) {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const cleanIP = clientIP.replace(/^::ffff:/, ''); // 移除 IPv6 前綴
    
    // 本地 IP 總是允許
    const isLocal = ['127.0.0.1', '::1', 'localhost'].includes(cleanIP) || 
                   cleanIP.startsWith('192.168.') || 
                   cleanIP.startsWith('10.') ||
                   cleanIP === '127.0.0.1';
    
    if (isLocal || allowedIPs.includes(cleanIP)) {
      return next();
    }
    
    logger.warn({ clientIP: cleanIP }, 'IP not in whitelist');
    res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address is not authorized to access this resource',
      timestamp: new Date().toISOString()
    });
  };
}

/**
 * 基於用戶代理的安全檢查
 */
export function userAgentSecurity(req, res, next) {
  const userAgent = req.get('User-Agent') || '';
  
  // 檢查可疑的用戶代理
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /php/i
  ];
  
  // 在開發環境中放寬限制
  if (isDevelopment()) {
    return next();
  }
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
  
  if (isSuspicious) {
    logger.warn({ userAgent }, 'Suspicious user agent detected');
    
    // 不完全阻止，但增加速率限制
    req.suspiciousUserAgent = true;
  }
  
  next();
}

/**
 * 內容長度限制中間件
 */
export function contentLengthLimit(maxSize = 10 * 1024 * 1024) { // 預設 10MB
  return (req, res, next) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (contentLength > maxSize) {
      logger.warn({ contentLength, maxSize }, 'Content length exceeds limit');
      return res.status(413).json({
        error: 'Payload too large',
        message: `Request payload exceeds maximum size of ${maxSize} bytes`,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
}

/**
 * 請求方法白名單
 */
export function allowedMethods(methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
  return (req, res, next) => {
    if (!methods.includes(req.method)) {
      logger.warn({ method: req.method }, 'Method not allowed');
      return res.status(405).json({
        error: 'Method not allowed',
        message: `HTTP method ${req.method} is not allowed`,
        allowedMethods: methods,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
}

/**
 * 惡意請求檢測
 */
export function maliciousRequestDetection(req, res, next) {
  const suspicious = [];
  
  // 檢查 URL 中的可疑模式
  const urlPatterns = [
    /\.\./,           // 路徑遍歷
    /<script/i,       // XSS 嘗試
    /union.*select/i, // SQL 注入
    /javascript:/i,   // JavaScript 協議
    /vbscript:/i,     // VBScript 協議
    /data:/i,         // Data URL
    /file:/i,         // File URL
  ];
  
  urlPatterns.forEach(pattern => {
    if (pattern.test(req.url)) {
      suspicious.push(`URL contains pattern: ${pattern}`);
    }
  });
  
  // 檢查標頭中的可疑內容
  const headers = req.headers;
  if (headers['x-forwarded-for'] && headers['x-forwarded-for'].split(',').length > 5) {
    suspicious.push('Too many forwarded IPs');
  }
  
  if (headers.referer && headers.referer.length > 1000) {
    suspicious.push('Excessively long referer');
  }
  
  // 如果發現可疑行為，記錄並考慮阻止
  if (suspicious.length > 0) {
    logger.warn({
      ip: req.ip,
      url: req.url,
      method: req.method,
      userAgent: req.get('User-Agent'),
      suspicious
    }, 'Malicious request detected');
    
    // 在生產環境中可能選擇阻止請求
    if (!isDevelopment() && suspicious.length > 2) {
      return res.status(400).json({
        error: 'Malicious request detected',
        timestamp: new Date().toISOString()
      });
    }
    
    req.suspiciousRequest = suspicious;
  }
  
  next();
}

/**
 * API 密鑰驗證中間件
 */
export function validateApiKey(validKeys = new Set()) {
  return (req, res, next) => {
    const apiKey = req.get('X-API-Key') || 
                   req.get('Authorization')?.replace('Bearer ', '') ||
                   req.query.api_key;
    
    if (!apiKey) {
      return res.status(401).json({
        error: ERROR_MESSAGES.AUTHENTICATION_REQUIRED,
        message: 'API key is required',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!validKeys.has(apiKey)) {
      logger.warn({ apiKey: apiKey.substring(0, 8) + '...' }, 'Invalid API key');
      return res.status(401).json({
        error: 'Invalid API key',
        timestamp: new Date().toISOString()
      });
    }
    
    req.apiKey = apiKey;
    next();
  };
}

/**
 * 動態速率限制（基於用戶行為調整）
 */
export function dynamicRateLimit(baseLimit = 100, windowMs = 15 * 60 * 1000) {
  const store = new Map();
  
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    
    // 清理過期記錄
    for (const [ip, data] of store.entries()) {
      if (now - data.windowStart > windowMs) {
        store.delete(ip);
      }
    }
    
    if (!store.has(key)) {
      store.set(key, {
        count: 1,
        windowStart: now,
        suspiciousActivity: 0
      });
      return next();
    }
    
    const userData = store.get(key);
    
    // 重置窗口如果時間過去了
    if (now - userData.windowStart > windowMs) {
      userData.count = 1;
      userData.windowStart = now;
      userData.suspiciousActivity = Math.max(0, userData.suspiciousActivity - 1);
    } else {
      userData.count++;
    }
    
    // 調整限制基於可疑活動
    if (req.suspiciousUserAgent) userData.suspiciousActivity++;
    if (req.suspiciousRequest) userData.suspiciousActivity += req.suspiciousRequest.length;
    
    const adjustedLimit = Math.max(
      Math.floor(baseLimit / (1 + userData.suspiciousActivity * 0.2)),
      10
    );
    
    if (userData.count > adjustedLimit) {
      logger.warn({
        ip: key,
        count: userData.count,
        limit: adjustedLimit,
        suspiciousActivity: userData.suspiciousActivity
      }, 'Rate limit exceeded');
      
      return res.status(429).json({
        error: ERROR_MESSAGES.TOO_MANY_REQUESTS,
        message: `Rate limit exceeded. Try again in ${Math.ceil(windowMs / 1000)} seconds.`,
        retryAfter: Math.ceil((windowMs - (now - userData.windowStart)) / 1000),
        timestamp: new Date().toISOString()
      });
    }
    
    // 設置標頭
    res.set({
      'X-RateLimit-Limit': adjustedLimit,
      'X-RateLimit-Remaining': Math.max(0, adjustedLimit - userData.count),
      'X-RateLimit-Reset': new Date(userData.windowStart + windowMs).toISOString()
    });
    
    next();
  };
}

export default {
  setupHelmet,
  setupCORS,
  setupRateLimit,
  setupGenerateRateLimit,
  additionalSecurityHeaders,
  ipWhitelist,
  userAgentSecurity,
  contentLengthLimit,
  allowedMethods,
  maliciousRequestDetection,
  validateApiKey,
  dynamicRateLimit
};