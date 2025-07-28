/**
 * Gemini 服務模組
 * 整合並封裝 Gemini CLI 相關功能
 */

import { generateWithGeminiSafe, checkGeminiAvailability, testGeminiBasicFunction, formatSpecification } from '../utils/geminiSafe.js';
import { JOB_STATUSES, ERROR_MESSAGES } from '../config/serverConfig.js';
import pino from 'pino';

const logger = pino();

class GeminiService {
  constructor() {
    this.isAvailable = false;
    this.isConfigured = false;
    this.lastHealthCheck = null;
    this.healthCheckCache = null;
    this.healthCheckCacheExpiry = 0;
  }

  /**
   * 初始化 Gemini 服務
   */
  async initialize() {
    try {
      this.isAvailable = await checkGeminiAvailability();
      if (this.isAvailable) {
        this.isConfigured = await testGeminiBasicFunction();
      }
      
      logger.info({
        available: this.isAvailable,
        configured: this.isConfigured
      }, 'Gemini service initialized');
      
      return { available: this.isAvailable, configured: this.isConfigured };
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Gemini service');
      this.isAvailable = false;
      this.isConfigured = false;
      return { available: false, configured: false };
    }
  }

  /**
   * 生成規格文檔
   */
  async generateSpecification(userInput, options = {}) {
    const startTime = Date.now();
    
    try {
      // 檢查服務可用性
      if (!this.isAvailable) {
        throw new Error('Gemini CLI is not available');
      }

      // 設置預設選項
      const generationOptions = {
        timeout: 180000, // 3 分鐘
        maxRetries: 2,
        retryDelay: 2000,
        ...options
      };

      logger.info({ userInput: userInput.substring(0, 100) + '...', options: generationOptions }, 'Starting specification generation');

      // 調用 Gemini CLI
      const rawOutput = await generateWithGeminiSafe(userInput, generationOptions);
      
      if (!rawOutput || rawOutput.trim().length === 0) {
        throw new Error('Gemini CLI returned empty output');
      }

      // 格式化輸出
      let formattedSpec;
      try {
        formattedSpec = formatSpecification(rawOutput, userInput);
      } catch (formatError) {
        logger.warn({ error: formatError }, 'Formatting failed, using error recovery');
        
        // 錯誤恢復：使用基本格式
        formattedSpec = this.createFallbackSpecification(rawOutput, userInput);
      }

      const totalDuration = Date.now() - startTime;
      
      logger.info({ 
        duration: totalDuration, 
        outputLength: formattedSpec.length 
      }, 'Specification generation completed');

      return {
        success: true,
        specification: formattedSpec,
        duration: totalDuration,
        outputLength: formattedSpec.length,
        metadata: {
          generatedAt: new Date().toISOString(),
          userInput,
          processingTime: totalDuration
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = this.getGeminiErrorMessage(error);
      
      logger.error({
        error: error.message,
        duration,
        userInput: userInput.substring(0, 100) + '...'
      }, 'Specification generation failed');

      return {
        success: false,
        error: errorMessage,
        duration,
        metadata: {
          failedAt: new Date().toISOString(),
          userInput,
          processingTime: duration
        }
      };
    }
  }

  /**
   * 創建備用規格格式（當主要格式化失敗時使用）
   */
  createFallbackSpecification(rawOutput, originalIdea) {
    return `# ${originalIdea} - 產品規格文件

**Generated:** ${new Date().toISOString()}
**Status:** 使用備用格式（原始輸出處理）

---

${rawOutput || '生成內容處理時發生問題，請重新嘗試。'}

---

*Generated using Gemini CLI with error recovery*`;
  }

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
   * 健康檢查（帶緩存）
   */
  async healthCheck(useCache = true) {
    const now = Date.now();
    
    // 如果緩存有效且要求使用緩存，返回緩存結果
    if (useCache && this.healthCheckCache && now < this.healthCheckCacheExpiry) {
      return this.healthCheckCache;
    }

    try {
      const startTime = Date.now();
      
      // 檢查 CLI 可用性
      const available = await checkGeminiAvailability();
      let configured = false;
      let version = null;
      
      if (available) {
        try {
          // 測試配置
          configured = await testGeminiBasicFunction();
          
          // 嘗試取得版本資訊
          version = await this.getVersion();
        } catch (error) {
          logger.warn({ error }, 'Failed to test Gemini configuration');
        }
      }
      
      const latency = Date.now() - startTime;
      
      const healthStatus = {
        service: 'Gemini CLI',
        status: available ? (configured ? 'ready' : 'installed_but_not_configured') : 'unavailable',
        available,
        configured,
        version,
        latency: `${latency}ms`,
        timestamp: new Date().toISOString(),
        lastCheck: new Date().toISOString()
      };
      
      // 更新服務狀態
      this.isAvailable = available;
      this.isConfigured = configured;
      this.lastHealthCheck = healthStatus;
      
      // 緩存結果（30 秒）
      this.healthCheckCache = healthStatus;
      this.healthCheckCacheExpiry = now + 30000;
      
      return healthStatus;
      
    } catch (error) {
      const errorStatus = {
        service: 'Gemini CLI',
        status: 'error',
        available: false,
        configured: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      this.isAvailable = false;
      this.isConfigured = false;
      this.lastHealthCheck = errorStatus;
      
      // 短時間緩存錯誤結果（10 秒）
      this.healthCheckCache = errorStatus;
      this.healthCheckCacheExpiry = now + 10000;
      
      return errorStatus;
    }
  }

  /**
   * 取得 Gemini CLI 版本
   */
  async getVersion() {
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve, reject) => {
        const versionProcess = spawn('gemini', ['--version'], {
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let output = '';
        
        versionProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        versionProcess.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error(`Version check failed with code ${code}`));
          }
        });
        
        versionProcess.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      logger.debug({ error }, 'Failed to get Gemini version');
      return null;
    }
  }

  /**
   * 取得認證狀態
   */
  async getAuthStatus() {
    try {
      // 對於 Gemini CLI v0.1.1，我們通過簡單測試調用來檢查認證狀態
      const testResult = await this.testAuthentication();
      
      return {
        service: 'Gemini CLI v0.1.1',
        authenticated: testResult.authenticated,
        output: testResult.output,
        error: testResult.error,
        timestamp: new Date().toISOString(),
        note: 'This version does not support auth status command, tested with simple call'
      };
    } catch (error) {
      return {
        service: 'Gemini CLI v0.1.1',
        authenticated: false,
        error: 'Failed to test CLI availability',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 測試認證狀態
   */
  async testAuthentication() {
    const { spawn } = await import('child_process');
    const os = await import('os');
    
    return new Promise((resolve) => {
      const testProcess = spawn('gemini', ['-p'], {
        env: { ...process.env, HOME: os.homedir() },
        cwd: os.homedir(),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let error = '';
      
      // 發送簡單測試 prompt
      testProcess.stdin.write('hi');
      testProcess.stdin.end();
      
      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      testProcess.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      const timeoutId = setTimeout(() => {
        testProcess.kill('SIGTERM');
        resolve({ authenticated: false, error: 'Test timeout' });
      }, 10000);
      
      testProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code === 0 && output.length > 0) {
          resolve({ authenticated: true, output: 'Gemini CLI responding normally' });
        } else {
          resolve({ authenticated: false, error: error || `Process exited with code ${code}` });
        }
      });
      
      testProcess.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({ authenticated: false, error: err.message });
      });
    });
  }

  /**
   * 取得服務統計
   */
  getStats() {
    return {
      available: this.isAvailable,
      configured: this.isConfigured,
      lastHealthCheck: this.lastHealthCheck,
      cacheExpiry: new Date(this.healthCheckCacheExpiry).toISOString()
    };
  }

  /**
   * 清除健康檢查緩存
   */
  clearHealthCache() {
    this.healthCheckCache = null;
    this.healthCheckCacheExpiry = 0;
    logger.debug('Health check cache cleared');
  }
}

// 創建單例實例
const geminiService = new GeminiService();

export default geminiService;