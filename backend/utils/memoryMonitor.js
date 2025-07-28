/**
 * WebSocket 記憶體監控工具
 * 監控 WebSocket 連線和記憶體使用情況
 */

import pino from 'pino';

const logger = pino();

class MemoryMonitor {
  constructor(webSocketService) {
    this.webSocketService = webSocketService;
    this.monitoringInterval = null;
    this.memoryHistory = [];
    this.alertThresholds = {
      maxConnections: 1000,
      maxProcessingJobs: 100,
      maxMemoryGrowthPercent: 50,
      maxInactiveRatio: 0.4
    };
    this.baselineMemory = null;
  }

  /**
   * 開始監控
   */
  startMonitoring(intervalMs = 30000) { // 預設 30 秒
    if (this.monitoringInterval) {
      logger.warn('Memory monitoring is already running');
      return;
    }

    this.baselineMemory = process.memoryUsage();
    logger.info('Starting WebSocket memory monitoring');

    this.monitoringInterval = setInterval(() => {
      this.performCheck();
    }, intervalMs);

    // 立即執行一次檢查
    this.performCheck();
  }

  /**
   * 停止監控
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('WebSocket memory monitoring stopped');
    }
  }

  /**
   * 執行監控檢查
   */
  performCheck() {
    try {
      const timestamp = new Date().toISOString();
      const memoryUsage = process.memoryUsage();
      const wsStats = this.webSocketService.getConnectionStats();
      const wsHealth = this.webSocketService.healthCheck();
      
      const memorySnapshot = {
        timestamp,
        memory: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss,
          arrayBuffers: memoryUsage.arrayBuffers
        },
        websocket: {
          ...wsStats,
          uptime: wsHealth.uptime,
          memoryWarnings: wsHealth.memoryWarnings
        },
        process: {
          pid: process.pid,
          uptime: process.uptime() * 1000, // 轉換為毫秒
          cpuUsage: process.cpuUsage()
        }
      };

      // 計算記憶體增長
      if (this.baselineMemory) {
        const heapGrowth = memoryUsage.heapUsed - this.baselineMemory.heapUsed;
        const heapGrowthPercent = (heapGrowth / this.baselineMemory.heapUsed) * 100;
        
        memorySnapshot.memoryAnalysis = {
          heapGrowthMB: heapGrowth / 1024 / 1024,
          heapGrowthPercent: heapGrowthPercent,
          isGrowthConcerning: heapGrowthPercent > this.alertThresholds.maxMemoryGrowthPercent
        };
      }

      // 添加到歷史記錄
      this.memoryHistory.push(memorySnapshot);
      
      // 保持最近 100 筆記錄
      if (this.memoryHistory.length > 100) {
        this.memoryHistory.shift();
      }

      // 檢查警告條件
      this.checkAlerts(memorySnapshot);

      // 定期記錄統計資訊
      if (this.memoryHistory.length % 10 === 0) { // 每 10 次檢查記錄一次詳細資訊
        logger.info({
          websocketStats: wsStats,
          memoryUsageMB: {
            heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
            heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
            external: (memoryUsage.external / 1024 / 1024).toFixed(2)
          },
          warnings: wsHealth.memoryWarnings
        }, 'WebSocket memory monitoring snapshot');
      }

    } catch (error) {
      logger.error({ error }, 'Error during memory monitoring check');
    }
  }

  /**
   * 檢查警告條件
   */
  checkAlerts(snapshot) {
    const alerts = [];

    // 檢查連線數量
    if (snapshot.websocket.activeConnections > this.alertThresholds.maxConnections) {
      alerts.push({
        type: 'high_connection_count',
        value: snapshot.websocket.activeConnections,
        threshold: this.alertThresholds.maxConnections
      });
    }

    // 檢查處理中的作業數量
    if (snapshot.websocket.processingJobs > this.alertThresholds.maxProcessingJobs) {
      alerts.push({
        type: 'high_processing_jobs',
        value: snapshot.websocket.processingJobs,
        threshold: this.alertThresholds.maxProcessingJobs
      });
    }

    // 檢查記憶體增長
    if (snapshot.memoryAnalysis && snapshot.memoryAnalysis.isGrowthConcerning) {
      alerts.push({
        type: 'high_memory_growth',
        value: snapshot.memoryAnalysis.heapGrowthPercent,
        threshold: this.alertThresholds.maxMemoryGrowthPercent
      });
    }

    // 檢查非活躍連線比例
    const inactiveRatio = snapshot.websocket.activeConnections > 0 
      ? snapshot.websocket.inactiveConnections / snapshot.websocket.activeConnections 
      : 0;
    
    if (inactiveRatio > this.alertThresholds.maxInactiveRatio) {
      alerts.push({
        type: 'high_inactive_ratio',
        value: inactiveRatio,
        threshold: this.alertThresholds.maxInactiveRatio
      });
    }

    // 發送警告
    if (alerts.length > 0) {
      logger.warn({
        alerts,
        snapshot: {
          timestamp: snapshot.timestamp,
          connections: snapshot.websocket.activeConnections,
          memory: snapshot.memory.heapUsed,
          warnings: snapshot.websocket.memoryWarnings
        }
      }, 'WebSocket memory monitoring alerts triggered');

      // 執行自動修復措施
      this.performAutoRecovery(alerts);
    }
  }

  /**
   * 執行自動修復措施
   */
  performAutoRecovery(alerts) {
    logger.info({ alertCount: alerts.length }, 'Performing auto-recovery measures');

    for (const alert of alerts) {
      switch (alert.type) {
        case 'high_inactive_ratio':
          // 斷開非活躍連線
          const disconnected = this.webSocketService.disconnectInactiveConnections(5 * 60 * 1000); // 5 分鐘閾值
          logger.info({ disconnected }, 'Disconnected inactive connections');
          break;

        case 'high_processing_jobs':
          // 清理過期的處理中作業
          this.webSocketService.performPeriodicCleanup();
          logger.info('Performed periodic cleanup for processing jobs');
          break;

        case 'high_connection_count':
          // 清理速率限制記錄
          this.webSocketService.cleanupRateLimits();
          logger.info('Cleaned up rate limit records');
          break;

        case 'high_memory_growth':
          // 觸發垃圾回收（如果可用）
          if (global.gc) {
            global.gc();
            logger.info('Triggered garbage collection');
          }
          break;
      }
    }
  }

  /**
   * 取得監控報告
   */
  getMonitoringReport() {
    if (this.memoryHistory.length === 0) {
      return { error: 'No monitoring data available' };
    }

    const latest = this.memoryHistory[this.memoryHistory.length - 1];
    const oldest = this.memoryHistory[0];

    // 計算趨勢
    const memoryTrend = {
      heapUsedChange: latest.memory.heapUsed - oldest.memory.heapUsed,
      connectionTrend: latest.websocket.activeConnections - oldest.websocket.activeConnections,
      timeSpan: new Date(latest.timestamp) - new Date(oldest.timestamp)
    };

    // 計算平均值
    const averages = this.memoryHistory.reduce((acc, snapshot) => {
      acc.heapUsed += snapshot.memory.heapUsed;
      acc.activeConnections += snapshot.websocket.activeConnections;
      acc.processingJobs += snapshot.websocket.processingJobs;
      return acc;
    }, { heapUsed: 0, activeConnections: 0, processingJobs: 0 });

    const count = this.memoryHistory.length;
    averages.heapUsed /= count;
    averages.activeConnections /= count;
    averages.processingJobs /= count;

    return {
      summary: {
        monitoringDuration: memoryTrend.timeSpan,
        snapshotCount: count,
        latest: latest,
        averages: averages,
        trends: memoryTrend
      },
      history: this.memoryHistory.slice(-20), // 最近 20 筆記錄
      alerts: {
        thresholds: this.alertThresholds,
        recentWarnings: latest.websocket.memoryWarnings
      }
    };
  }

  /**
   * 清理監控歷史
   */
  clearHistory() {
    this.memoryHistory = [];
    this.baselineMemory = process.memoryUsage();
    logger.info('Memory monitoring history cleared');
  }

  /**
   * 更新警告閾值
   */
  updateThresholds(newThresholds) {
    this.alertThresholds = { ...this.alertThresholds, ...newThresholds };
    logger.info({ thresholds: this.alertThresholds }, 'Memory monitoring thresholds updated');
  }

  /**
   * 取得即時統計
   */
  getCurrentStats() {
    const memoryUsage = process.memoryUsage();
    const wsStats = this.webSocketService.getConnectionStats();
    
    return {
      timestamp: new Date().toISOString(),
      memory: {
        heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
        externalMB: (memoryUsage.external / 1024 / 1024).toFixed(2),
        rssMB: (memoryUsage.rss / 1024 / 1024).toFixed(2)
      },
      websocket: wsStats,
      monitoring: {
        isRunning: !!this.monitoringInterval,
        historyCount: this.memoryHistory.length,
        alertThresholds: this.alertThresholds
      }
    };
  }
}

export default MemoryMonitor;