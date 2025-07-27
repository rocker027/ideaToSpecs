import { spawn, execSync } from 'child_process';
import os from 'os';

async function testGeminiFixed() {
  console.log('🧪 Testing Gemini CLI with fixed parameters...');
  
  // 簡化的單行 prompt（和 server.js 中一致）
  const idea = '製作一個todo list';
  const prompt = `為「${idea}」生成詳細的軟體規格文件。請包含以下章節：1. 專案概述與目標 2. 核心功能清單 3. 技術架構設計 4. 用戶界面設計考量 5. 開發路線圖與時程 6. 成功指標與KPI。請用乾淨的 Markdown 格式輸出，包含適當的標題、項目符號和代碼塊。使用表情符號增加視覺效果。輸出語言：繁體中文。格式要求：Markdown。內容要求：專業、詳細、可執行。`;
  
  // 驗證 Gemini CLI 路徑
  let geminiPath = 'unknown';
  try {
    geminiPath = execSync('which gemini').toString().trim();
    console.log('✅ Gemini CLI path verified:', geminiPath);
  } catch (error) {
    console.log('⚠️  Gemini CLI path not found in PATH');
  }
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // 保留使用者環境
    const env = {
      ...process.env,
      HOME: os.homedir(),
      USER: os.userInfo().username,
    };
    
    console.log('🚀 Starting Gemini CLI with parameters:');
    console.log('   Command: gemini');
    console.log('   Args: ["-p", "<prompt>"]');
    console.log('   Prompt length:', prompt.length, 'characters');
    console.log('   Working directory:', os.homedir());
    console.log('   Environment: HOME =', env.HOME);
    
    // 不使用 shell，直接傳遞參數陣列
    const geminiProcess = spawn('gemini', ['-p', prompt], {
      env,
      cwd: os.homedir(),
      // 注意：沒有 shell: true
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';
    let isCompleted = false;

    // 設置超時
    const timeoutId = setTimeout(() => {
      if (!isCompleted) {
        isCompleted = true;
        geminiProcess.kill('SIGTERM');
        reject(new Error('Gemini CLI timeout after 30000ms'));
      }
    }, 30000);

    geminiProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log('📄 Received data chunk:', data.toString().substring(0, 100) + '...');
    });

    geminiProcess.stderr.on('data', (data) => {
      error += data.toString();
      console.log('⚠️  Received error:', data.toString());
    });

    geminiProcess.on('close', (code) => {
      if (!isCompleted) {
        isCompleted = true;
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        
        console.log(`🏁 Process closed with code: ${code}, duration: ${duration}ms`);
        console.log(`📊 Output length: ${output.length}, Error length: ${error.length}`);
        
        if (code === 0) {
          resolve({
            output: output.trim(),
            duration,
            outputLength: output.length
          });
        } else {
          reject(new Error(`Gemini CLI failed with code ${code}: ${error}`));
        }
      }
    });

    geminiProcess.on('error', (err) => {
      if (!isCompleted) {
        isCompleted = true;
        clearTimeout(timeoutId);
        console.log('❌ Process error:', err.message);
        reject(new Error(`Failed to start Gemini CLI: ${err.message}`));
      }
    });
  });
}

// 運行測試
testGeminiFixed()
  .then(result => {
    console.log('\n✅ Test successful!');
    console.log('📄 Output preview:', result.output.substring(0, 200) + '...');
    console.log('⏱️  Duration:', result.duration + 'ms');
    console.log('📊 Total output length:', result.outputLength, 'characters');
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });