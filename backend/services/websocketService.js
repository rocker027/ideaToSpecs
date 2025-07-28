/**
 * WebSocket 服務模組
 * 管理 Socket.IO 連接、認證和事件處理
 */

import { Server as SocketIOServer } from 'socket.io';
import { WEBSOCKET_CONFIG, WEBSOCKET_EVENTS, ERROR_MESSAGES, APP_CONSTANTS, SERVER_CONFIG } from '../config/serverConfig.js';
import pino from 'pino';

const logger = pino();

class WebSocketService {
  constructor() {
    this.io = null;
    this.activeConnections = new Map();
    this.processingJobs = new Map();
    this.socketRateLimit = new Map();
    this.connectionMetadata = new Map(); // 連線元數據追蹤
    this.cleanupIntervals = new Map(); // 清理定時器追蹤
    this.isInitialized = false;
    
    // 啟動定期清理程序
    this.startCleanupTimer();
  }

  /**
   * 初始化 WebSocket 服務
   */
  initialize(server) {
    this.io = new SocketIOServer(server, WEBSOCKET_CONFIG);
    this.initTime = Date.now();
    
    // 設置中間件
    this.setupMiddleware();
    
    // 設置事件處理
    this.setupEventHandlers();
    
    this.isInitialized = true;
    logger.info('WebSocket service initialized with memory leak protection');
  }

  /**
   * 設置 WebSocket 中間件
   */
  setupMiddleware() {
    // 身份驗證中間件
    this.io.use(async (socket, next) => {
      try {
        const sessionId = socket.handshake.auth.sessionId || socket.handshake.headers['x-session-id'];
        const clientIP = socket.handshake.address;
        
        logger.debug({ clientIP, sessionId, nodeEnv: SERVER_CONFIG.nodeEnv }, 'WebSocket authentication attempt');
        
        // 檢查是否為本地 IP（允許無身份驗證）
        if (this.isLocalIP(clientIP)) {
          socket.user = { id: 'local-dev', role: 'local', permissions: ['*'] };
          logger.debug({ clientIP }, 'Local IP detected, allowing connection');
          return next();
        }
        
        // 驗證 session（在實際應用中應該與 auth 中間件整合）
        if (sessionId && this.validateSession(sessionId)) {
          const session = this.getSession(sessionId);
          socket.user = session.user;
          socket.sessionId = sessionId;
          logger.debug({ sessionId }, 'Session validated successfully');
        } else {
          // 開發環境允許無認證訪問
          if (SERVER_CONFIG.nodeEnv === 'development') {
            socket.user = { id: 'dev-user', role: 'developer', permissions: ['*'] };
            logger.debug('Development mode, allowing connection without authentication');
          } else {
            logger.warn({ clientIP, sessionId }, 'WebSocket authentication failed');
            return next(new Error(ERROR_MESSAGES.WEBSOCKET_AUTH_FAILED));
          }
        }
        
        next();
      } catch (error) {
        next(new Error(ERROR_MESSAGES.WEBSOCKET_AUTH_FAILED));
      }
    });

    // 速率限制中間件
    this.io.use((socket, next) => {
      const clientIP = socket.handshake.address;
      const now = Date.now();
      
      if (!this.socketRateLimit.has(clientIP)) {
        this.socketRateLimit.set(clientIP, { count: 0, resetTime: now + 60000 });
      }
      
      const limit = this.socketRateLimit.get(clientIP);
      
      if (now > limit.resetTime) {
        limit.count = 0;
        limit.resetTime = now + 60000;
      }
      
      if (limit.count >= APP_CONSTANTS.MAX_CONNECTIONS_PER_IP) {
        return next(new Error(ERROR_MESSAGES.WEBSOCKET_RATE_LIMIT));
      }
      
      limit.count++;
      next();
    });
  }

  /**
   * 設置事件處理器
   */
  setupEventHandlers() {
    this.io.on(WEBSOCKET_EVENTS.CONNECTION, (socket) => {
      logger.info({ socketId: socket.id, user: socket.user?.id }, 'WebSocket client connected');
      
      // 檢查連線數量限制
      if (this.activeConnections.size >= APP_CONSTANTS.MAX_CONNECTIONS_PER_IP) {
        logger.warn({ socketId: socket.id }, 'Maximum connections exceeded, rejecting new connection');
        socket.emit('error', { message: ERROR_MESSAGES.WEBSOCKET_RATE_LIMIT });
        socket.disconnect(true);
        return;
      }
      
      // 設置連線元數據
      const connectionMetadata = {
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        subscriptions: new Set(),
        eventRateLimit: new Map(),
        heartbeatInterval: null,
        timeoutTimer: null
      };
      
      this.activeConnections.set(socket.id, socket);
      this.connectionMetadata.set(socket.id, connectionMetadata);
      
      // 設置連線超時
      this.setupConnectionTimeout(socket);
      
      // 設置心跳檢測
      this.setupHeartbeat(socket);
      
      // 為每個 socket 創建事件速率限制
      const eventRateLimit = connectionMetadata.eventRateLimit;
      
      // 處理工作訂閱
      socket.on(WEBSOCKET_EVENTS.SUBSCRIBE_JOB, (jobId) => {
        this.updateLastActivity(socket.id);
        
        if (!this.checkEventRateLimit(socket, eventRateLimit, WEBSOCKET_EVENTS.SUBSCRIBE_JOB, 10, 60000)) {
          return;
        }
        
        if (typeof jobId === 'string' && jobId.length > 0) {
          socket.join(`job-${jobId}`);
          
          // 追蹤訂閱
          const metadata = this.connectionMetadata.get(socket.id);
          if (metadata) {
            metadata.subscriptions.add(`job-${jobId}`);
            this.processingJobs.set(jobId, {
              socketId: socket.id,
              startTime: Date.now(),
              status: 'subscribed'
            });
          }
          
          logger.debug({ socketId: socket.id, jobId, user: socket.user?.id }, 'Client subscribed to job updates');
        }
      });
      
      // 處理工作取消訂閱
      socket.on(WEBSOCKET_EVENTS.UNSUBSCRIBE_JOB, (jobId) => {
        this.updateLastActivity(socket.id);
        
        if (!this.checkEventRateLimit(socket, eventRateLimit, WEBSOCKET_EVENTS.UNSUBSCRIBE_JOB, 10, 60000)) {
          return;
        }
        
        if (typeof jobId === 'string' && jobId.length > 0) {
          socket.leave(`job-${jobId}`);
          
          // 移除訂閱追蹤
          const metadata = this.connectionMetadata.get(socket.id);
          if (metadata) {
            metadata.subscriptions.delete(`job-${jobId}`);
          }
          
          // 清理處理中的作業記錄
          this.processingJobs.delete(jobId);
          
          logger.debug({ socketId: socket.id, jobId, user: socket.user?.id }, 'Client unsubscribed from job updates');
        }
      });
      
      // 處理心跳響應
      socket.on('pong', () => {
        this.updateLastActivity(socket.id);
        logger.debug({ socketId: socket.id }, 'Heartbeat pong received');
      });
      
      // 處理斷線
      socket.on(WEBSOCKET_EVENTS.DISCONNECT, (reason) => {
        logger.info({ socketId: socket.id, reason }, 'WebSocket client disconnected');
        this.cleanupConnection(socket.id, reason);
      });
      
      // 處理連接錯誤
      socket.on(WEBSOCKET_EVENTS.ERROR, (error) => {
        logger.error({ socketId: socket.id, error }, 'WebSocket error');
      });
    });
  }

  /**
   * 設置連線超時
   */
  setupConnectionTimeout(socket) {
    const metadata = this.connectionMetadata.get(socket.id);
    if (!metadata) return;
    
    const timeoutHandler = () => {
      const currentTime = Date.now();
      const inactiveTime = currentTime - metadata.lastActivity;
      
      if (inactiveTime > APP_CONSTANTS.SESSION_TIMEOUT) {
        logger.warn({ socketId: socket.id, inactiveTime }, 'Connection timeout due to inactivity');
        socket.emit('timeout', { message: 'Connection timeout due to inactivity' });
        socket.disconnect(true);
      } else {
        // 重設定時器
        metadata.timeoutTimer = setTimeout(timeoutHandler, APP_CONSTANTS.SESSION_TIMEOUT - inactiveTime);
      }
    };
    
    metadata.timeoutTimer = setTimeout(timeoutHandler, APP_CONSTANTS.SESSION_TIMEOUT);
  }
  
  /**
   * 設置心跳檢測
   */
  setupHeartbeat(socket) {
    const metadata = this.connectionMetadata.get(socket.id);
    if (!metadata) return;
    
    // 每 30 秒發送 ping
    metadata.heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.ping();
        logger.debug({ socketId: socket.id }, 'Heartbeat ping sent');
      } else {
        this.cleanupConnection(socket.id, 'heartbeat_failed');
      }
    }, 30000);
  }
  
  /**
   * 更新最後活動時間
   */
  updateLastActivity(socketId) {
    const metadata = this.connectionMetadata.get(socketId);
    if (metadata) {
      metadata.lastActivity = Date.now();
    }
  }
  
  /**
   * 清理連線資源
   */
  cleanupConnection(socketId, reason) {
    logger.info({ socketId, reason }, 'Cleaning up connection resources');
    
    // 清理連線記錄
    this.activeConnections.delete(socketId);
    
    // 清理連線元數據
    const metadata = this.connectionMetadata.get(socketId);
    if (metadata) {
      // 清理心跳定時器
      if (metadata.heartbeatInterval) {
        clearInterval(metadata.heartbeatInterval);
      }
      
      // 清理超時定時器
      if (metadata.timeoutTimer) {
        clearTimeout(metadata.timeoutTimer);
      }
      
      // 清理訂閱記錄
      metadata.subscriptions.forEach(subscription => {
        const jobId = subscription.replace('job-', '');
        this.processingJobs.delete(jobId);
      });
      
      // 清理事件速率限制記錄
      metadata.eventRateLimit.clear();
      
      this.connectionMetadata.delete(socketId);
    }
    
    // 從處理中的作業中移除此連線相關的記錄
    for (const [jobId, jobData] of this.processingJobs.entries()) {
      if (jobData.socketId === socketId) {
        this.processingJobs.delete(jobId);
      }
    }
    
    logger.debug({ socketId, reason }, 'Connection cleanup completed');
  }
  
  /**
   * 啟動清理定時器
   */
  startCleanupTimer() {
    // 每 5 分鐘執行一次清理
    const cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup();
    }, 5 * 60 * 1000);
    
    this.cleanupIntervals.set('periodicCleanup', cleanupInterval);
    
    // 每小時清理速率限制記錄
    const rateLimitCleanup = setInterval(() => {
      this.cleanupRateLimits();
    }, 60 * 60 * 1000);
    
    this.cleanupIntervals.set('rateLimitCleanup', rateLimitCleanup);
  }
  
  /**
   * 執行定期清理
   */
  performPeriodicCleanup() {
    const currentTime = Date.now();
    let cleanedConnections = 0;
    let cleanedJobs = 0;
    
    // 清理過期的連線
    for (const [socketId, metadata] of this.connectionMetadata.entries()) {
      const inactiveTime = currentTime - metadata.lastActivity;
      
      // 如果連線超過 2 小時沒有活動，強制清理
      if (inactiveTime > 2 * 60 * 60 * 1000) {
        const socket = this.activeConnections.get(socketId);
        if (socket && socket.connected) {
          socket.disconnect(true);
        }
        this.cleanupConnection(socketId, 'periodic_cleanup_inactive');
        cleanedConnections++;
      }
    }
    
    // 清理過期的處理中作業
    for (const [jobId, jobData] of this.processingJobs.entries()) {
      const jobAge = currentTime - jobData.startTime;
      
      // 如果作業超過 1 小時還在處理中，清理它
      if (jobAge > 60 * 60 * 1000) {
        this.processingJobs.delete(jobId);
        cleanedJobs++;
      }
    }
    
    if (cleanedConnections > 0 || cleanedJobs > 0) {
      logger.info({
        cleanedConnections,
        cleanedJobs,
        activeConnections: this.activeConnections.size,
        processingJobs: this.processingJobs.size
      }, 'Periodic cleanup completed');
    }
  }
  
  /**
   * 檢查事件速率限制
   */
  checkEventRateLimit(socket, eventRateLimit, eventName, limit = 50, window = 60000) {
    const now = Date.now();
    const key = `${socket.id}-${eventName}`;
    
    if (!eventRateLimit.has(key)) {
      eventRateLimit.set(key, { count: 0, resetTime: now + window });
    }
    
    const eventLimit = eventRateLimit.get(key);
    
    if (now > eventLimit.resetTime) {
      eventLimit.count = 0;
      eventLimit.resetTime = now + window;
    }
    
    if (eventLimit.count >= limit) {
      logger.warn({ socketId: socket.id, eventName, count: eventLimit.count }, 'Socket event rate limit exceeded');
      return false;
    }
    
    eventLimit.count++;
    return true;
  }

  /**
   * 發送工作更新
   */
  emitJobUpdate(jobId, status, data = {}) {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot emit job update');
      return;
    }

    // 更新作業狀態
    const jobData = this.processingJobs.get(jobId);
    if (jobData) {
      jobData.status = status;
      jobData.lastUpdate = Date.now();
      
      // 如果作業完成或失敗，設置清理定時器
      if (status === 'completed' || status === 'failed') {
        setTimeout(() => {
          this.processingJobs.delete(jobId);
          logger.debug({ jobId, status }, 'Job record cleaned up after completion');
        }, 5 * 60 * 1000); // 5 分鐘後清理
      }
    }

    this.io.to(`job-${jobId}`).emit(WEBSOCKET_EVENTS.JOB_UPDATE, {
      jobId,
      status,
      timestamp: new Date().toISOString(),
      ...data
    });

    logger.debug({ jobId, status, data }, 'Job update emitted');
  }

  /**
   * 廣播訊息給所有連接的客戶端
   */
  broadcast(event, data) {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot broadcast');
      return;
    }

    this.io.emit(event, data);
    logger.debug({ event, data }, 'Message broadcasted');
  }

  /**
   * 發送訊息給特定 socket
   */
  sendToSocket(socketId, event, data) {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot send to socket');
      return;
    }

    this.io.to(socketId).emit(event, data);
    logger.debug({ socketId, event, data }, 'Message sent to socket');
  }

  /**
   * 取得連接統計
   */
  getConnectionStats() {
    const currentTime = Date.now();
    let activeSubscriptions = 0;
    let inactiveConnections = 0;
    
    for (const [socketId, metadata] of this.connectionMetadata.entries()) {
      activeSubscriptions += metadata.subscriptions.size;
      
      const inactiveTime = currentTime - metadata.lastActivity;
      if (inactiveTime > 5 * 60 * 1000) { // 5 分鐘無活動
        inactiveConnections++;
      }
    }
    
    return {
      activeConnections: this.activeConnections.size,
      processingJobs: this.processingJobs.size,
      rateLimitedIPs: this.socketRateLimit.size,
      activeSubscriptions,
      inactiveConnections,
      memoryUsage: {
        connectionMetadata: this.connectionMetadata.size,
        cleanupIntervals: this.cleanupIntervals.size
      }
    };
  }

  /**
   * 取得活躍連接列表
   */
  getActiveConnections() {
    const connections = [];
    const currentTime = Date.now();
    
    for (const [socketId, socket] of this.activeConnections) {
      const metadata = this.connectionMetadata.get(socketId);
      const inactiveTime = metadata ? currentTime - metadata.lastActivity : 0;
      
      connections.push({
        id: socketId,
        user: socket.user?.id || 'anonymous',
        connectedAt: socket.handshake.time,
        address: socket.handshake.address,
        lastActivity: metadata ? new Date(metadata.lastActivity).toISOString() : null,
        inactiveTime: Math.floor(inactiveTime / 1000), // 秒
        subscriptions: metadata ? Array.from(metadata.subscriptions) : [],
        connected: socket.connected
      });
    }
    return connections;
  }

  /**
   * 強制斷開特定連接
   */
  disconnectSocket(socketId, reason = 'server_disconnect') {
    const socket = this.activeConnections.get(socketId);
    if (socket) {
      socket.emit('disconnect_notice', { reason, message: 'Connection terminated by server' });
      socket.disconnect(true);
      this.cleanupConnection(socketId, reason);
      logger.info({ socketId, reason }, 'Socket forcefully disconnected');
      return true;
    }
    return false;
  }
  
  /**
   * 強制斷開所有非活躍連接
   */
  disconnectInactiveConnections(inactiveThreshold = 30 * 60 * 1000) { // 預設 30 分鐘
    const currentTime = Date.now();
    let disconnected = 0;
    
    for (const [socketId, metadata] of this.connectionMetadata.entries()) {
      const inactiveTime = currentTime - metadata.lastActivity;
      
      if (inactiveTime > inactiveThreshold) {
        if (this.disconnectSocket(socketId, 'inactivity_timeout')) {
          disconnected++;
        }
      }
    }
    
    logger.info({ disconnected, threshold: inactiveThreshold }, 'Inactive connections cleanup completed');
    return disconnected;
  }

  /**
   * 清理過期的速率限制記錄
   */
  cleanupRateLimits() {
    const now = Date.now();
    let cleanedIPs = 0;
    
    // 清理 IP 速率限制記錄
    for (const [ip, limit] of this.socketRateLimit.entries()) {
      if (now > limit.resetTime + 60000) { // 保留 1 分鐘的緩衝時間
        this.socketRateLimit.delete(ip);
        cleanedIPs++;
      }
    }
    
    // 清理事件速率限制記錄
    let cleanedEventLimits = 0;
    for (const [socketId, metadata] of this.connectionMetadata.entries()) {
      for (const [key, eventLimit] of metadata.eventRateLimit.entries()) {
        if (now > eventLimit.resetTime + 60000) {
          metadata.eventRateLimit.delete(key);
          cleanedEventLimits++;
        }
      }
    }
    
    if (cleanedIPs > 0 || cleanedEventLimits > 0) {
      logger.debug({
        cleanedIPs,
        cleanedEventLimits,
        remainingIPLimits: this.socketRateLimit.size
      }, 'Rate limit cleanup completed');
    }
  }

  /**
   * 檢查是否為本地 IP
   */
  isLocalIP(ip) {
    const cleanIP = ip.replace(/^::ffff:/, '');
    return ['127.0.0.1', '::1', 'localhost'].includes(cleanIP) || 
           cleanIP.startsWith('192.168.') || 
           cleanIP.startsWith('10.') ||
           cleanIP === '127.0.0.1';
  }

  /**
   * 驗證 session（簡化版本，實際應該與 auth 模組整合）
   */
  validateSession(sessionId) {
    // 這裡應該與實際的 session 存儲整合
    return true; // 暫時總是返回 true
  }

  /**
   * 取得 session（簡化版本）
   */
  getSession(sessionId) {
    // 這裡應該與實際的 session 存儲整合
    return {
      user: { id: 'session-user', role: 'user', permissions: ['*'] }
    };
  }

  /**
   * 健康檢查
   */
  healthCheck() {
    const stats = this.getConnectionStats();
    const currentTime = Date.now();
    
    // 檢查記憶體洩漏指標
    const memoryWarnings = [];
    if (stats.inactiveConnections > stats.activeConnections * 0.3) {
      memoryWarnings.push('High inactive connections ratio');
    }
    if (this.processingJobs.size > 100) {
      memoryWarnings.push('Too many processing jobs');
    }
    if (this.socketRateLimit.size > 1000) {
      memoryWarnings.push('Rate limit cache too large');
    }
    
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      ...stats,
      memoryWarnings,
      uptime: this.isInitialized ? currentTime - this.initTime : 0,
      cleanupIntervals: this.cleanupIntervals.size
    };
  }

  /**
   * 關閉 WebSocket 服務
   */
  async close() {
    if (this.io) {
      logger.info('Initiating WebSocket service shutdown');
      
      // 停止所有清理定時器
      for (const [name, interval] of this.cleanupIntervals.entries()) {
        clearInterval(interval);
        logger.debug({ intervalName: name }, 'Cleanup interval cleared');
      }
      this.cleanupIntervals.clear();
      
      // 清理所有連線的定時器
      for (const [socketId, metadata] of this.connectionMetadata.entries()) {
        if (metadata.heartbeatInterval) {
          clearInterval(metadata.heartbeatInterval);
        }
        if (metadata.timeoutTimer) {
          clearTimeout(metadata.timeoutTimer);
        }
      }
      
      // 通知所有客戶端伺服器即將關閉
      this.broadcast('server_shutdown', { 
        message: 'Server is shutting down', 
        timestamp: new Date().toISOString() 
      });
      
      // 給客戶端一些時間處理關閉通知
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 關閉 Socket.IO 伺服器
      await new Promise((resolve) => {
        this.io.close(() => {
          logger.info('WebSocket server closed');
          resolve();
        });
      });
      
      // 清理所有記憶體結構
      this.activeConnections.clear();
      this.processingJobs.clear();
      this.socketRateLimit.clear();
      this.connectionMetadata.clear();
      this.isInitialized = false;
      
      logger.info('WebSocket service shutdown completed');
    }
  }
}

// 創建單例實例
const webSocketService = new WebSocketService();

export default webSocketService;