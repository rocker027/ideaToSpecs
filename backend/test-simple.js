import { spawn } from 'child_process';
import os from 'os';

async function testSimpleGemini() {
  console.log('🧪 Testing simplified Gemini CLI call...');
  
  const idea = '製作一個todo list';
  const prompt = `請為「${idea}」製作一份軟體開發規格。包含：專案概述、功能需求、技術架構、開發階段。用Markdown格式，繁體中文回答。`;
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    console.log('🚀 Starting Gemini CLI...');
    console.log('   Command: gemini -p "<prompt>"');
    console.log('   Prompt length:', prompt.length, 'characters');
    
    // 簡化的環境設定
    const env = {
      ...process.env,
      HOME: os.homedir(),
      USER: os.userInfo().username,
    };
    
    // 不使用 shell，直接傳遞參數
    const geminiProcess = spawn('gemini', ['-p', prompt], {
      env,
      cwd: os.homedir(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';
    let isCompleted = false;

    // 增加超時時間到 3 分鐘
    const timeoutId = setTimeout(() => {
      if (!isCompleted) {
        isCompleted = true;
        geminiProcess.kill('SIGTERM');
        reject(new Error('Gemini CLI timeout after 180000ms'));
      }
    }, 180000);

    geminiProcess.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write('.');  // 顯示進度
    });

    geminiProcess.stderr.on('data', (data) => {
      error += data.toString();
      console.log('\n⚠️  Error chunk:', data.toString());
    });

    geminiProcess.on('close', (code) => {
      if (!isCompleted) {
        isCompleted = true;
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        
        console.log(`\n🏁 Process completed with code: ${code}`);
        console.log(`⏱️  Duration: ${duration}ms`);
        console.log(`📊 Output: ${output.length} chars, Error: ${error.length} chars`);
        
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
        console.log('\n❌ Process error:', err.message);
        reject(new Error(`Failed to start Gemini CLI: ${err.message}`));
      }
    });
  });
}

// 運行測試
testSimpleGemini()
  .then(result => {
    console.log('\n✅ Test successful!');
    console.log('📄 Generated specification:');
    console.log('─'.repeat(50));
    console.log(result.output);
    console.log('─'.repeat(50));
    console.log(`⏱️  Duration: ${result.duration}ms`);
    console.log(`📊 Length: ${result.outputLength} characters`);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
  });