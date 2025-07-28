/**
 * 安全輸入驗證模組
 * 防止命令注入、SQL注入和其他安全威脅
 */

import validator from 'validator';

/**
 * 驗證和消毒用戶想法輸入
 * @param {string} userInput - 用戶輸入的想法
 * @returns {string} - 消毒後的安全輸入
 * @throws {Error} - 當輸入無效時拋出錯誤
 */
export function validateAndSanitizeInput(userInput) {
  // 基本驗證
  if (!userInput || typeof userInput !== 'string') {
    throw new Error('輸入不能為空');
  }

  // 長度驗證 - 防止過長輸入導致的 DoS
  if (userInput.length < 2) {
    throw new Error('輸入至少需要2個字符');
  }
  
  if (userInput.length > 5000) {
    throw new Error('輸入長度不能超過5000字符');
  }

  // 檢查危險字符模式 - 防止命令注入
  const dangerousPatterns = [
    /[`${}\\]/,                    // Shell 特殊字符
    /;\s*(rm|del|format|shutdown)/, // 危險命令
    /(curl|wget|nc|netcat)/i,      // 網路命令
    /(\||&{1,2}|;|\n|\r)/,         // 命令分隔符
    /(<script|javascript:|vbscript:|onload|onerror)/i, // XSS 模式
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(userInput)) {
      throw new Error('輸入包含潛在危險字符');
    }
  }

  // 內容驗證 - 只允許安全字符（中文、英文、數字、常用標點）
  const allowedPattern = /^[a-zA-Z0-9\s\u4e00-\u9fff\u3002\uff0c\uff01\uff1f\uff1a\uff1b\u201c\u201d\u2018\u2019\u3001\u300a\u300b.,!?():;'"\/\-_+=@#%&*[\]{}|~`^<>]+$/;
  
  if (!allowedPattern.test(userInput)) {
    throw new Error('輸入包含不允許的特殊字符');
  }

  // 基本消毒 - 移除潛在危險字符
  let sanitized = userInput
    .replace(/[`${}\\]/g, '') // 移除 Shell 特殊字符
    .replace(/[\r\n]+/g, ' ') // 將換行替換為空格
    .replace(/\s+/g, ' ')     // 合併多個空格
    .trim();

  // HTML 實體編碼防止 XSS
  sanitized = validator.escape(sanitized);

  return sanitized;
}

/**
 * 驗證搜尋查詢輸入
 * @param {string} search - 搜尋查詢字串
 * @returns {string|null} - 消毒後的搜尋字串或 null
 * @throws {Error} - 當輸入無效時拋出錯誤
 */
export function validateSearchInput(search) {
  if (!search) return null;

  // 類型檢查
  if (typeof search !== 'string') {
    throw new Error('搜尋查詢必須是字串');
  }

  // 長度驗證
  if (search.length > 100) {
    throw new Error('搜尋查詢過長（最多100字符）');
  }

  // 檢查 SQL 注入模式
  const sqlInjectionPatterns = [
    /['";]/,                                    // SQL 引號
    /(--|\#|\/\*|\*\/)/,                       // SQL 註釋
    /(union|select|insert|update|delete|drop|alter|create|exec|execute)\s/i, // SQL 關鍵字
    /(\bor\b|\band\b)\s+\w+\s*=\s*\w+/i,      // SQL 邏輯運算
    /\b(1\s*=\s*1|0\s*=\s*0|true|false)\b/i,  // 常見注入模式
  ];

  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(search)) {
      throw new Error('搜尋查詢包含無效字符');
    }
  }

  // 內容消毒
  let sanitized = search
    .replace(/['"`;]/g, '')   // 移除 SQL 特殊字符
    .replace(/\s+/g, ' ')     // 合併空格
    .trim();

  // HTML 實體編碼
  sanitized = validator.escape(sanitized);

  return sanitized.length > 0 ? sanitized : null;
}

/**
 * 驗證數字參數（如 limit, offset）
 * @param {any} value - 要驗證的值
 * @param {object} options - 驗證選項
 * @returns {number} - 驗證後的數字
 * @throws {Error} - 當輸入無效時拋出錯誤
 */
export function validateNumericParam(value, options = {}) {
  const { min = 0, max = 1000, defaultValue = 0 } = options;

  // 如果值為空或未定義，返回預設值
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  // 轉換為數字
  const numValue = parseInt(value, 10);

  // 檢查是否為有效數字
  if (isNaN(numValue)) {
    throw new Error('參數必須是有效數字');
  }

  // 範圍檢查
  if (numValue < min || numValue > max) {
    throw new Error(`參數必須在 ${min} 到 ${max} 之間`);
  }

  return numValue;
}

/**
 * 驗證 ID 參數
 * @param {any} id - 要驗證的 ID
 * @returns {number} - 驗證後的 ID
 * @throws {Error} - 當 ID 無效時拋出錯誤
 */
export function validateId(id) {
  const numId = parseInt(id, 10);
  
  if (isNaN(numId) || numId <= 0) {
    throw new Error('無效的 ID');
  }
  
  if (numId > 2147483647) { // 32位整數最大值
    throw new Error('ID 超出範圍');
  }
  
  return numId;
}

/**
 * 通用輸入消毒函數
 * @param {string} input - 要消毒的輸入
 * @returns {string} - 消毒後的字串
 */
export function sanitizeString(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return validator.escape(input)
    .replace(/[<>]/g, '')     // 移除尖括號
    .replace(/javascript:/gi, '') // 移除 javascript: 協議
    .trim();
}

/**
 * 驗證檔案名稱（用於下載功能）
 * @param {string} filename - 檔案名稱
 * @returns {string} - 安全的檔案名稱
 * @throws {Error} - 當檔案名稱無效時拋出錯誤
 */
export function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('檔案名稱不能為空');
  }
  
  // 長度檢查
  if (filename.length > 255) {
    throw new Error('檔案名稱過長');
  }
  
  // 檢查危險字符
  const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (dangerousChars.test(filename)) {
    throw new Error('檔案名稱包含無效字符');
  }
  
  // 檢查保留名稱（Windows）
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  const nameWithoutExt = filename.split('.')[0];
  if (reservedNames.test(nameWithoutExt)) {
    throw new Error('檔案名稱為保留名稱');
  }
  
  return filename.trim();
}

// 導出所有驗證函數
export default {
  validateAndSanitizeInput,
  validateSearchInput,
  validateNumericParam,
  validateId,
  sanitizeString,
  validateFilename
};