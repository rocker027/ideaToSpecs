/**
 * 本地端身份驗證中間件
 * 為本地開發專案提供基本的身份驗證和 session 管理
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { validateAndSanitizeInput } from '../utils/validators.js';

// 簡單的記憶體 session 存儲（適用於本地開發）
const sessions = new Map();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 小時

/**
 * 生成安全的 session ID
 */
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成簡單的 API 金鑰用於本地驗證
 */
function generateApiKey() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 本地端認證配置
 */
const LOCAL_AUTH_CONFIG = {
  // 預設的本地開發帳號（可通過環境變數覆蓋）
  users: [
    {
      id: 'local-dev',
      username: process.env.LOCAL_USERNAME || 'developer',
      // 使用 bcrypt 哈希的密碼（預設為 'dev123'）
      passwordHash: process.env.LOCAL_PASSWORD_HASH || '$2b$12$nOsAQyMo.vPCLIhYS2aj.uGdomacUq5zOWbsnozkxoL3R780CS54S',
      role: 'admin',
      permissions: ['generate', 'history', 'delete']
    }
  ],
  
  // API 金鑰管理
  apiKeys: new Set([
    process.env.LOCAL_API_KEY || generateApiKey()
  ]),
  
  // 是否啟用身份驗證（預設為開發環境不強制）
  enabled: process.env.AUTH_ENABLED === 'true' || false,
  
  // 允許的本地 IP
  allowedIPs: ['127.0.0.1', '::1', 'localhost']
};

/**
 * 檢查 IP 是否為本地地址
 */
function isLocalIP(ip) {
  const cleanIP = ip.replace(/^::ffff:/, ''); // 移除 IPv6 前綴
  return LOCAL_AUTH_CONFIG.allowedIPs.includes(cleanIP) || 
         cleanIP.startsWith('192.168.') || 
         cleanIP.startsWith('10.') ||
         cleanIP === '127.0.0.1';
}

/**
 * 驗證使用者憑證（異步）
 */
async function validateUser(username, password) {
  if (!username || !password) return null;
  
  const user = LOCAL_AUTH_CONFIG.users.find(u => u.username === username);
  
  if (user) {
    // 使用 bcrypt 驗證密碼
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (isValidPassword) {
      // 返回安全的使用者資訊（不包含密碼哈希）
      const { passwordHash: _, ...safeUser } = user;
      return safeUser;
    }
  }
  
  return null;
}

/**
 * 創建新的 session
 */
function createSession(user, req) {
  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    user,
    createdAt: new Date(),
    lastAccess: new Date(),
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent')
  };
  
  sessions.set(sessionId, session);
  
  // 設定過期清理
  setTimeout(() => {
    sessions.delete(sessionId);
  }, SESSION_TIMEOUT);
  
  return sessionId;
}

/**
 * 獲取 session
 */
function getSession(sessionId) {
  if (!sessionId) return null;
  
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  // 檢查是否過期
  if (Date.now() - session.createdAt.getTime() > SESSION_TIMEOUT) {
    sessions.delete(sessionId);
    return null;
  }
  
  // 更新最後存取時間
  session.lastAccess = new Date();
  return session;
}

/**
 * 身份驗證中間件
 */
export function requireAuth(options = {}) {
  const { 
    skipLocal = true,     // 是否跳過本地 IP 檢查
    requirePermission = null,  // 需要的權限
    allowApiKey = true    // 是否允許 API 金鑰驗證
  } = options;
  
  return (req, res, next) => {
    // 如果身份驗證未啟用，直接通過
    if (!LOCAL_AUTH_CONFIG.enabled) {
      req.user = { id: 'local-dev', role: 'admin', permissions: ['*'] };
      return next();
    }
    
    // 檢查是否為本地 IP
    if (skipLocal && isLocalIP(req.ip || req.connection.remoteAddress)) {
      req.user = { id: 'local-dev', role: 'admin', permissions: ['*'] };
      return next();
    }
    
    // 方法 1: 檢查 session
    const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
    if (sessionId) {
      const session = getSession(sessionId);
      if (session) {
        req.user = session.user;
        req.session = session;
        
        // 檢查權限
        if (requirePermission && !session.user.permissions.includes(requirePermission) && !session.user.permissions.includes('*')) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            required: requirePermission
          });
        }
        
        return next();
      }
    }
    
    // 方法 2: 檢查 API 金鑰
    if (allowApiKey) {
      const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
      if (apiKey && LOCAL_AUTH_CONFIG.apiKeys.has(apiKey)) {
        req.user = { id: 'api-user', role: 'api', permissions: ['*'] };
        return next();
      }
    }
    
    // 未授權
    return res.status(401).json({
      error: 'Authentication required',
      message: '需要身份驗證。請提供有效的 session 或 API 金鑰',
      methods: ['session', 'api-key'],
      timestamp: new Date().toISOString()
    });
  };
}

/**
 * 可選的身份驗證中間件（不強制要求）
 */
export function optionalAuth(req, res, next) {
  const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
  if (sessionId) {
    const session = getSession(sessionId);
    if (session) {
      req.user = session.user;
      req.session = session;
    }
  }
  
  // 如果是本地 IP，提供預設使用者
  if (!req.user && isLocalIP(req.ip || req.connection.remoteAddress)) {
    req.user = { id: 'local-dev', role: 'local', permissions: ['*'] };
  }
  
  next();
}

/**
 * 登入端點處理器
 */
export async function handleLogin(req, res) {
  try {
    const { username, password } = req.body;
    
    // 輸入驗證
    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: '請提供使用者名稱和密碼'
      });
    }
    
    // 驗證憑證（異步）
    const user = await validateUser(username, password);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: '使用者名稱或密碼錯誤'
      });
    }
    
    // 創建 session
    const sessionId = createSession(user, req);
    
    res.json({
      success: true,
      message: '登入成功',
      sessionId,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      },
      expiresIn: SESSION_TIMEOUT
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: '登入處理時發生錯誤'
    });
  }
}

/**
 * 登出端點處理器
 */
export async function handleLogout(req, res) {
  try {
    const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
    
    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId);
    }
    
    res.json({
      success: true,
      message: '登出成功'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: '登出處理時發生錯誤'
    });
  }
}

/**
 * 獲取當前使用者資訊
 */
export async function handleUserInfo(req, res) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Not authenticated',
      message: '未登入'
    });
  }
  
  res.json({
    success: true,
    user: req.user,
    session: req.session ? {
      id: req.session.id,
      createdAt: req.session.createdAt,
      lastAccess: req.session.lastAccess
    } : null
  });
}

/**
 * session 清理工具
 */
export function cleanupSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt.getTime() > SESSION_TIMEOUT) {
      sessions.delete(sessionId);
    }
  }
}

// 定期清理過期 session
setInterval(cleanupSessions, 60 * 60 * 1000); // 每小時清理一次

export { LOCAL_AUTH_CONFIG, sessions };
export default {
  requireAuth,
  optionalAuth,
  handleLogin,
  handleLogout,
  handleUserInfo,
  LOCAL_AUTH_CONFIG
};