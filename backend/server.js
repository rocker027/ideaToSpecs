/**
 * 主伺服器入口點 - 重構版本
 * 整合所有模組化組件的精簡主檔案
 */

import express from 'express';
import compression from 'compression';
import { createServer } from 'http';
import statusMonitor from 'express-status-monitor';

// 導入配置
import { 
  SERVER_CONFIG, 
  MIDDLEWARE_CONFIG, 
  MONITORING_CONFIG,
  APP_CONSTANTS,
  validateConfig 
} from './config/serverConfig.js';

// 導入服務
import databaseService from './services/databaseService.js';
import webSocketService from './services/websocketService.js';
import geminiService from './services/geminiService.js';

// 導入中間件
import { 
  setupHelmet, 
  setupCORS, 
  setupRateLimit, 
  additionalSecurityHeaders,
  maliciousRequestDetection,
  userAgentSecurity
} from './middleware/security.js';

import { 
  setupMorganLogger, 
  requestResponseLogger, 
  errorLogger,
  logger 
} from './middleware/logging.js';

import { sanitizeInput, checkRequestSize } from './middleware/validation.js';

import { 
  requestIdMiddleware,
  notFoundHandler,
  errorHandlerStack
} from './middleware/errorMiddleware.js';

// 導入路由
import apiRoutes from './routes/apiRoutes.js';

class IdeaToSpecsServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;
  }

  /**
   * 初始化應用程式
   */
  async initialize() {
    try {
      // 驗證配置
      validateConfig();
      
      // 設置基本中間件
      this.setupBasicMiddleware();
      
      // 設置安全中間件
      this.setupSecurityMiddleware();
      
      // 設置日誌中間件
      this.setupLoggingMiddleware();
      
      // 設置應用程式中間件
      this.setupApplicationMiddleware();
      
      // 設置路由
      this.setupRoutes();
      
      // 設置錯誤處理
      this.setupErrorHandling();
      
      // 初始化服務
      await this.initializeServices();
      
      // 創建 HTTP 伺服器
      this.server = createServer(this.app);
      
      // 初始化 WebSocket
      webSocketService.initialize(this.server);
      
      logger.info('Server initialized successfully');
      
    } catch (error) {
      logger.error({ error }, 'Failed to initialize server');
      throw error;
    }
  }

  /**
   * 設置基本中間件
   */
  setupBasicMiddleware() {
    // 請求 ID 中間件（必須在最前面）
    this.app.use(requestIdMiddleware);
    
    // 狀態監控
    this.app.use(statusMonitor(MONITORING_CONFIG));
    
    // 壓縮
    this.app.use(compression(MIDDLEWARE_CONFIG.compression));
    
    // 請求體解析
    this.app.use(express.json(MIDDLEWARE_CONFIG.json));
    this.app.use(express.urlencoded(MIDDLEWARE_CONFIG.urlencoded));
  }

  /**
   * 設置安全中間件
   */
  setupSecurityMiddleware() {
    // Helmet 安全標頭
    this.app.use(setupHelmet());
    
    // CORS
    this.app.use(setupCORS());
    
    // 額外安全標頭
    this.app.use(additionalSecurityHeaders);
    
    // 惡意請求檢測
    this.app.use(maliciousRequestDetection);
    
    // 用戶代理安全檢查
    this.app.use(userAgentSecurity);
    
    // 速率限制
    this.app.use(setupRateLimit());
    
    // 請求大小限制
    this.app.use(checkRequestSize(10 * 1024 * 1024)); // 10MB
  }

  /**
   * 設置日誌中間件
   */
  setupLoggingMiddleware() {
    // Morgan HTTP 日誌
    this.app.use(setupMorganLogger());
    
    // 自定義請求/回應日誌
    this.app.use(requestResponseLogger);
  }

  /**
   * 設置應用程式中間件
   */
  setupApplicationMiddleware() {
    // 輸入清理
    this.app.use(sanitizeInput);
  }

  /**
   * 設置路由
   */
  setupRoutes() {
    // API 路由
    this.app.use('/api', apiRoutes);
    
    // 404 處理器（放在所有路由之後）
    this.app.use('*', notFoundHandler);
  }

  /**
   * 設置錯誤處理
   */
  setupErrorHandling() {
    // 錯誤日誌中間件
    this.app.use(errorLogger);
    
    // 使用標準化錯誤處理中間件堆疊
    errorHandlerStack.forEach(middleware => {
      this.app.use(middleware);
    });
  }

  /**
   * 初始化所有服務
   */
  async initializeServices() {
    logger.info('Initializing services...');
    
    try {
      // 初始化資料庫
      await databaseService.initialize();
      logger.info('Database service initialized');
      
      // 初始化 Gemini 服務
      await geminiService.initialize();
      logger.info('Gemini service initialized');
      
      // 設置資料庫維護排程
      this.scheduleDatabaseMaintenance();
      
      logger.info('All services initialized successfully');
      
    } catch (error) {
      logger.error({ error }, 'Failed to initialize services');
      throw error;
    }
  }

  /**
   * 設置資料庫維護排程
   */
  scheduleDatabaseMaintenance() {
    // 每日維護
    setInterval(async () => {
      try {
        await databaseService.performMaintenance();
        logger.info('Scheduled database maintenance completed');
      } catch (error) {
        logger.error({ error }, 'Scheduled database maintenance failed');
      }
    }, APP_CONSTANTS.DATABASE_MAINTENANCE_INTERVAL);
    
    // 初始維護（5 分鐘後執行）
    setTimeout(async () => {
      try {
        await databaseService.performMaintenance();
        logger.info('Initial database maintenance completed');
      } catch (error) {
        logger.error({ error }, 'Initial database maintenance failed');
      }
    }, APP_CONSTANTS.INITIAL_MAINTENANCE_DELAY);
  }

  /**
   * 啟動伺服器
   */
  async start() {
    try {
      await this.initialize();
      
      // 啟動 HTTP 伺服器
      await new Promise((resolve, reject) => {
        this.server.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      
      // 設置優雅關閉處理
      this.setupGracefulShutdown();
      
      // 記錄啟動資訊
      this.logStartupInfo();
      
    } catch (error) {
      logger.error({ error }, 'Failed to start server');
      process.exit(1);
    }
  }

  /**
   * 設置優雅關閉
   */
  setupGracefulShutdown() {
    const gracefulShutdown = (signal) => {
      if (this.isShuttingDown) {
        logger.warn(`Received ${signal} during shutdown, forcing exit`);
        process.exit(1);
      }
      
      this.isShuttingDown = true;
      logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');
      
      // 停止接受新連接
      this.server.close(() => {
        logger.info('HTTP server closed');
        
        // 關閉 WebSocket 連接
        webSocketService.close().then(() => {
          logger.info('WebSocket server closed');
          
          // 關閉資料庫連接
          return databaseService.close();
        }).then(() => {
          logger.info('Database connections closed');
          logger.info('Graceful shutdown completed');
          process.exit(0);
        }).catch((error) => {
          logger.error({ error }, 'Error during graceful shutdown');
          process.exit(1);
        });
      });
      
      // 強制關閉超時
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, APP_CONSTANTS.GRACEFUL_SHUTDOWN_TIMEOUT);
    };
    
    // 監聽關閉信號
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // 監聽未捕獲的異常
    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught exception');
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled promise rejection');
      gracefulShutdown('unhandledRejection');
    });
  }

  /**
   * 記錄啟動資訊
   */
  logStartupInfo() {
    const startupInfo = {
      port: SERVER_CONFIG.port,
      host: SERVER_CONFIG.host,
      environment: SERVER_CONFIG.nodeEnv,
      version: SERVER_CONFIG.version,
      nodeVersion: process.version,
      pid: process.pid
    };
    
    logger.info(startupInfo, 'Server started successfully');
    
    console.log(`\n🚀 Idea-to-Specs Server started successfully!`);
    console.log(`📍 Server: http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`);
    console.log(`📚 API Docs: http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}/api/docs`);
    console.log(`❤️  Health: http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}/api/health`);
    console.log(`📊 Monitor: http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}/status`);
    console.log(`🔌 WebSocket: ws://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}/socket.io`);
    console.log(`🌍 Environment: ${SERVER_CONFIG.nodeEnv}`);
    console.log(`🆔 Process ID: ${process.pid}`);
    console.log(`\n📋 Available API Endpoints:`);
    console.log(`  POST   /api/generate          - Generate specification (with WebSocket updates)`);
    console.log(`  GET    /api/history           - Get paginated history`);
    console.log(`  GET    /api/spec/:id          - Get specific specification`);
    console.log(`  GET    /api/download/:id      - Download as Markdown`);
    console.log(`  DELETE /api/history/:id       - Delete entry`);
    console.log(`  GET    /api/health            - Comprehensive health check`);
    console.log(`  GET    /api/gemini/health     - Gemini CLI health check`);
    console.log(`  GET    /api/docs              - API documentation`);
    console.log(`  GET    /status                - System monitoring dashboard\n`);
  }

  /**
   * 取得伺服器狀態
   */
  getStatus() {
    return {
      isRunning: !!this.server && this.server.listening,
      isShuttingDown: this.isShuttingDown,
      port: SERVER_CONFIG.port,
      environment: SERVER_CONFIG.nodeEnv,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      pid: process.pid
    };
  }
}

// 創建並啟動伺服器實例
const server = new IdeaToSpecsServer();

// 如果是直接執行此檔案，則啟動伺服器
if (import.meta.url === `file://${process.argv[1]}`) {
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default server;