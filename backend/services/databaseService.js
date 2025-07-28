/**
 * 資料庫服務模組
 * 管理資料庫連接、查詢和維護
 */

import { createClient } from '@libsql/client';
import { DATABASE_CONFIG, JOB_STATUSES } from '../config/serverConfig.js';
import pino from 'pino';

const logger = pino();

// 性能监控配置
const PERFORMANCE_CONFIG = {
  SLOW_QUERY_THRESHOLD: 1000, // 1秒
  CONNECTION_TIMEOUT: 30000,   // 30秒
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,           // 1秒
  BATCH_SIZE: 100,             // 批处理大小
  CURSOR_PAGINATION_LIMIT: 50  // 游标分页限制
};

// 查询统计缓存
const queryStatsCache = new Map();
const STATS_CACHE_TTL = 300000; // 5分钟

class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.connectionPool = null;
    this.preparedStatements = new Map();
    this.queryMetrics = {
      totalQueries: 0,
      slowQueries: 0,
      averageResponseTime: 0,
      lastSlowQuery: null
    };
  }

  /**
   * 初始化資料庫連接
   */
  async initialize() {
    try {
      // 創建優化的資料庫連接 - 強制使用本地SQLite進行測試
      const isLocalFile = DATABASE_CONFIG.url.startsWith('file:');
      this.db = createClient({
        url: isLocalFile ? DATABASE_CONFIG.url : 'file:../database/local.db',
        authToken: isLocalFile ? undefined : DATABASE_CONFIG.authToken,
        // 只有遠程數據庫才添加同步配置
        ...(isLocalFile ? {} : {
          syncUrl: DATABASE_CONFIG.syncUrl || DATABASE_CONFIG.url,
          syncInterval: 60000, // 同步間隔1分鐘
        })
      });

      // 測試連接
      await this.testConnection();
      
      await this.createTables();
      await this.createOptimizedIndexes();
      await this.prepareCriticalStatements();
      
      // 初始化性能監控
      this.initializePerformanceMonitoring();
      
      this.isInitialized = true;
      logger.info('Database initialized successfully with performance optimizations');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize database');
      throw error;
    }
  }

  /**
   * 創建資料表
   */
  async createTables() {
    // 主要的 ideas 資料表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_input TEXT NOT NULL,
        generated_spec TEXT NOT NULL,
        status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        processing_time_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 性能指標資料表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        status_code INTEGER NOT NULL,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    logger.info('Database tables created successfully');
  }

  /**
   * 創建優化索引以提升性能
   */
  async createOptimizedIndexes() {
    const indexes = [
      // 基本索引
      'CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status)',
      'CREATE INDEX IF NOT EXISTS idx_performance_created_at ON performance_metrics(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_performance_endpoint ON performance_metrics(endpoint)',
      
      // 複合索引優化查詢性能
      'CREATE INDEX IF NOT EXISTS idx_ideas_status_created ON ideas(status, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ideas_search_created ON ideas(created_at DESC, user_input, generated_spec)',
      'CREATE INDEX IF NOT EXISTS idx_ideas_processing_time ON ideas(processing_time_ms DESC) WHERE processing_time_ms IS NOT NULL',
      
      // 全文搜索索引（如果支持的話）
      'CREATE INDEX IF NOT EXISTS idx_ideas_user_input_fts ON ideas(user_input)',
      'CREATE INDEX IF NOT EXISTS idx_ideas_generated_spec_fts ON ideas(generated_spec)',
      
      // 性能指標優化索引
      'CREATE INDEX IF NOT EXISTS idx_performance_endpoint_time ON performance_metrics(endpoint, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_performance_duration ON performance_metrics(duration_ms DESC)',
      'CREATE INDEX IF NOT EXISTS idx_performance_status_endpoint ON performance_metrics(status_code, endpoint)',
      
      // 統計查詢優化索引
      'CREATE INDEX IF NOT EXISTS idx_ideas_date_stats ON ideas(date(created_at), status)',
      'CREATE INDEX IF NOT EXISTS idx_ideas_updated_at ON ideas(updated_at DESC)'
    ];

    const startTime = Date.now();
    let createdCount = 0;
    
    for (const indexSql of indexes) {
      try {
        await this.db.execute(indexSql);
        createdCount++;
      } catch (error) {
        logger.warn({ error, sql: indexSql }, 'Failed to create index, possibly already exists');
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info({ createdCount, duration }, 'Database indexes created successfully');
  }

  /**
   * 測試數據庫連接
   */
  async testConnection() {
    const maxRetries = PERFORMANCE_CONFIG.MAX_RETRY_ATTEMPTS;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const startTime = Date.now();
        await this.db.execute('SELECT 1');
        const duration = Date.now() - startTime;
        
        logger.info({ duration, attempt: attempt + 1 }, 'Database connection test successful');
        return true;
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          logger.error({ error, attempts: attempt }, 'Database connection test failed after max retries');
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, PERFORMANCE_CONFIG.RETRY_DELAY * attempt));
        logger.warn({ error, attempt }, 'Database connection test failed, retrying...');
      }
    }
  }

  /**
   * 準備關鍵預備語句
   */
  async prepareCriticalStatements() {
    // 預備常用查詢語句以提升性能
    this.preparedStatements.set('create_idea', {
      sql: 'INSERT INTO ideas (user_input, generated_spec, status) VALUES (?, ?, ?)',
      description: 'Create new idea entry'
    });
    
    this.preparedStatements.set('update_idea', {
      sql: `UPDATE ideas SET 
            generated_spec = ?, 
            status = ?, 
            processing_time_ms = ?, 
            updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?`,
      description: 'Update idea entry'
    });
    
    this.preparedStatements.set('get_idea_by_id', {
      sql: 'SELECT * FROM ideas WHERE id = ?',
      description: 'Get idea by ID'
    });
    
    this.preparedStatements.set('delete_idea', {
      sql: 'DELETE FROM ideas WHERE id = ?',
      description: 'Delete idea by ID'
    });
    
    this.preparedStatements.set('get_history_count', {
      sql: 'SELECT COUNT(*) as total FROM ideas',
      description: 'Get total ideas count'
    });
    
    this.preparedStatements.set('get_history_count_search', {
      sql: 'SELECT COUNT(*) as total FROM ideas WHERE user_input LIKE ? OR generated_spec LIKE ?',
      description: 'Get total ideas count with search'
    });
    
    logger.info(`Prepared ${this.preparedStatements.size} critical statements`);
  }

  /**
   * 初始化性能監控
   */
  initializePerformanceMonitoring() {
    // 定期清理查詢統計緩存
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of queryStatsCache.entries()) {
        if (now - data.timestamp > STATS_CACHE_TTL) {
          queryStatsCache.delete(key);
        }
      }
    }, STATS_CACHE_TTL);
    
    logger.info('Performance monitoring initialized');
  }

  /**
   * 執行查詢並記錄性能指標
   */
  async executeWithMetrics(sql, args = [], description = 'Query') {
    const startTime = Date.now();
    this.queryMetrics.totalQueries++;
    
    try {
      const result = await this.db.execute({ sql, args });
      const duration = Date.now() - startTime;
      
      // 更新平均響應時間
      this.queryMetrics.averageResponseTime = 
        (this.queryMetrics.averageResponseTime * (this.queryMetrics.totalQueries - 1) + duration) / 
        this.queryMetrics.totalQueries;
      
      // 記錄慢查詢
      if (duration > PERFORMANCE_CONFIG.SLOW_QUERY_THRESHOLD) {
        this.queryMetrics.slowQueries++;
        this.queryMetrics.lastSlowQuery = {
          sql,
          duration,
          timestamp: new Date().toISOString(),
          description
        };
        
        logger.warn({ 
          sql: sql.substring(0, 100) + '...', 
          duration, 
          description 
        }, 'Slow query detected');
      }
      
      logger.debug({ duration, description }, 'Query executed');
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, sql, duration, description }, 'Query execution failed');
      throw error;
    }
  }

  /**
   * 創建新的 idea 記錄
   */
  async createIdea(userInput, generatedSpec = '', status = JOB_STATUSES.PROCESSING) {
    const stmt = this.preparedStatements.get('create_idea');
    const result = await this.executeWithMetrics(
      stmt.sql, 
      [userInput, generatedSpec, status],
      stmt.description
    );
    
    return result.lastInsertRowid;
  }

  /**
   * 更新 idea 記錄
   */
  async updateIdea(id, updates) {
    const { generatedSpec, status, processingTime } = updates;
    const stmt = this.preparedStatements.get('update_idea');
    
    await this.executeWithMetrics(
      stmt.sql,
      [generatedSpec, status, processingTime, id],
      stmt.description
    );
  }

  /**
   * 取得分頁歷史記錄（優化版本）
   */
  async getHistory(page = 1, limit = 20, search = null) {
    // 使用緩存檢查是否有相同的查詢
    const cacheKey = `history_${page}_${limit}_${search || 'all'}`;
    const cachedResult = queryStatsCache.get(cacheKey);
    
    if (cachedResult && Date.now() - cachedResult.timestamp < STATS_CACHE_TTL) {
      logger.debug('Returning cached history result');
      return cachedResult.data;
    }
    
    // 限制分頁大小以提升性能
    const effectiveLimit = Math.min(limit, PERFORMANCE_CONFIG.CURSOR_PAGINATION_LIMIT);
    
    // 使用預備語句和優化查詢
    let countStmt, countParams;
    if (search) {
      countStmt = this.preparedStatements.get('get_history_count_search');
      const searchParam = `%${search}%`;
      countParams = [searchParam, searchParam];
    } else {
      countStmt = this.preparedStatements.get('get_history_count');
      countParams = [];
    }
    
    const countResult = await this.executeWithMetrics(
      countStmt.sql,
      countParams,
      'Get history count'
    );
    
    const total = countResult.rows[0]?.total || 0;
    
    if (total === 0) {
      const emptyResult = {
        data: [],
        pagination: {
          page,
          limit: effectiveLimit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      };
      
      // 緩存空結果
      queryStatsCache.set(cacheKey, {
        data: emptyResult,
        timestamp: Date.now()
      });
      
      return emptyResult;
    }

    // 優化分頁查詢 - 使用索引友好的查詢
    const offset = (page - 1) * effectiveLimit;
    let dataQuery, dataParams;
    
    if (search) {
      // 使用優化的搜索查詢，利用複合索引
      dataQuery = `
        SELECT id, user_input, generated_spec, status, processing_time_ms, created_at, updated_at 
        FROM ideas 
        WHERE user_input LIKE ? OR generated_spec LIKE ?
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;
      const searchParam = `%${search}%`;
      dataParams = [searchParam, searchParam, effectiveLimit, offset];
    } else {
      // 無搜索的快速查詢，利用創建時間索引
      dataQuery = `
        SELECT id, user_input, generated_spec, status, processing_time_ms, created_at, updated_at 
        FROM ideas 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;
      dataParams = [effectiveLimit, offset];
    }
    
    const dataResult = await this.executeWithMetrics(
      dataQuery,
      dataParams,
      'Get history data'
    );

    const totalPages = Math.ceil(total / effectiveLimit);
    
    const result = {
      data: dataResult.rows.map(row => ({
        ...row,
        preview: row.generated_spec ? row.generated_spec.substring(0, 200) : ''
      })),
      pagination: {
        page,
        limit: effectiveLimit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
    
    // 緩存結果（僅第一頁且無搜索時緩存，避免快速變化的數據緩存問題）
    if (page === 1 && !search) {
      queryStatsCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
    }
    
    return result;
  }

  /**
   * 根據 ID 取得特定規格
   */
  async getSpecById(id) {
    const stmt = this.preparedStatements.get('get_idea_by_id');
    const result = await this.executeWithMetrics(
      stmt.sql,
      [id],
      stmt.description
    );
    
    return result.rows[0] || null;
  }

  /**
   * 刪除特定記錄
   */
  async deleteSpec(id) {
    // 先檢查記錄是否存在
    const existing = await this.getSpecById(id);
    if (!existing) {
      throw new Error('Entry not found');
    }
    
    const stmt = this.preparedStatements.get('delete_idea');
    await this.executeWithMetrics(
      stmt.sql,
      [id],
      stmt.description
    );
    
    return true;
  }

  /**
   * 記錄性能指標（批量優化版本）
   */
  async logPerformanceMetric(endpoint, method, duration, statusCode, error = null) {
    try {
      await this.executeWithMetrics(
        `INSERT INTO performance_metrics (
          endpoint, method, duration_ms, status_code, error_message
        ) VALUES (?, ?, ?, ?, ?)`,
        [endpoint, method, duration, statusCode, error ? JSON.stringify(error) : null],
        'Log performance metric'
      );
    } catch (err) {
      logger.debug({ error: err }, 'Failed to log performance metric');
    }
  }

  /**
   * 批量插入性能指標
   */
  async logBatchPerformanceMetrics(metrics) {
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return;
    }

    const batchSize = PERFORMANCE_CONFIG.BATCH_SIZE;
    const batches = [];
    
    for (let i = 0; i < metrics.length; i += batchSize) {
      batches.push(metrics.slice(i, i + batchSize));
    }

    try {
      for (const batch of batches) {
        const values = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const args = batch.flatMap(metric => [
          metric.endpoint,
          metric.method,
          metric.duration,
          metric.statusCode,
          metric.error ? JSON.stringify(metric.error) : null
        ]);

        await this.executeWithMetrics(
          `INSERT INTO performance_metrics (endpoint, method, duration_ms, status_code, error_message) VALUES ${values}`,
          args,
          `Batch insert ${batch.length} performance metrics`
        );
      }
      
      logger.debug(`Batch inserted ${metrics.length} performance metrics`);
    } catch (error) {
      logger.error({ error }, 'Failed to batch insert performance metrics');
    }
  }

  /**
   * 取得性能統計（優化緩存版本）
   */
  async getPerformanceStats(hours = 24) {
    const cacheKey = `performance_stats_${hours}h`;
    const cachedResult = queryStatsCache.get(cacheKey);
    
    // 性能統計緩存時間較短（1分鐘）
    const perfCacheTTL = 60000;
    if (cachedResult && Date.now() - cachedResult.timestamp < perfCacheTTL) {
      logger.debug('Returning cached performance stats');
      return cachedResult.data;
    }
    
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    // 使用優化的統計查詢，利用復合索引
    const result = await this.executeWithMetrics(`
      SELECT 
        endpoint,
        method,
        COUNT(*) as request_count,
        ROUND(AVG(duration_ms), 2) as avg_duration,
        MIN(duration_ms) as min_duration,
        MAX(duration_ms) as max_duration,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
        COUNT(CASE WHEN duration_ms > ? THEN 1 END) as slow_request_count,
        ROUND(AVG(CASE WHEN status_code < 400 THEN duration_ms END), 2) as avg_success_duration
      FROM performance_metrics 
      WHERE created_at > ?
      GROUP BY endpoint, method
      ORDER BY request_count DESC
      LIMIT 50
    `, [PERFORMANCE_CONFIG.SLOW_QUERY_THRESHOLD, cutoffTime], 'Get performance statistics');
    
    const statsData = result.rows.map(row => ({
      ...row,
      error_rate: row.request_count > 0 ? (row.error_count / row.request_count * 100).toFixed(2) : '0.00',
      slow_request_rate: row.request_count > 0 ? (row.slow_request_count / row.request_count * 100).toFixed(2) : '0.00'
    }));
    
    // 緩存結果
    queryStatsCache.set(cacheKey, {
      data: statsData,
      timestamp: Date.now()
    });
    
    return statsData;
  }

  /**
   * 資料庫維護
   */
  async performMaintenance() {
    try {
      // 執行 VACUUM 優化資料庫
      await this.db.execute('VACUUM');
      
      // 清理舊的性能指標（保留 7 天）
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await this.db.execute({
        sql: 'DELETE FROM performance_metrics WHERE created_at < ?',
        args: [sevenDaysAgo]
      });
      
      logger.info('Database maintenance completed');
    } catch (error) {
      logger.error({ error }, 'Database maintenance failed');
      throw error;
    }
  }

  /**
   * 健康檢查
   */
  async healthCheck() {
    try {
      await this.db.execute('SELECT 1');
      return { status: 'healthy', message: 'Database connection is working' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  /**
   * 取得資料庫統計資訊（優化版本）
   */
  async getStats() {
    const cacheKey = 'database_stats';
    const cachedResult = queryStatsCache.get(cacheKey);
    
    // 統計信息緩存5分鐘
    if (cachedResult && Date.now() - cachedResult.timestamp < STATS_CACHE_TTL) {
      logger.debug('Returning cached database stats');
      return cachedResult.data;
    }
    
    try {
      // 並行執行多個統計查詢
      const [ideasCount, metricsCount, recentIdeas, statusDistribution] = await Promise.all([
        this.executeWithMetrics('SELECT COUNT(*) as count FROM ideas', [], 'Count all ideas'),
        this.executeWithMetrics('SELECT COUNT(*) as count FROM performance_metrics', [], 'Count all metrics'),
        this.executeWithMetrics(
          "SELECT COUNT(*) as count FROM ideas WHERE created_at > datetime('now', '-24 hours')", 
          [], 
          'Count recent ideas'
        ),
        this.executeWithMetrics(
          'SELECT status, COUNT(*) as count FROM ideas GROUP BY status', 
          [], 
          'Get status distribution'
        )
      ]);
      
      const stats = {
        totalIdeas: ideasCount.rows[0]?.count || 0,
        totalMetrics: metricsCount.rows[0]?.count || 0,
        recentIdeas: recentIdeas.rows[0]?.count || 0,
        statusDistribution: statusDistribution.rows.reduce((acc, row) => {
          acc[row.status] = row.count;
          return acc;
        }, {}),
        queryMetrics: this.queryMetrics,
        cacheStats: {
          cacheSize: queryStatsCache.size,
          cacheHitRate: this.calculateCacheHitRate()
        }
      };
      
      // 緩存結果
      queryStatsCache.set(cacheKey, {
        data: stats,
        timestamp: Date.now()
      });
      
      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get database stats');
      return { 
        totalIdeas: 0, 
        totalMetrics: 0, 
        recentIdeas: 0,
        statusDistribution: {},
        queryMetrics: this.queryMetrics,
        error: error.message
      };
    }
  }

  /**
   * 計算緩存命中率
   */
  calculateCacheHitRate() {
    // 簡單的緩存命中率計算
    const totalRequests = this.queryMetrics.totalQueries;
    const estimatedCacheHits = Math.max(0, totalRequests - queryStatsCache.size);
    return totalRequests > 0 ? ((estimatedCacheHits / totalRequests) * 100).toFixed(2) : '0.00';
  }

  /**
   * 批量刪除操作
   */
  async batchDeleteSpecs(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { deletedCount: 0, errors: [] };
    }

    const batchSize = Math.min(PERFORMANCE_CONFIG.BATCH_SIZE, 50); // 限制批次大小
    const batches = [];
    
    for (let i = 0; i < ids.length; i += batchSize) {
      batches.push(ids.slice(i, i + batchSize));
    }

    let deletedCount = 0;
    const errors = [];

    try {
      for (const batch of batches) {
        const placeholders = batch.map(() => '?').join(',');
        const result = await this.executeWithMetrics(
          `DELETE FROM ideas WHERE id IN (${placeholders})`,
          batch,
          `Batch delete ${batch.length} ideas`
        );
        
        deletedCount += result.changes || 0;
      }
      
      logger.info(`Batch deleted ${deletedCount} ideas from ${ids.length} requested`);
    } catch (error) {
      logger.error({ error }, 'Batch delete operation failed');
      errors.push({ operation: 'batch_delete', error: error.message });
    }

    return { deletedCount, errors };
  }

  /**
   * 清理過期數據
   */
  async cleanupExpiredData(daysToKeep = 30) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    
    try {
      // 清理過期的性能指標（保留指定天數）
      const metricsResult = await this.executeWithMetrics(
        'DELETE FROM performance_metrics WHERE created_at < ?',
        [cutoffDate],
        'Cleanup expired performance metrics'
      );
      
      logger.info(`Cleaned up ${metricsResult.changes || 0} expired performance metrics`);
      
      return {
        metricsDeleted: metricsResult.changes || 0,
        cutoffDate
      };
    } catch (error) {
      logger.error({ error }, 'Data cleanup failed');
      throw error;
    }
  }

  /**
   * 獲取數據庫大小和索引信息
   */
  async getDatabaseInfo() {
    try {
      const [tableInfo, indexInfo] = await Promise.all([
        this.executeWithMetrics(
          `SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name`,
          [],
          'Get table information'
        ),
        this.executeWithMetrics(
          `SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name`,
          [],
          'Get index information'
        )
      ]);

      return {
        tables: tableInfo.rows,
        indexes: indexInfo.rows,
        totalObjects: tableInfo.rows.length + indexInfo.rows.length
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get database info');
      return { tables: [], indexes: [], totalObjects: 0, error: error.message };
    }
  }

  /**
   * 關閉資料庫連接
   */
  async close() {
    // libsql client 不需要明確關閉
    this.isInitialized = false;
    logger.info('Database connection closed');
  }
}

// 創建單例實例
const databaseService = new DatabaseService();

export default databaseService;