# Gemini CLI OAuth 整合計劃（無 API Key）

## 📋 問題分析
Gemini CLI 使用 Google OAuth 認證而非 API key，導致 Node.js child_process 無法正確存取使用者的授權 token。

## 🎯 解決方案計劃

### Phase 1: 診斷與驗證
```bash
# 1. 確認 Gemini CLI 授權狀態
gemini auth status

# 2. 測試直接執行
gemini generate --prompt "test specification"

# 3. 找出授權檔案位置
find ~ -name "*gemini*" -type f 2>/dev/null | grep -E "(config|auth|token)"
```

### Phase 2: 修改 Backend 調用方式

#### 方案 A: 保留使用者環境上下文
````javascript
// backend/server.js - 修改 generateSpecWithGemini 函數
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

const generateSpecWithGemini = (idea) => {
  return new Promise((resolve, reject) => {
    logger.info('Starting Gemini CLI generation with OAuth context');
    
    // 保留完整的使用者環境
    const env = {
      ...process.env,
      HOME: os.homedir(),
      USER: os.userInfo().username,
      // 保留 Google OAuth 相關環境變數
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      PATH: process.env.PATH,
    };
    
    // 使用 shell 模式確保環境變數正確載入
    const gemini = spawn('gemini', ['generate', '--prompt', prompt], {
      env,
      cwd: os.homedir(), // 使用使用者 home 目錄作為工作目錄
      shell: true,        // 重要：使用 shell 以載入使用者環境
      timeout: REQUEST_TIMEOUT || 60000,
      uid: process.getuid?.(), // 保持相同的使用者 ID
      gid: process.getgid?.(), // 保持相同的群組 ID
    });
    
    let output = '';
    let errorOutput = '';
    
    gemini.stdout.on('data', (data) => {
      output += data.toString();
      logger.debug('Gemini output chunk:', data.toString());
    });
    
    gemini.stderr.on('data', (data) => {
      errorOutput += data.toString();
      logger.warn('Gemini stderr:', data.toString());
    });
    
    gemini.on('close', (code) => {
      if (code !== 0) {
        logger.error('Gemini CLI failed:', { code, error: errorOutput });
        reject(new Error(`Gemini CLI exited with code ${code}: ${errorOutput}`));
      } else {
        resolve(output);
      }
    });
  });
};
````

#### 方案 B: 使用互動式 Shell Session
````javascript
// backend/server.js - 使用持續的 shell session
import { spawn } from 'child_process';
import pty from 'node-pty'; // 需要安裝: npm install node-pty

class GeminiCLIService {
  constructor() {
    this.terminal = null;
    this.initializeTerminal();
  }
  
  initializeTerminal() {
    // 創建偽終端以模擬真實的終端環境
    this.terminal = pty.spawn('bash', [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });
    
    // 等待 shell 初始化
    this.terminal.write('gemini auth status\n');
  }
  
  async generate(prompt) {
    return new Promise((resolve, reject) => {
      let output = '';
      let isGenerating = false;
      
      const onData = (data) => {
        if (isGenerating) {
          output += data;
          // 檢測生成結束
          if (data.includes('---END---') || data.includes('$')) {
            this.terminal.off('data', onData);
            resolve(output);
          }
        }
        // 檢測是否開始生成
        if (data.includes('Generating specification')) {
          isGenerating = true;
        }
      };
      
      this.terminal.on('data', onData);
      this.terminal.write(`gemini generate --prompt "${prompt}"\n`);
      
      // 超時處理
      setTimeout(() => {
        this.terminal.off('data', onData);
        reject(new Error('Generation timeout'));
      }, 60000);
    });
  }
}

const geminiService = new GeminiCLIService();
````

### Phase 3: 前端調整（顯示認證狀態）

````javascript
// frontend/src/components/AuthStatus.jsx
import React, { useState, useEffect } from 'react';
import api from '../services/api';

function AuthStatus() {
  const [authStatus, setAuthStatus] = useState('checking');
  
  useEffect(() => {
    checkAuthStatus();
  }, []);
  
  const checkAuthStatus = async () => {
    try {
      const response = await api.get('/api/gemini/auth-status');
      setAuthStatus(response.data.authenticated ? 'authenticated' : 'not-authenticated');
    } catch (error) {
      setAuthStatus('error');
    }
  };
  
  if (authStatus === 'not-authenticated') {
    return (
      <div className="auth-warning">
        <p>⚠️ Gemini CLI 未授權</p>
        <p>請在終端機執行: <code>gemini auth login</code></p>
      </div>
    );
  }
  
  return null;
}
````

### Phase 4: 新增授權檢查 API

````javascript
// backend/server.js - 新增授權狀態端點
app.get('/api/gemini/auth-status', async (req, res) => {
  try {
    const authCheck = await new Promise((resolve) => {
      exec('gemini auth status', (error, stdout, stderr) => {
        if (error) {
          resolve({ authenticated: false, error: stderr });
        } else {
          const isAuthenticated = stdout.includes('Authenticated') || 
                                 stdout.includes('logged in');
          resolve({ authenticated: isAuthenticated, output: stdout });
        }
      });
    });
    
    res.json(authCheck);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check auth status' });
  }
});
````

### Phase 5: 更新啟動腳本

````bash
#!/bin/bash
# scripts/start-with-auth.sh

echo "🔐 檢查 Gemini CLI 授權狀態..."
if ! gemini auth status | grep -q "Authenticated"; then
  echo "❌ Gemini CLI 未授權"
  echo "請執行以下命令進行授權："
  echo "  gemini auth login"
  echo ""
  echo "授權完成後，請重新執行此腳本"
  exit 1
fi

echo "✅ Gemini CLI 已授權"
echo "🚀 啟動應用程式..."

# 啟動後端（保留使用者環境）
cd backend && npm run dev &
BACKEND_PID=$!

# 啟動前端
cd frontend && npm run dev &
FRONTEND_PID=$!

echo "✅ 應用程式已啟動"
echo "   前端: http://localhost:3000"
echo "   後端: http://localhost:3002"

# 等待中斷信號
trap "kill $BACKEND_PID $FRONTEND_PID" INT TERM
wait
````

### Phase 6: 更新 CLAUDE.md

````markdown
### Prerequisites & OAuth Configuration
- **Gemini CLI** 使用 Google OAuth 認證
  ```bash
  # 安裝 Gemini CLI
  npm install -g @google/gemini-cli
  
  # 使用 Google 帳號登入（重要！）
  gemini auth login
  
  # 確認授權狀態
  gemini auth status
  ```

### OAuth 整合注意事項
- Gemini CLI 使用 OAuth 而非 API key
- 必須在執行 Node.js 的相同使用者環境下完成授權
- 授權 token 儲存在使用者的 home 目錄
- 如果遇到授權問題，請確認：
  1. 使用相同的使用者帳號執行 `gemini auth login` 和啟動服務器
  2. 不要使用 sudo 或不同的使用者權限
  3. 確保 HOME 環境變數正確設置
````

## 🚀 實施步驟

1. **立即執行 Phase 1 診斷**，確認授權狀態
2. **選擇 Phase 2 的方案 A**（較簡單），先測試是否可行
3. **如果方案 A 失敗**，再實施方案 B（偽終端）
4. **更新前端**加入授權狀態提示
5. **更新啟動腳本**確保授權檢查
6. **更新文檔**說明 OAuth 使用方式

## ⚠️ 關鍵注意事項

- **不要使用 sudo** 執行 Node.js 服務器
- **確保環境一致性**：授權和執行必須是同一使用者
- **保留 shell 環境**：使用 `shell: true` 選項
- **處理授權過期**：token 可能會過期，需要重新登入