#!/usr/bin/env node

// Test script for real Gemini CLI integration
import { spawn } from 'child_process';

console.log('🧪 Testing Real Gemini CLI Integration');
console.log('=====================================\n');

// Test 1: Check Gemini CLI availability
console.log('1. Checking Gemini CLI availability...');
try {
  const versionProcess = spawn('gemini', ['--version'], { stdio: 'pipe' });
  let versionOutput = '';
  
  versionProcess.stdout.on('data', (data) => {
    versionOutput += data.toString();
  });
  
  versionProcess.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Gemini CLI is available, version:', versionOutput.trim());
      testGeminiGeneration();
    } else {
      console.log('❌ Gemini CLI version check failed with code:', code);
    }
  });
  
  versionProcess.on('error', (err) => {
    console.log('❌ Gemini CLI not found or error:', err.message);
  });
} catch (error) {
  console.log('❌ Error checking Gemini CLI:', error.message);
}

// Test 2: Test actual specification generation
function testGeminiGeneration() {
  console.log('\n2. Testing specification generation...');
  
  const testIdea = '製作一個簡單的待辦事項管理應用程式';
  console.log('Test idea:', testIdea);
  
  const prompt = `請為以下創意製作一份詳盡的產品開發規格文檔：「${testIdea}」

請包含以下章節：
1. **專案概述** - 簡要描述和目標
2. **核心功能** - 主要功能和能力
3. **技術需求** - 技術棧和架構
4. **用戶界面設計** - UI/UX 考量
5. **開發路線圖** - 實施階段和時間表
6. **成功指標** - KPI 和衡量標準

請用乾淨的 Markdown 格式輸出，包含適當的標題、項目符號和代碼塊。使用表情符號使其更具視覺吸引力。

輸出語言：繁體中文
格式要求：Markdown
內容要求：專業、詳細、可執行`;

  const startTime = Date.now();
  console.log('🚀 Starting Gemini CLI call...');
  
  const geminiProcess = spawn('gemini', ['-p', prompt], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60000 // 1 minute timeout for test
  });

  let output = '';
  let error = '';
  let dataReceived = 0;

  geminiProcess.stdout.on('data', (data) => {
    output += data.toString();
    dataReceived += data.length;
    console.log(`📡 Received data: ${Math.floor(dataReceived / 1024)}KB`);
  });

  geminiProcess.stderr.on('data', (data) => {
    error += data.toString();
  });

  geminiProcess.on('close', (code) => {
    const duration = Date.now() - startTime;
    
    if (code === 0) {
      console.log(`✅ Gemini CLI completed successfully in ${duration}ms`);
      console.log(`📊 Output length: ${output.length} characters`);
      console.log(`📝 First 500 characters of output:`);
      console.log('---');
      console.log(output.substring(0, 500));
      console.log('---');
      
      if (output.length > 1000) {
        console.log('🎉 Test PASSED: Generated substantial specification content');
      } else {
        console.log('⚠️  Test WARNING: Output seems too short');
      }
    } else {
      console.log(`❌ Gemini CLI failed with code ${code}`);
      console.log('Error output:', error);
    }
  });

  geminiProcess.on('error', (err) => {
    console.log('❌ Failed to start Gemini CLI:', err.message);
  });
  
  // Set a manual timeout
  setTimeout(() => {
    if (!geminiProcess.killed) {
      console.log('⏰ Timeout reached, killing process...');
      geminiProcess.kill('SIGTERM');
    }
  }, 65000);
}