/**
 * 安全的 Gemini CLI 整合模組
 * 防止命令注入攻擊並提供安全的 AI 生成功能
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import os from 'os';
import path from 'path';
import { validateAndSanitizeInput } from './validators.js';

// 異步 exec 函數
const execAsync = promisify(exec);

/**
 * 安全的 Gemini CLI 配置
 */
const GEMINI_CONFIG = {
  // 執行超時時間（毫秒）
  timeout: 180000, // 3 分鐘
  
  // 最大輸出緩衝區大小
  maxBuffer: 5 * 1024 * 1024, // 5MB
  
  // 最大重試次數
  maxRetries: 2,
  
  // 重試延遲（毫秒）
  retryDelay: 1000,
  
  // 安全的環境變數
  safeEnv: {
    PATH: process.env.PATH,
    HOME: os.homedir(),
    USER: os.userInfo().username,
    // 明確排除潛在危險的環境變數
    // 不包含 SHELL, PS1, 等可能被利用的變數
  }
};

/**
 * 驗證 Gemini CLI 是否可用
 * @returns {Promise<boolean>} - CLI 是否可用
 */
export async function checkGeminiAvailability() {
  try {
    const result = await execAsync('which gemini', {
      timeout: 5000,
      env: GEMINI_CONFIG.safeEnv
    });
    
    return result.stdout.trim().length > 0;
  } catch (error) {
    console.warn('Gemini CLI 不可用:', error.message);
    return false;
  }
}

/**
 * 測試 Gemini CLI 基本功能
 * @returns {Promise<boolean>} - 測試是否成功
 */
export async function testGeminiBasicFunction() {
  try {
    const testPrompt = 'hi';
    const result = await generateWithGeminiSafe(testPrompt, { isTest: true });
    return result && result.length > 0;
  } catch (error) {
    console.warn('Gemini CLI 測試失敗:', error.message);
    return false;
  }
}

/**
 * 安全的 Gemini 生成函數（使用 spawn 方式）
 * @param {string} userInput - 使用者輸入的想法
 * @param {object} options - 選項設定
 * @returns {Promise<string>} - 生成的規格文檔
 * @throws {Error} - 當生成失敗時拋出錯誤
 */
export async function generateWithGeminiSafe(userInput, options = {}) {
  const {
    timeout = GEMINI_CONFIG.timeout,
    maxRetries = GEMINI_CONFIG.maxRetries,
    retryDelay = GEMINI_CONFIG.retryDelay,
    jobId = null,
    emitJobUpdate = null,
    isTest = false
  } = options;

  // 輸入驗證和消毒（測試模式跳過完整驗證）
  let sanitizedInput;
  if (isTest) {
    sanitizedInput = userInput;
  } else {
    sanitizedInput = validateAndSanitizeInput(userInput);
  }

  // 構建安全的 prompt
  const prompt = isTest 
    ? sanitizedInput 
    : `請為「${sanitizedInput}」製作一份軟體開發規格。包含：專案概述、功能需求、技術架構、開發階段。用Markdown格式，繁體中文回答。`;

  // 使用安全的 spawn 方法進行重試
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // 使用安全的 spawn 方法
      const result = await executeGeminiSafely(prompt, {
        timeout,
        jobId,
        emitJobUpdate,
        attempt
      });
      
      return result;
    } catch (error) {
      console.error(`Gemini CLI 執行失敗 (嘗試 ${attempt}/${maxRetries + 1}):`, error.message);
      
      if (attempt <= maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        continue;
      }
      
      // 拋出錯誤信息
      throw new Error(`Gemini CLI 執行失敗: ${error.message}`);
    }
  }
}

// 已移除不安全的 executeGeminiWithEcho 函數以防止命令注入攻擊
// 使用下方安全的 executeGeminiSafely 函數作為唯一執行方式

/**
 * 安全執行 Gemini CLI（核心實現 - 使用 spawn）
 * @param {string} prompt - 要處理的 prompt
 * @param {object} options - 執行選項
 * @returns {Promise<string>} - Gemini 輸出結果
 */
async function executeGeminiSafely(prompt, options = {}) {
  const {
    timeout = GEMINI_CONFIG.timeout,
    jobId = null,
    emitJobUpdate = null,
    attempt = 1
  } = options;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // 發送進度更新
    if (jobId && emitJobUpdate) {
      emitJobUpdate(jobId, 'processing', {
        message: `嘗試 ${attempt}: 正在調用 Gemini CLI...`,
        attempt
      });
    }

    // 使用 spawn 啟動 Gemini CLI，不使用 shell
    const geminiProcess = spawn('gemini', ['-p'], {
      env: GEMINI_CONFIG.safeEnv,
      cwd: os.homedir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      // 重要：不使用 shell，避免命令注入
      shell: false,
      // 設定用戶權限（如果可用）
      uid: process.getuid?.(),
      gid: process.getgid?.(),
    });

    let output = '';
    let errorOutput = '';
    let isCompleted = false;

    // 設定超時處理
    const timeoutId = setTimeout(() => {
      if (!isCompleted) {
        isCompleted = true;
        geminiProcess.kill('SIGTERM');
        
        // 如果 SIGTERM 不起作用，使用 SIGKILL
        setTimeout(() => {
          if (!geminiProcess.killed) {
            geminiProcess.kill('SIGKILL');
          }
        }, 5000);
        
        reject(new Error(`Gemini CLI 執行超時 (${timeout}ms)`));
      }
    }, timeout);

    // 安全地寫入 prompt 到 stdin
    try {
      geminiProcess.stdin.write(prompt);
      geminiProcess.stdin.end();
    } catch (error) {
      clearTimeout(timeoutId);
      reject(new Error(`無法寫入到 Gemini CLI: ${error.message}`));
      return;
    }

    // 處理標準輸出
    geminiProcess.stdout.on('data', (data) => {
      if (!isCompleted) {
        output += data.toString();
        
        // 發送進度更新
        if (jobId && emitJobUpdate) {
          emitJobUpdate(jobId, 'processing', {
            message: `正在接收 Gemini 回應... (${Math.floor(output.length / 1024)}KB)`,
            dataReceived: Number(output.length)
          });
        }
        
        // 檢查輸出大小限制
        if (output.length > GEMINI_CONFIG.maxBuffer) {
          isCompleted = true;
          clearTimeout(timeoutId);
          geminiProcess.kill('SIGTERM');
          reject(new Error('Gemini CLI 輸出超過大小限制'));
        }
      }
    });

    // 處理標準錯誤
    geminiProcess.stderr.on('data', (data) => {
      if (!isCompleted) {
        errorOutput += data.toString();
        console.warn('Gemini CLI stderr:', data.toString());
      }
    });

    // 處理進程結束
    geminiProcess.on('close', (code) => {
      if (!isCompleted) {
        isCompleted = true;
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (code === 0) {
          console.log(`✅ Gemini CLI 執行成功 (${duration}ms)`);
          
          if (jobId && emitJobUpdate) {
            emitJobUpdate(jobId, 'processing', {
              message: '✅ Gemini CLI 調用成功，正在處理回應...',
              duration: Number(duration),
              outputLength: Number(output.length)
            });
          }
          
          resolve(output.trim());
        } else {
          const errorMsg = `Gemini CLI 執行失敗 (代碼: ${code}): ${errorOutput}`;
          console.error(errorMsg);
          reject(new Error(errorMsg));
        }
      }
    });

    // 處理進程錯誤
    geminiProcess.on('error', (error) => {
      if (!isCompleted) {
        isCompleted = true;
        clearTimeout(timeoutId);
        console.error('Gemini CLI 進程錯誤:', error);
        reject(new Error(`無法啟動 Gemini CLI: ${error.message}`));
      }
    });
  });
}

/**
 * 安全的 Gemini 生成函數（備用的 exec 方式，用於簡單測試）
 * @param {string} userInput - 使用者輸入
 * @param {object} options - 選項設定
 * @returns {Promise<string>} - 生成結果
 */
export async function generateWithGeminiExec(userInput, options = {}) {
  const { timeout = 30000 } = options;
  
  // 輸入驗證
  const sanitizedInput = validateAndSanitizeInput(userInput);
  
  // 使用 shell 引號轉義來防止注入
  const escapedInput = sanitizedInput.replace(/'/g, "'\"'\"'");
  const command = `echo '${escapedInput}' | gemini -p`;
  
  try {
    const result = await execAsync(command, {
      timeout,
      maxBuffer: GEMINI_CONFIG.maxBuffer,
      env: GEMINI_CONFIG.safeEnv,
      cwd: os.homedir()
    });
    
    return result.stdout.trim();
  } catch (error) {
    throw new Error(`Gemini CLI 執行失敗: ${error.message}`);
  }
}

/**
 * 格式化生成的規格文檔
 * @param {string} rawOutput - Gemini 的原始輸出
 * @param {string} originalIdea - 原始用戶想法
 * @returns {string} - 格式化後的規格文檔
 */
export function formatSpecification(rawOutput, originalIdea) {
  if (!rawOutput || typeof rawOutput !== 'string') {
    console.error('無效的 Gemini 輸出類型:', typeof rawOutput);
    throw new Error('無效的 Gemini 輸出');
  }

  // 詳細日誌記錄原始輸出用於調試
  console.log('Gemini 原始輸出長度:', rawOutput.length);
  console.log('Gemini 輸出前 200 字元:', rawOutput.substring(0, 200));
  
  // 多階段清理輸出
  let cleanOutput = rawOutput;
  
  // 第1步: 移除 ANSI 顏色碼和控制字符
  cleanOutput = cleanOutput.replace(/\x1b\[[0-9;]*m/g, ''); // ANSI 顏色碼
  cleanOutput = cleanOutput.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // 控制字符
  
  // 第2步: 統一換行符和清理空白
  cleanOutput = cleanOutput
    .trim()
    .replace(/\r\n/g, '\n')  // 統一換行符
    .replace(/\n{3,}/g, '\n\n'); // 限制連續空行
  
  // 第3步: 檢查輸出是否太短 (基於診斷結果調整標準)
  if (cleanOutput.length < 30) {
    console.warn('Gemini 輸出太短，可能是簡短回應:', cleanOutput);
    
    // 如果輸出很短但有意義，擴展它
    if (cleanOutput.length > 0) {
      cleanOutput = `根據您的想法「${originalIdea}」，以下是初步的分析和建議：\n\n${cleanOutput}\n\n請提供更多詳細信息以生成完整的規格文件。`;
    } else {
      throw new Error('Gemini 輸出為空或過短');
    }
  }
  
  // 第4步: 檢測並提取可能的 Markdown 內容
  // 如果輸出包含 ```markdown 標記，提取其中的內容
  const markdownMatch = cleanOutput.match(/```markdown\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    cleanOutput = markdownMatch[1];
    console.log('提取到 Markdown 區塊內容');
  }
  
  // 第5步: 確保有適當的 Markdown 格式
  if (!cleanOutput.includes('#')) {
    // 如果沒有標題，添加一個
    cleanOutput = `# ${originalIdea} - 產品規格文件\n\n${cleanOutput}`;
  }
  
  // 第6步: 組裝最終格式
  const metadata = [
    '# Product Development Specification',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Original Idea:** ${originalIdea}`,
    '',
    '---',
    '',
    cleanOutput,
    '',
    '---',
    '',
    '*Generated using Gemini CLI integration*'
  ].join('\n');

  console.log('最終格式化輸出長度:', metadata.length);
  return metadata;
}

// 導出配置供其他模組使用
export { GEMINI_CONFIG };

// 預設導出
export default {
  generateWithGeminiSafe,
  generateWithGeminiExec,
  checkGeminiAvailability,
  testGeminiBasicFunction,
  formatSpecification,
  GEMINI_CONFIG
};