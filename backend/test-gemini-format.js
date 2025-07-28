/**
 * Gemini CLI 輸出格式診斷測試腳本
 * 用於分析 Gemini 實際輸出格式，幫助修復解析問題
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// 測試用的簡單 prompt
const TEST_PROMPTS = [
  '測試輸出格式',
  '製作一個簡單的todo list應用',
  'hello world'
];

/**
 * 測試不同的 Gemini CLI 調用方式
 */
async function testGeminiOutputFormats() {
  console.log('🔍 Gemini CLI 輸出格式診斷工具');
  console.log('=====================================\n');

  for (const prompt of TEST_PROMPTS) {
    console.log(`📝 測試 Prompt: "${prompt}"`);
    console.log('-'.repeat(50));

    try {
      // 方法 1: 直接使用 -p 參數
      await testMethod1(prompt);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 方法 2: 使用 echo 管道
      await testMethod2(prompt);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 方法 3: 使用 spawn stdin
      await testMethod3(prompt);
      
    } catch (error) {
      console.error(`❌ 測試失敗: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }
}

/**
 * 方法 1: 直接使用 -p 參數
 */
async function testMethod1(prompt) {
  console.log('📋 方法 1: 直接參數調用');
  
  try {
    const startTime = Date.now();
    const { stdout, stderr } = await execAsync(`gemini -p "${prompt.replace(/"/g, '\\"')}"`, {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });
    const duration = Date.now() - startTime;

    console.log(`⏱️  執行時間: ${duration}ms`);
    console.log(`📏 輸出長度: ${stdout.length} 字符`);
    
    if (stderr) {
      console.log(`⚠️  標準錯誤: ${stderr.substring(0, 200)}`);
    }

    analyzeOutput('方法1', stdout);
    
  } catch (error) {
    console.log(`❌ 方法1失敗: ${error.message}`);
  }
}

/**
 * 方法 2: 使用 echo 管道
 */
async function testMethod2(prompt) {
  console.log('📋 方法 2: Echo 管道調用');
  
  try {
    const startTime = Date.now();
    const { stdout, stderr } = await execAsync(`echo "${prompt.replace(/"/g, '\\"')}" | gemini -p`, {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });
    const duration = Date.now() - startTime;

    console.log(`⏱️  執行時間: ${duration}ms`);
    console.log(`📏 輸出長度: ${stdout.length} 字符`);
    
    if (stderr) {
      console.log(`⚠️  標準錯誤: ${stderr.substring(0, 200)}`);
    }

    analyzeOutput('方法2', stdout);
    
  } catch (error) {
    console.log(`❌ 方法2失敗: ${error.message}`);
  }
}

/**
 * 方法 3: 使用 spawn 和 stdin（當前 geminiSafe.js 的方式）
 */
async function testMethod3(prompt) {
  console.log('📋 方法 3: Spawn + Stdin 調用');
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const geminiProcess = spawn('gemini', ['-p'], {
      env: { ...process.env, HOME: os.homedir() },
      cwd: os.homedir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    let output = '';
    let errorOutput = '';

    // 超時處理
    const timeout = setTimeout(() => {
      geminiProcess.kill('SIGTERM');
      reject(new Error('Spawn 方法超時'));
    }, 30000);

    geminiProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    geminiProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    geminiProcess.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;
      
      if (code === 0) {
        console.log(`⏱️  執行時間: ${duration}ms`);
        console.log(`📏 輸出長度: ${output.length} 字符`);
        
        if (errorOutput) {
          console.log(`⚠️  標準錯誤: ${errorOutput.substring(0, 200)}`);
        }

        analyzeOutput('方法3', output);
        resolve();
      } else {
        console.log(`❌ 方法3失敗: 退出碼 ${code}`);
        resolve();
      }
    });

    geminiProcess.on('error', (error) => {
      clearTimeout(timeout);
      console.log(`❌ 方法3錯誤: ${error.message}`);
      resolve();
    });

    // 寫入 prompt
    try {
      geminiProcess.stdin.write(prompt);
      geminiProcess.stdin.end();
    } catch (error) {
      clearTimeout(timeout);
      console.log(`❌ 寫入失敗: ${error.message}`);
      resolve();
    }
  });
}

/**
 * 分析輸出內容的詳細特徵
 */
function analyzeOutput(method, output) {
  console.log(`\n🔬 ${method} 輸出分析:`);
  
  // 基本信息
  console.log(`   📐 總長度: ${output.length}`);
  console.log(`   📄 行數: ${output.split('\n').length}`);
  
  // 前後內容預覽
  console.log(`   🔺 前 100 字符: "${output.substring(0, 100).replace(/\n/g, '\\n')}"`);
  console.log(`   🔻 後 100 字符: "${output.substring(Math.max(0, output.length - 100)).replace(/\n/g, '\\n')}"`);
  
  // 特殊字符檢測
  const hasAnsi = /\x1b\[[0-9;]*m/.test(output);
  const hasMarkdownBlocks = /```\w*/.test(output);
  const hasMarkdownHeadings = /^#+\s+/m.test(output);
  const hasControlChars = /[\x00-\x1f]/.test(output);
  
  console.log(`   🎨 包含 ANSI 顏色碼: ${hasAnsi ? '是' : '否'}`);
  console.log(`   📝 包含 Markdown 程式碼塊: ${hasMarkdownBlocks ? '是' : '否'}`);
  console.log(`   📋 包含 Markdown 標題: ${hasMarkdownHeadings ? '是' : '否'}`);
  console.log(`   🔧 包含控制字符: ${hasControlChars ? '是' : '否'}`);
  
  // 檢測可能的格式問題
  const issues = [];
  if (output.length < 10) issues.push('輸出太短');
  if (output.trim() === '') issues.push('輸出為空');
  if (hasControlChars && !hasAnsi) issues.push('意外的控制字符');
  if (output.includes('Error') || output.includes('error')) issues.push('包含錯誤信息');
  
  if (issues.length > 0) {
    console.log(`   ⚠️  潛在問題: ${issues.join(', ')}`);
  } else {
    console.log(`   ✅ 輸出看起來正常`);
  }
  
  console.log('');
}

/**
 * 檢查 Gemini CLI 可用性
 */
async function checkGeminiAvailability() {
  console.log('🔍 檢查 Gemini CLI 可用性...');
  
  try {
    const { stdout } = await execAsync('which gemini');
    console.log(`✅ Gemini CLI 路徑: ${stdout.trim()}`);
    
    const { stdout: version } = await execAsync('gemini --version');
    console.log(`📦 版本信息: ${version.trim()}`);
    
    return true;
  } catch (error) {
    console.log(`❌ Gemini CLI 不可用: ${error.message}`);
    return false;
  }
}

/**
 * 主執行函數
 */
async function main() {
  console.clear();
  
  const isAvailable = await checkGeminiAvailability();
  if (!isAvailable) {
    console.log('\n請確保 Gemini CLI 已正確安裝和配置。');
    process.exit(1);
  }
  
  console.log('\n開始輸出格式測試...\n');
  await testGeminiOutputFormats();
  
  console.log('🎉 診斷完成！');
  console.log('\n💡 根據以上結果，可以確定：');
  console.log('   1. 哪種調用方式最穩定');
  console.log('   2. 輸出是否包含特殊格式');
  console.log('   3. 需要如何清理和解析輸出');
}

// 如果直接執行此腳本
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testGeminiOutputFormats, analyzeOutput };