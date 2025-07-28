/**
 * 歷史記錄控制器
 * 處理歷史記錄相關的 API 邏輯
 */

import databaseService from '../services/databaseService.js';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../config/serverConfig.js';
import { validateNumericParam, validateSearchInput, validateId } from '../utils/validators.js';
import { createError } from '../utils/errorHandler.js';
import { catchAsync } from '../middleware/errorMiddleware.js';
import pino from 'pino';

const logger = pino();

class HistoryController {
  /**
   * 取得分頁歷史記錄
   */
  getHistory = catchAsync(async (req, res) => {
    logger.debug('History API - validatedData:', req.validatedData);
    const { page = 1, limit = 20, search = '' } = req.validatedData || req.query;
    
    // 使用安全的參數驗證
    let pageNum, limitNum;
    try {
      pageNum = validateNumericParam(page, { min: 1, max: 1000, defaultValue: 1 });
      limitNum = validateNumericParam(limit, { min: 1, max: 100, defaultValue: 20 });
    } catch (validationError) {
      throw createError.invalidParameter('page or limit', validationError.message);
    }
    
    // 安全驗證搜尋參數
    let sanitizedSearch = null;
    try {
      sanitizedSearch = search ? validateSearchInput(search) : null;
    } catch (validationError) {
      throw createError.invalidInput('search', search);
    }
    
    logger.debug('History API - parsed params:', { 
      page: pageNum, 
      limit: limitNum, 
      search: sanitizedSearch
    });
    
    // 從資料庫服務取得歷史記錄
    const result = await databaseService.getHistory(pageNum, limitNum, sanitizedSearch);
    
    res.json({
      data: result.data,
      pagination: result.pagination,
      search: sanitizedSearch || null,
      requestId: req.requestId
    });
  });

  /**
   * 刪除特定歷史記錄
   */
  deleteHistory = catchAsync(async (req, res) => {
    const { id } = req.params;
    let validId;
    
    try {
      validId = validateId(id);
    } catch (validationError) {
      throw createError.invalidParameter('id', id);
    }
    
    try {
      // 使用資料庫服務刪除記錄
      await databaseService.deleteSpec(validId);
    } catch (error) {
      if (error.message === 'Entry not found') {
        throw createError.notFound('History entry', validId);
      }
      throw error;
    }
    
    logger.info(`Deleted specification entry ${validId}`);
    res.json({ 
      message: SUCCESS_MESSAGES.ENTRY_DELETED,
      id: parseInt(id),
      requestId: req.requestId
    });
  });

  /**
   * 取得歷史記錄統計
   */
  getHistoryStats = catchAsync(async (req, res) => {
    const stats = await databaseService.getStats();
    const performanceStats = await databaseService.getPerformanceStats(24); // 最近 24 小時
    
    // 計算狀態分佈
    const statusDistribution = await this.getStatusDistribution();
    
    // 計算每日生成統計
    const dailyStats = await this.getDailyGenerationStats(7); // 最近 7 天
    
    res.json({
      total: stats.totalIdeas,
      statusDistribution,
      dailyStats,
      performanceStats,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * 取得狀態分佈統計（優化版本）
   */
  async getStatusDistribution() {
    try {
      const result = await databaseService.executeWithMetrics(`
        SELECT status, COUNT(*) as count
        FROM ideas
        GROUP BY status
        ORDER BY count DESC
      `, [], 'Get status distribution');
      
      return result.rows.map(row => ({
        status: row.status,
        count: row.count
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting status distribution');
      return [];
    }
  }

  /**
   * 取得每日生成統計（優化版本）
   */
  async getDailyGenerationStats(days = 7) {
    try {
      const result = await databaseService.executeWithMetrics(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          ROUND(AVG(processing_time_ms), 2) as avg_processing_time,
          MIN(processing_time_ms) as min_processing_time,
          MAX(processing_time_ms) as max_processing_time
        FROM ideas
        WHERE created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT ?
      `, [days, days], 'Get daily generation stats');
      
      return result.rows.map(row => ({
        date: row.date,
        total: row.total,
        completed: row.completed,
        failed: row.failed,
        successRate: row.total > 0 ? ((row.completed / row.total) * 100).toFixed(2) : '0.00',
        avgProcessingTime: Math.round(row.avg_processing_time || 0),
        minProcessingTime: row.min_processing_time || 0,
        maxProcessingTime: row.max_processing_time || 0
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting daily generation stats');
      return [];
    }
  }

  /**
   * 批量刪除歷史記錄（管理員功能）- 優化版本
   */
  bulkDeleteHistory = catchAsync(async (req, res) => {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      throw createError.validation('IDs array is required and cannot be empty', 'ids');
    }
    
    if (ids.length > 100) {
      throw createError.validation('Cannot delete more than 100 entries at once', 'ids');
    }
    
    let validIds;
    try {
      validIds = ids.map(id => validateId(id));
    } catch (validationError) {
      throw createError.invalidInput('ids', 'One or more IDs are invalid');
    }
    
    // 使用優化的批量刪除
    const result = await databaseService.batchDeleteSpecs(validIds);
    
    logger.info(`Bulk deleted ${result.deletedCount} entries from ${ids.length} requested, errors: ${result.errors.length}`);
    
    res.json({
      message: `Successfully deleted ${result.deletedCount} entries`,
      deletedCount: result.deletedCount,
      totalRequested: ids.length,
      errors: result.errors.length > 0 ? result.errors : undefined,
      requestId: req.requestId
    });
  });

  /**
   * 搜尋歷史記錄（進階搜尋）
   */
  searchHistory = catchAsync(async (req, res) => {
    const { 
      query, 
      status, 
      dateFrom, 
      dateTo, 
      page = 1, 
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    // 驗證參數
    let pageNum, limitNum, sanitizedQuery;
    try {
      pageNum = validateNumericParam(page, { min: 1, max: 1000, defaultValue: 1 });
      limitNum = validateNumericParam(limit, { min: 1, max: 100, defaultValue: 20 });
      sanitizedQuery = query ? validateSearchInput(query) : null;
    } catch (validationError) {
      throw createError.invalidInput('search parameters', validationError.message);
    }
    
    // 驗證排序參數
    const allowedSortFields = ['created_at', 'updated_at', 'processing_time_ms'];
    const allowedSortOrders = ['ASC', 'DESC'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = allowedSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    // 建構搜尋條件
    let whereConditions = [];
    let queryParams = [];
    
    if (sanitizedQuery) {
      whereConditions.push('(user_input LIKE ? OR generated_spec LIKE ?)');
      const searchParam = `%${sanitizedQuery}%`;
      queryParams.push(searchParam, searchParam);
    }
    
    if (status) {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }
    
    if (dateFrom) {
      whereConditions.push('created_at >= ?');
      queryParams.push(dateFrom);
    }
    
    if (dateTo) {
      whereConditions.push('created_at <= ?');
      queryParams.push(dateTo);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 取得總數 - 使用優化的查詢執行
    const countResult = await databaseService.executeWithMetrics(
      `SELECT COUNT(*) as total FROM ideas ${whereClause}`,
      queryParams,
      'Advanced search count'
    );
    
    const total = countResult.rows[0]?.total || 0;
    
    if (total === 0) {
      return res.json({
        data: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        },
        searchCriteria: { query: sanitizedQuery, status, dateFrom, dateTo },
        requestId: req.requestId
      });
    }
    
    // 取得資料 - 使用優化的查詢執行
    const offset = (pageNum - 1) * limitNum;
    const dataResult = await databaseService.executeWithMetrics(`
      SELECT id, user_input, generated_spec, status, processing_time_ms, created_at, updated_at
      FROM ideas 
      ${whereClause}
      ORDER BY ${validSortBy} ${validSortOrder}
      LIMIT ? OFFSET ?
    `, [...queryParams, limitNum, offset], 'Advanced search data');
    
    const totalPages = Math.ceil(total / limitNum);
    
    res.json({
      data: dataResult.rows.map(row => ({
        ...row,
        preview: row.generated_spec ? row.generated_spec.substring(0, 200) : ''
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      },
      searchCriteria: { 
        query: sanitizedQuery, 
        status, 
        dateFrom, 
        dateTo,
        sortBy: validSortBy,
        sortOrder: validSortOrder
      },
      requestId: req.requestId
    });
  });

  /**
   * 取得數據庫性能統計（管理員功能）
   */
  getDatabasePerformance = catchAsync(async (req, res) => {
    const { hours = 24, includeDetails = false } = req.query;
    
    // 驗證參數
    const validHours = validateNumericParam(hours, { min: 1, max: 168, defaultValue: 24 }); // 最多7天
    
    // 獲取性能統計
    const performanceStats = await databaseService.getPerformanceStats(validHours);
    const databaseStats = await databaseService.getStats();
    const databaseInfo = includeDetails === 'true' ? await databaseService.getDatabaseInfo() : null;
    
    // 計算性能摘要
    const performanceSummary = {
      totalRequests: performanceStats.reduce((sum, stat) => sum + stat.request_count, 0),
      totalErrors: performanceStats.reduce((sum, stat) => sum + stat.error_count, 0),
      avgResponseTime: performanceStats.length > 0 ? 
        (performanceStats.reduce((sum, stat) => sum + (stat.avg_duration * stat.request_count), 0) / 
         performanceStats.reduce((sum, stat) => sum + stat.request_count, 0)).toFixed(2) : '0.00',
      slowQueries: databaseStats.queryMetrics?.slowQueries || 0,
      cacheHitRate: databaseStats.cacheStats?.cacheHitRate || '0.00'
    };
    
    res.json({
      timeRange: `${validHours} hours`,
      summary: performanceSummary,
      endpointStats: performanceStats,
      databaseMetrics: databaseStats.queryMetrics,
      cacheStats: databaseStats.cacheStats,
      databaseInfo: databaseInfo,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  });
}

export default new HistoryController();