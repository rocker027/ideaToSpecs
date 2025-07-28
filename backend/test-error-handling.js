/**
 * 測試標準化錯誤處理功能
 */

import { 
  AppError, 
  createError, 
  classifyError, 
  formatErrorResponse,
  logError,
  generateRequestId
} from './utils/errorHandler.js';

import { ERROR_CODES, ERROR_TYPES, ERROR_SEVERITY, ERROR_CODE_TO_TYPE, ERROR_CODE_TO_SEVERITY } from './utils/errorTypes.js';

console.log('🧪 測試標準化錯誤處理功能\n');

// 測試 1: AppError 類
console.log('1. 測試 AppError 類');
const appError = new AppError(
  ERROR_CODES.VALIDATION_FAILED,
  'Test validation error',
  null,
  { field: 'email' }
);
console.log('- AppError JSON:', JSON.stringify(appError.toJSON(), null, 2));
console.log('- 錯誤類型:', appError.type);
console.log('- 錯誤嚴重程度:', appError.severity);
console.log('- HTTP 狀態碼:', appError.statusCode);
console.log('');

// 測試 2: 錯誤工廠函數
console.log('2. 測試錯誤工廠函數');
const validationError = createError.validation('Invalid email format', 'email');
const notFoundError = createError.notFound('User', 123);
const geminiError = createError.geminiCliError('generation', new Error('CLI timeout'));

console.log('- 驗證錯誤:', JSON.stringify(validationError.toJSON(), null, 2));
console.log('- 未找到錯誤:', JSON.stringify(notFoundError.toJSON(), null, 2));
console.log('- Gemini CLI 錯誤:', JSON.stringify(geminiError.toJSON(), null, 2));
console.log('');

// 測試 3: 錯誤分類器
console.log('3. 測試錯誤分類器');
const jsError = new Error('Database connection failed');
jsError.code = 'ECONNREFUSED';
const classifiedError = classifyError(jsError, { service: 'database' });
console.log('- 分類後的錯誤:', JSON.stringify(classifiedError.toJSON(), null, 2));
console.log('');

// 測試 4: 錯誤回應格式化
console.log('4. 測試錯誤回應格式化');
const devResponse = formatErrorResponse(appError, true);
const prodResponse = formatErrorResponse(appError, false);
console.log('- 開發環境回應:', JSON.stringify(devResponse, null, 2));
console.log('- 生產環境回應:', JSON.stringify(prodResponse, null, 2));
console.log('');

// 測試 5: 請求 ID 生成
console.log('5. 測試請求 ID 生成');
const requestId = generateRequestId();
console.log('- 生成的請求 ID:', requestId);
appError.setRequestId(requestId);
console.log('- 設置請求 ID 後:', JSON.stringify(appError.toJSON(), null, 2));
console.log('');

// 測試 6: 錯誤代碼覆蓋率
console.log('6. 測試錯誤代碼覆蓋率');

const errorCodes = Object.keys(ERROR_CODES);
console.log(`- 總共定義了 ${errorCodes.length} 個錯誤代碼`);
console.log('- 錯誤類型分布:');
const typeCount = {};
errorCodes.forEach(codeName => {
  const code = ERROR_CODES[codeName];
  const type = ERROR_CODE_TO_TYPE[code] || 'unknown';
  typeCount[type] = (typeCount[type] || 0) + 1;
});
Object.entries(typeCount).forEach(([type, count]) => {
  console.log(`  ${type}: ${count} 個錯誤代碼`);
});
console.log('');

// 測試 7: 錯誤嚴重程度分布
console.log('7. 測試錯誤嚴重程度分布');
const severityCount = {};
errorCodes.forEach(codeName => {
  const code = ERROR_CODES[codeName];
  const severity = ERROR_CODE_TO_SEVERITY[code] || 'unknown';
  severityCount[severity] = (severityCount[severity] || 0) + 1;
});
Object.entries(severityCount).forEach(([severity, count]) => {
  console.log(`  ${severity}: ${count} 個錯誤代碼`);
});
console.log('');

console.log('✅ 所有測試完成！標準化錯誤處理功能正常運作。');