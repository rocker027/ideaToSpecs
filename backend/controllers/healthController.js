/**
 * 健康檢查控制器
 * 處理系統健康檢查和監控相關的 API 邏輯
 */

import databaseService from '../services/databaseService.js';
import geminiService from '../services/geminiService.js';
import webSocketService from '../services/websocketService.js';
import { SERVER_CONFIG, isDevelopment } from '../config/serverConfig.js';
import { createError } from '../utils/errorHandler.js';
import { healthCheckErrorHandler } from '../middleware/errorMiddleware.js';
import { catchAsync } from '../middleware/errorMiddleware.js';
import pino from 'pino';
import os from 'os';

const logger = pino();

class HealthController {
  /**
   * 系統健康檢查
   */
  systemHealth = catchAsync(async (req, res) => {
    // 測試資料庫連接
    let dbHealth;
    try {
      dbHealth = await databaseService.healthCheck();
    } catch (error) {
      throw healthCheckErrorHandler(error, 'database');
    }
    
    // 測試 Gemini CLI
    let geminiHealth;
    try {
      geminiHealth = await geminiService.healthCheck();
    } catch (error) {
      throw healthCheckErrorHandler(error, 'gemini');
    }
    
    // 取得 WebSocket 統計
    let wsHealth;
    try {
      wsHealth = webSocketService.healthCheck();
    } catch (error) {
      throw healthCheckErrorHandler(error, 'websocket');
    }
    
    // 取得系統統計
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();
    
    // 取得系統負載（僅 Unix 系統）
    let loadAverage = [];
    try {
      loadAverage = os.loadavg();
    } catch (error) {
      logger.debug('Load average not available on this system');
    }
    
    const healthStatus = {
      status: 'OK', 
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      services: {
        database: dbHealth.status,
        geminiCLI: {
          status: geminiHealth.status,
          available: geminiHealth.available,
          configured: geminiHealth.configured,
          version: geminiHealth.version,
          error: geminiHealth.error
        },
        websocket: {
          status: wsHealth.status,
          activeConnections: wsHealth.activeConnections,
          processingJobs: wsHealth.processingJobs
        }
      },
      version: SERVER_CONFIG.version,
      environment: SERVER_CONFIG.nodeEnv,
      uptime: Math.floor(uptime),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        pid: process.pid,
        loadAverage: loadAverage.length > 0 ? loadAverage : null,
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      },
      statistics: {
        activeConnections: wsHealth.activeConnections,
        processingJobs: wsHealth.processingJobs
      }
    };
    
    // 如果任何服務不健康，返回 503
    const isHealthy = dbHealth.status === 'healthy' && 
                     geminiHealth.status !== 'error' && 
                     wsHealth.status === 'healthy';
    
    if (!isHealthy) {
      const healthError = createError.serviceUnavailable('system', 'One or more services are unhealthy');
      healthError.setRequestId(req.requestId);
      healthError.addMetadata('healthStatus', healthStatus);
      throw healthError;
    }
    
    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  });

  /**
   * Gemini CLI 專用健康檢查
   */
  geminiHealth = catchAsync(async (req, res) => {
    const useCache = req.query.cache !== 'false';
    const healthStatus = await geminiService.healthCheck(useCache);
    
    if (healthStatus.status !== 'ready') {
      const geminiError = createError.geminiCliNotAvailable(healthStatus.error || 'Gemini CLI not ready');
      geminiError.setRequestId(req.requestId);
      geminiError.addMetadata('healthStatus', healthStatus);
      throw geminiError;
    }
    
    const statusCode = healthStatus.status === 'ready' ? 200 : 503;
    res.status(statusCode).json({
      ...healthStatus,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Gemini CLI 認證狀態檢查
   */
  geminiAuthStatus = catchAsync(async (req, res) => {
    const authStatus = await geminiService.getAuthStatus();
    res.json({
      ...authStatus,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * 資料庫健康檢查
   */
  databaseHealth = catchAsync(async (req, res) => {
    const dbHealth = await databaseService.healthCheck();
    const dbStats = await databaseService.getStats();
    const performanceStats = await databaseService.getPerformanceStats(1); // 最近 1 小時
    
    const healthStatus = {
      ...dbHealth,
      statistics: dbStats,
      recentPerformance: performanceStats.slice(0, 10), // 最近 10 個端點
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    };
    
    if (dbHealth.status !== 'healthy') {
      const dbError = createError.databaseConnectionFailed();
      dbError.setRequestId(req.requestId);
      dbError.addMetadata('healthStatus', healthStatus);
      throw dbError;
    }
    
    const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  });

  /**
   * WebSocket 健康檢查
   */
  websocketHealth = catchAsync(async (req, res) => {
    const wsHealth = webSocketService.healthCheck();
    const connectionStats = webSocketService.getConnectionStats();
    const activeConnections = webSocketService.getActiveConnections();
    
    const healthStatus = {
      ...wsHealth,
      statistics: connectionStats,
      activeConnections: activeConnections.slice(0, 20), // 最近 20 個連接
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    };
    
    if (wsHealth.status !== 'healthy') {
      const wsError = createError.websocketConnectionFailed(wsHealth.error || 'WebSocket service unhealthy');
      wsError.setRequestId(req.requestId);
      wsError.addMetadata('healthStatus', healthStatus);
      throw wsError;
    }
    
    const statusCode = wsHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  });

  /**
   * 簡化的就緒檢查（用於 Kubernetes 等）
   */
  readinessCheck = catchAsync(async (req, res) => {
    // 快速檢查關鍵服務
    const dbCheck = await databaseService.db.execute('SELECT 1');
    const geminiCheck = geminiService.isAvailable;
    
    if (!dbCheck || !geminiCheck) {
      const readinessError = createError.serviceUnavailable('system', 'Core services not ready');
      readinessError.setRequestId(req.requestId);
      readinessError.addMetadata('database', !!dbCheck);
      readinessError.addMetadata('gemini', !!geminiCheck);
      throw readinessError;
    }
    
    res.status(200).json({ 
      status: 'ready', 
      requestId: req.requestId,
      timestamp: new Date().toISOString() 
    });
  });

  /**
   * 活性檢查（用於 Kubernetes 等）
   */
  livenessCheck = catchAsync(async (req, res) => {
    // 簡單的活性檢查 - 只要服務器能回應就算活著
    res.status(200).json({ 
      status: 'alive', 
      uptime: process.uptime(),
      requestId: req.requestId,
      timestamp: new Date().toISOString() 
    });
  });

  /**
   * 系統指標端點
   */
  systemMetrics = catchAsync(async (req, res) => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // 取得資料庫統計
    const dbStats = await databaseService.getStats();
    const perfStats = await databaseService.getPerformanceStats(1);
    
    // 取得 WebSocket 統計
    const wsStats = webSocketService.getConnectionStats();
    
    // 計算記憶體使用百分比
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    
    // 計算 CPU 負載
    const cpus = os.cpus();
    const loadAverage = os.loadavg ? os.loadavg() : [0, 0, 0];
    
    const metrics = {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        process: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          heapUsedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100
        },
        system: {
          total: totalMemory,
          free: freeMemory,
          used: usedMemory,
          usagePercent: memoryUsagePercent
        }
      },
      cpu: {
        process: cpuUsage,
        system: {
          cores: cpus.length,
          loadAverage: loadAverage,
          loadPercent: loadAverage[0] / cpus.length * 100
        }
      },
      database: {
        totalRecords: dbStats.totalIdeas,
        recentQueries: perfStats.length,
        avgResponseTime: perfStats.length > 0 ? 
          perfStats.reduce((sum, stat) => sum + stat.avg_duration, 0) / perfStats.length : 0
      },
      websocket: wsStats,
      gc: process.memoryUsage ? {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      } : null
    };
    
    res.json(metrics);
  });

  /**
   * 清除健康檢查緩存
   */
  clearHealthCache = catchAsync(async (req, res) => {
    geminiService.clearHealthCache();
    webSocketService.cleanupRateLimits();
    
    res.json({
      message: 'Health check caches cleared',
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  });
}

export default new HealthController();