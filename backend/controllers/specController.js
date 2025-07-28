/**
 * 規格生成控制器
 * 處理規格生成相關的 API 邏輯
 */

import databaseService from '../services/databaseService.js';
import geminiService from '../services/geminiService.js';
import webSocketService from '../services/websocketService.js';
import { JOB_STATUSES, ERROR_MESSAGES, SUCCESS_MESSAGES, isDevelopment } from '../config/serverConfig.js';
import { validateId, validateFilename } from '../utils/validators.js';
import { createError } from '../utils/errorHandler.js';
import { catchAsync } from '../middleware/errorMiddleware.js';
import pino from 'pino';

const logger = pino();

class SpecController {
  /**
   * 取得 Gemini 錯誤訊息
   */
  getGeminiErrorMessage(error) {
    if (error.message.includes('timeout')) {
      return 'Gemini CLI 請求超時。這可能是因為：1) API 金鑰未配置 2) 網路連接問題 3) 請求過於複雜。請檢查 Gemini API 配置。';
    } else if (error.message.includes('Failed to start')) {
      return 'Gemini CLI 未安裝或不在系統 PATH 中。請確認已正確安裝 @google/gemini-cli。';
    } else if (error.message.includes('failed with code')) {
      return 'Gemini CLI 執行失敗。請檢查：1) API 金鑰是否配置 2) 網路連接 3) API 配額限制。';
    } else if (error.message.includes('null')) {
      return 'Gemini CLI 可能因 API 配置問題而終止。請確認已設置有效的 Google AI API 金鑰。';
    }
    return `Gemini CLI 錯誤: ${error.message}。請檢查 API 配置和網路連接。`;
  }

  /**
   * 生成規格文檔
   */
  generateSpec = catchAsync(async (req, res) => {
    const startTime = Date.now();
    let recordId = null;
    
    const { idea } = req.validatedData || req.body;
    
    logger.info(`Starting spec generation for idea: ${idea ? idea.substring(0, 100) + '...' : 'undefined'}`);
    
    if (!idea) {
      throw createError.missingField('idea');
    }
    
    if (typeof idea !== 'string' || idea.trim().length === 0) {
      throw createError.invalidInput('idea', 'Idea must be a non-empty string');
    }
    
    try {
      // 創建初始數據庫記錄
      recordId = await databaseService.createIdea(idea, '', JOB_STATUSES.PROCESSING);
      const jobId = `job-${recordId}-${Date.now()}`;
      
      logger.info(`Created database record ${recordId} for job ${jobId}`);
      
      // 發送 WebSocket 開始通知
      webSocketService.emitJobUpdate(jobId, JOB_STATUSES.PROCESSING, { 
        message: 'Starting specification generation...' 
      });
      
      // 使用 Gemini 服務生成規格
      const result = await geminiService.generateSpecification(idea, {
        timeout: 180000,
        maxRetries: 2,
        retryDelay: 2000,
        jobId: jobId,
        emitJobUpdate: webSocketService.emitJobUpdate.bind(webSocketService)
      });
      
      const totalDuration = Date.now() - startTime;
      
      if (result.success) {
        // 更新數據庫記錄
        await databaseService.updateIdea(recordId, {
          generatedSpec: result.specification,
          status: JOB_STATUSES.COMPLETED,
          processingTime: totalDuration
        });
        
        logger.info(`Spec generation completed in ${totalDuration}ms`);
        
        // 發送成功完成通知
        webSocketService.emitJobUpdate(jobId, JOB_STATUSES.COMPLETED, { 
          message: '🎉 規格文檔生成完成！',
          totalDuration: Number(totalDuration),
          outputLength: Number(result.specification.length)
        });
        
        res.json({
          id: Number(recordId),
          userInput: idea,
          generatedSpec: result.specification,
          status: JOB_STATUSES.COMPLETED,
          processingTime: Number(totalDuration),
          outputLength: Number(result.specification.length),
          createdAt: new Date().toISOString(),
          metadata: result.metadata,
          requestId: req.requestId
        });
        
      } else {
        // 更新數據庫記錄為失敗狀態
        await databaseService.updateIdea(recordId, {
          generatedSpec: '',
          status: JOB_STATUSES.FAILED,
          processingTime: totalDuration
        });
        
        // 發送失敗通知
        webSocketService.emitJobUpdate(jobId, JOB_STATUSES.FAILED, { 
          message: result.error,
          error: result.error 
        });
        
        const geminiError = createError.geminiCliError('generation', new Error(result.error));
        geminiError.setRequestId(req.requestId);
        geminiError.addMetadata('jobId', jobId);
        geminiError.addMetadata('processingTime', totalDuration);
        geminiError.addMetadata('suggestions', [
          '檢查 Gemini CLI 是否正確安裝和配置',
          '確認網路連接正常',
          '稍後再試或聯繫系統管理員'
        ]);
        throw geminiError;
      }
      
    } catch (error) {
      logger.error({ error, recordId }, 'Error in spec generation');
      
      // 發送 WebSocket 失敗通知
      const jobId = recordId ? `job-${recordId}-${Date.now()}` : 'unknown';
      webSocketService.emitJobUpdate(jobId, JOB_STATUSES.FAILED, { 
        message: this.getGeminiErrorMessage(error),
        error: error.message 
      });
      
      // 更新數據庫記錄
      if (recordId) {
        try {
          await databaseService.updateIdea(recordId, {
            generatedSpec: '',
            status: JOB_STATUSES.FAILED,
            processingTime: Date.now() - startTime
          });
        } catch (dbError) {
          logger.error({ error: dbError }, 'Error updating failed record');
        }
      }
      
      throw error;
    }
  });

  /**
   * 取得特定規格
   */
  getSpec = catchAsync(async (req, res) => {
    const { id } = req.params;
    let validId;
    
    try {
      validId = validateId(id);
    } catch (validationError) {
      throw createError.invalidParameter('id', id);
    }
    
    const spec = await databaseService.getSpecById(validId);
    
    if (!spec) {
      throw createError.notFound('Specification', validId);
    }
    
    res.json({
      id: spec.id,
      userInput: spec.user_input,
      generatedSpec: spec.generated_spec,
      status: spec.status,
      processingTime: spec.processing_time_ms,
      createdAt: spec.created_at,
      updatedAt: spec.updated_at,
      requestId: req.requestId
    });
  });

  /**
   * 下載規格為 Markdown 文件
   */
  downloadSpec = catchAsync(async (req, res) => {
    const { id } = req.params;
    let validId;
    
    try {
      validId = validateId(id);
    } catch (validationError) {
      throw createError.invalidParameter('id', id);
    }
    
    const spec = await databaseService.getSpecById(validId);
    
    if (!spec) {
      throw createError.notFound('Specification', validId);
    }
    
    // 確保規格有適當的格式
    let formattedContent = spec.generated_spec;
    if (!formattedContent.includes('# Product Development Specification')) {
      try {
        const { formatSpecification } = await import('../utils/geminiSafe.js');
        formattedContent = formatSpecification(formattedContent, spec.user_input);
      } catch (formatError) {
        logger.warn({ error: formatError }, 'Failed to format specification, using original content');
        // 使用原始內容
      }
    }
    
    // 生成描述性文件名
    const ideaPreview = spec.user_input
      .substring(0, 50)
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `spec-${ideaPreview}-${timestamp}-${id}.md`;
    
    // 驗證文件名安全性
    let safeFilename;
    try {
      safeFilename = validateFilename(filename);
    } catch (validationError) {
      safeFilename = `spec-${timestamp}-${id}.md`;
    }
    
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(formattedContent, 'utf8'));
    res.send(formattedContent);
    
    logger.info(`Downloaded specification ${id} as ${safeFilename}`);
  });

  /**
   * 取得規格生成統計
   */
  getStats = catchAsync(async (req, res) => {
    const dbStats = await databaseService.getStats();
    const geminiStats = geminiService.getStats();
    const wsStats = webSocketService.getConnectionStats();
    
    res.json({
      database: dbStats,
      gemini: geminiStats,
      websocket: wsStats,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * 測試端點（僅開發環境）
   */
  testEndpoint = catchAsync(async (req, res) => {
    if (!isDevelopment()) {
      throw createError.notFound('Endpoint', req.path);
    }
    
    const result = await databaseService.db.execute('SELECT * FROM ideas LIMIT 2');
    
    const data = result.rows.map(row => {
      const item = {};
      result.columns.forEach((col, index) => {
        item[col] = row[index];
      });
      return item;
    });
    
    res.json({ 
      columns: result.columns, 
      rawRows: result.rows, 
      mappedData: data,
      requestId: req.requestId
    });
  });
}

export default new SpecController();