/**
 * 重構後系統完整性測試
 * 驗證所有主要功能是否正常運作
 */

import axios from 'axios';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3011';
const API_URL = `${BASE_URL}/api`;

// ANSI 顏色碼
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`)
};

let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

async function runTest(testName, testFn) {
  testResults.total++;
  try {
    await testFn();
    log.success(`${testName}`);
    testResults.passed++;
  } catch (error) {
    log.error(`${testName}: ${error.message}`);
    testResults.failed++;
  }
}

// 測試函數
async function testServerHealth() {
  const response = await axios.get(`${API_URL}/health`);
  if (response.status !== 200 || response.data.status !== 'OK') {
    throw new Error('Server health check failed');
  }
}

async function testApiDocs() {
  const response = await axios.get(`${API_URL}/docs`);
  if (response.status !== 200 || !response.data.title) {
    throw new Error('API docs endpoint failed');
  }
}

async function testHistoryEndpoint() {
  const response = await axios.get(`${API_URL}/history`);
  if (response.status !== 200 || !Array.isArray(response.data.data)) {
    throw new Error('History endpoint failed');
  }
}

async function testGeminiHealth() {
  const response = await axios.get(`${API_URL}/gemini/health`);
  if (response.status !== 200 || !response.data.service) {
    throw new Error('Gemini health check failed');
  }
}

async function testSpecGeneration() {
  const testIdea = "創建一個簡單的計算機應用程式，支援基本的加減乘除運算功能";
  
  const response = await fetch(`${API_URL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ idea: testIdea })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spec generation failed: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  if (!result.id || !result.generatedSpec) {
    throw new Error('Invalid spec generation response');
  }
  
  // 測試取得生成的規格
  const specResponse = await axios.get(`${API_URL}/spec/${result.id}`);
  if (specResponse.status !== 200 || !specResponse.data.generatedSpec) {
    throw new Error('Failed to retrieve generated spec');
  }
  
  // 測試下載功能
  const downloadResponse = await axios.get(`${API_URL}/download/${result.id}`, {
    responseType: 'text'
  });
  if (downloadResponse.status !== 200 || !downloadResponse.data.includes('Product Development Specification')) {
    throw new Error('Download functionality failed');
  }
  
  return result.id;
}

async function testValidation() {
  // 測試無效輸入
  try {
    await axios.post(`${API_URL}/generate`, {
      idea: "短"  // 太短的輸入
    });
    throw new Error('Validation should have failed for short input');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      // 預期的驗證錯誤
      return;
    }
    throw error;
  }
}

async function testErrorHandling() {
  // 測試不存在的規格 ID
  try {
    await axios.get(`${API_URL}/spec/999999`);
    throw new Error('Should return 404 for non-existent spec');
  } catch (error) {
    if (error.response && error.response.status === 404) {
      // 預期的 404 錯誤
      return;
    }
    throw error;
  }
}

async function testSecurityHeaders() {
  const response = await axios.get(`${API_URL}/health`);
  const headers = response.headers;
  
  const expectedHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'x-xss-protection'
  ];
  
  for (const header of expectedHeaders) {
    if (!headers[header]) {
      throw new Error(`Missing security header: ${header}`);
    }
  }
}

async function testStatusMonitor() {
  const response = await axios.get(`${BASE_URL}/status`);
  if (response.status !== 200) {
    throw new Error('Status monitor endpoint failed');
  }
}

async function testWebSocketInfo() {
  const response = await axios.get(`${API_URL}/docs`);
  if (!response.data.websocketEvents || !response.data.jobStatuses) {
    throw new Error('WebSocket documentation missing');
  }
}

// 主測試執行器
async function runAllTests() {
  log.info('開始執行重構後系統完整性測試...\n');
  
  // 基本健康檢查
  await runTest('伺服器健康檢查', testServerHealth);
  await runTest('API 文檔端點', testApiDocs);
  await runTest('狀態監控端點', testStatusMonitor);
  
  // 核心功能測試
  await runTest('歷史記錄端點', testHistoryEndpoint);
  await runTest('Gemini 健康檢查', testGeminiHealth);
  await runTest('規格生成功能', testSpecGeneration);
  
  // 驗證和錯誤處理
  await runTest('輸入驗證', testValidation);
  await runTest('錯誤處理', testErrorHandling);
  
  // 安全性測試
  await runTest('安全標頭檢查', testSecurityHeaders);
  
  // WebSocket 相關
  await runTest('WebSocket 文檔', testWebSocketInfo);
  
  // 輸出測試結果
  console.log('\n' + '='.repeat(50));
  log.info(`測試完成！`);
  log.info(`總計: ${testResults.total} 個測試`);
  log.success(`通過: ${testResults.passed} 個測試`);
  
  if (testResults.failed > 0) {
    log.error(`失敗: ${testResults.failed} 個測試`);
    process.exit(1);
  } else {
    log.success('🎉 所有測試都通過了！重構成功！');
    process.exit(0);
  }
}

// 執行測試
runAllTests().catch((error) => {
  log.error(`測試執行失敗: ${error.message}`);
  process.exit(1);
});