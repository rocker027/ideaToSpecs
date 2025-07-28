# Idea-to-Specs Generator

> 將創意想法轉化為產品開發規格的生產級本地網頁應用程式

![版本](https://img.shields.io/badge/版本-1.0.0-green)
![Node.js](https://img.shields.io/badge/Node.js-18+-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

## 專案簡介

Idea-to-Specs Generator 是一個功能完整的本地網頁應用程式，透過整合 Gemini CLI 將使用者的創意想法轉換為詳細的產品開發規格文件。該應用程式採用現代化的 React 前端搭配強大的 Express.js 後端，支援即時進度追蹤和 WebSocket 通訊，並使用 Turso 資料庫進行資料持久化。

**專案狀態**：已完成全部 5 個開發階段，生產部署就緒，100% 驗證測試通過。

## ✨ 功能特色

- 🚀 **智慧規格生成**：透過 Gemini CLI 整合，將簡單想法轉化為完整產品規格
- 📱 **響應式設計**：支援桌面和行動裝置的現代化使用者介面
- ⚡ **即時進度追蹤**：WebSocket 支援的即時狀態更新和進度顯示
- 📊 **歷史記錄管理**：分頁瀏覽、搜尋和管理已生成的規格文件
- 🔒 **安全性優先**：完整的安全中介軟體、輸入驗證和速率限制
- 📈 **效能監控**：內建效能儀表板和系統健康監控
- 💾 **離線優先**：本地 SQLite 資料庫支援，可選 Turso 雲端同步
- 🔄 **錯誤恢復**：自動重試機制和優雅的錯誤處理

## 🛠 技術堆疊

### 前端 (Frontend)
- **React 19**：現代化函式組件和 Hooks
- **Vite**：快速建置工具和開發伺服器
- **Socket.IO Client**：即時 WebSocket 通訊
- **React Markdown**：Markdown 渲染和語法高亮
- **Axios**：HTTP 客戶端和 API 整合
- **響應式 CSS**：行動優先的設計系統

### 後端 (Backend)
- **Express.js**：RESTful API 伺服器
- **Socket.IO**：WebSocket 伺服器和即時通訊
- **Pino**：結構化日誌記錄
- **Helmet.js**：安全標頭和防護
- **Express Rate Limit**：分層速率限制
- **Joi**：資料驗證和清理

### 資料庫 (Database)
- **Turso (libSQL)**：主要雲端資料庫
- **SQLite**：本地備援資料庫
- **效能最佳化**：索引優化和連線池管理

### 外部整合
- **Gemini CLI**：Google AI 服務整合
- **OAuth 認證**：Google 帳號登入系統

## 📋 系統需求

### 必要條件
- **Node.js 18+** (已測試 18.x, 20.x 版本)
- **npm 9+** (支援 workspace 功能)
- **現代化瀏覽器** (Chrome 88+, Firefox 78+, Safari 14+)

### Gemini CLI 設定
```bash
# 安裝 Gemini CLI
npm install -g @google/gemini-cli

# 使用 Google 帳號登入（重要！）
gemini auth login

# 確認授權狀態
gemini auth status
```

> ⚠️ **重要提醒**：Gemini CLI 使用 OAuth 而非 API 金鑰。請確保在執行 Node.js 的相同使用者環境下完成授權，且不要使用 sudo 或不同的使用者權限執行命令。

## 🚀 安裝與設定

### 快速開始

1. **複製專案**
```bash
git clone https://github.com/username/idea-to-specs.git
cd idea-to-specs
```

2. **生產環境安裝**
```bash
# 完整安裝與驗證
./scripts/install.sh

# 或手動安裝
npm run setup
```

3. **啟動應用程式**
```bash
# 生產模式啟動
./scripts/start.sh

# 或開發模式
npm run dev
```

4. **開啟瀏覽器**
- 前端：http://localhost:3000
- 後端 API：http://localhost:3001
- 效能監控：http://localhost:3001/status

### 環境變數設定

建立 `.env` 檔案（可選）：
```bash
# 伺服器設定
PORT=3001
NODE_ENV=production

# 資料庫設定（可選 - 預設使用本地 SQLite）
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# 效能設定
REQUEST_TIMEOUT=120000
MAX_RETRIES=2
RATE_LIMIT_WINDOW=900000  # 15 分鐘
RATE_LIMIT_MAX=100
```

## 📖 使用指南

### 基本操作流程

1. **輸入創意想法**
   - 在主頁面的文字框中輸入您的產品想法
   - 支援中文輸入和多行文字
   - 使用 Ctrl+Enter 快速提交

2. **即時進度追蹤**
   - 提交後可看到即時處理進度
   - WebSocket 連線狀態顯示
   - 自動錯誤重試機制

3. **查看生成結果**
   - Markdown 格式的規格文件
   - 複製到剪貼簿功能
   - 下載為 .md 檔案

4. **歷史記錄管理**
   - 分頁瀏覽歷史記錄
   - 關鍵字搜尋功能
   - 刪除確認對話框

### 鍵盤快捷鍵

- `Ctrl + Enter`：提交想法
- `Ctrl + C`：複製規格內容
- `Escape`：關閉對話框

## 🔌 API 文件

### RESTful API 端點

#### 生成規格
```http
POST /api/generate
Content-Type: application/json

{
  "userInput": "您的產品想法"
}
```

#### 取得歷史記錄
```http
GET /api/history?page=1&limit=20&search=關鍵字
```

#### 取得特定規格
```http
GET /api/spec/:id
```

#### 下載規格文件
```http
GET /api/download/:id
```

#### 系統健康檢查
```http
GET /api/health
```

#### Gemini CLI 狀態
```http
GET /api/gemini/health
```

### WebSocket 事件

```javascript
// 連線建立
socket.on('connect', () => {
  console.log('WebSocket 連線已建立');
});

// 訂閱工作進度
socket.emit('subscribe-job', { jobId: 'job-123' });

// 接收進度更新
socket.on('job-update', (update) => {
  console.log('狀態更新：', update.status);
});

// 取消訂閱
socket.emit('unsubscribe-job', { jobId: 'job-123' });
```

## 🏗 開發工作流程

### 開發環境指令

```bash
# 設定與安裝
npm run setup                 # 完整環境設定
npm run setup:db             # 初始化資料庫

# 開發伺服器
npm run dev                   # 同時啟動前後端 (前端:3000, 後端:3001)
npm run dev:frontend          # 僅啟動 React 開發伺服器
npm run dev:backend           # 僅啟動 Express 伺服器

# 建置與部署
npm run build                 # 建置前端生產版本
npm run start:production      # 生產環境部署
```

### 測試與驗證

```bash
# 後端 API 測試
npm test                      # 執行 14 項功能測試 + WebSocket 驗證
npm run test:load            # 並發請求負載測試
npm run test:examples        # 使用範例和文件測試

# 部署驗證
npm run validate             # 11 項驗證測試套件（需 100% 通過）

# 效能監控
npm run monitor              # 即時效能指標和系統健康監控
```

### 專案架構

```
idea-to-specs/
├── frontend/                 # React 19 前端應用程式
│   ├── src/
│   │   ├── components/      # React 組件
│   │   ├── hooks/           # 自定義 Hooks
│   │   ├── services/        # API 客戶端服務
│   │   └── styles/          # CSS 樣式
│   └── package.json
├── backend/                  # Express.js 後端 API
│   ├── server.js            # 主要伺服器檔案
│   ├── test-api.js          # API 測試套件
│   ├── validate-deployment.js # 部署驗證
│   └── package.json
├── database/                 # 資料庫相關檔案
│   └── local.db             # SQLite 本地資料庫
├── scripts/                  # 部署和維護腳本
│   ├── install.sh           # 安裝腳本
│   ├── start.sh             # 啟動腳本
│   └── setup-database.js    # 資料庫設定
└── package.json             # 根目錄工作空間設定
```

## 🏛 系統架構概覽

### 單倉庫 (Monorepo) 架構
- **根目錄**：npm workspaces 設定與並發執行腳本
- **前端**：React 19 應用程式，包含 Vite、Socket.IO 客戶端、完整 UI 組件
- **後端**：Express.js API 伺服器，具備 WebSocket 支援、結構化日誌、效能監控
- **資料庫**：增強的 SQLite/Turso 資料庫，含效能指標和健康日誌
- **腳本**：生產部署、安裝和資料庫設定腳本

### 即時通訊架構
```javascript
// 後端：工作進度廣播 (server.js:92)
const emitJobUpdate = (jobId, status, data = {}) => {
  io.to(`job-${jobId}`).emit('job-update', {
    jobId, status, timestamp: new Date().toISOString(), ...data
  });
};

// 前端：WebSocket 訂閱 (api.js)
socket.on('job-update', (update) => {
  // 處理即時進度更新
});
```

### 資料庫結構

```sql
-- 主要資料表
CREATE TABLE ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_input TEXT NOT NULL,
  generated_spec TEXT NOT NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processing_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 效能監控表
CREATE TABLE performance_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 效能最佳化索引
CREATE INDEX idx_ideas_created_at ON ideas(created_at DESC);
CREATE INDEX idx_ideas_status ON ideas(status);
CREATE INDEX idx_performance_created_at ON performance_metrics(created_at DESC);
```

## 🔒 安全性實作

### 生產環境安全功能
- **Helmet.js**：完整安全標頭（CSP、HSTS 等）
- **速率限制**：分層限制（一般 100 請求/15分鐘，生成 10 請求/5分鐘）
- **輸入驗證**：Joi 結構描述與清理和類型檢查
- **CORS 設定**：基於環境的來源限制
- **SQL 注入防護**：全面使用參數化查詢
- **錯誤資訊披露**：生產模式下限制錯誤詳細資訊

## 📊 效能監控

### 即時監控儀表板
- **即時指標**：可在 `/status` 端點查看 CPU、記憶體、回應時間
- **資料庫效能**：查詢時間、連線池狀態、維護日誌
- **API 分析**：請求率、錯誤率、各端點處理時間
- **系統健康**：運行時間、記憶體使用量、Gemini CLI 可用性

## 🤝 貢獻指南

### 開發標準

#### 後端開發標準
- **ES 模組**：整個程式碼庫使用一致的 import/export
- **安全優先**：參數化查詢、輸入驗證、安全標頭、速率限制
- **錯誤處理**：結構化錯誤回應與時間戳記、開發 vs 生產錯誤詳細資訊
- **效能**：資料庫索引、連線池、請求時間記錄、自動維護
- **日誌記錄**：使用 Pino 的結構化 JSON 日誌、請求/回應追蹤、效能指標

#### 前端開發模式
- **React 19**：函式組件與 Hooks、現代 React 模式
- **即時用戶體驗**：WebSocket 整合與輪詢備援、即時進度指示器
- **無障礙設計**：ARIA 標籤、鍵盤導航、螢幕閱讀器支援
- **響應式設計**：行動優先 CSS、彈性佈局、裝置最佳化
- **錯誤恢復**：優雅錯誤處理、自動重試、使用者友善錯誤訊息

### 提交準則

1. **程式碼品質**
   - 遵循 ESLint 規則
   - 編寫單元測試
   - 確保所有測試通過

2. **文件更新**
   - 更新相關 API 文件
   - 添加使用範例
   - 更新變更日誌

3. **測試覆蓋**
   - 新功能需包含測試
   - 執行完整測試套件
   - 通過部署驗證

### 問題回報

請在 GitHub Issues 中回報問題，並包含：
- 詳細的問題描述
- 重現步驟
- 系統環境資訊
- 錯誤日誌（如有）

## 📝 許可證

本專案採用 MIT 許可證 - 詳見 [LICENSE](LICENSE) 檔案。

## 🆘 故障排除

### 常見問題

#### Gemini CLI 授權問題
```bash
# 確認授權狀態
gemini auth status

# 重新登入
gemini auth login

# 確保環境變數正確
echo $HOME
```

#### 資料庫連線問題
```bash
# 檢查資料庫檔案權限
ls -la database/local.db

# 重新初始化資料庫
npm run setup:db
```

#### WebSocket 連線問題
- 檢查防火牆設定
- 確認埠號 3001 未被佔用
- 查看瀏覽器開發者工具的 Network 標籤

#### 效能問題
```bash
# 檢查系統資源使用
npm run monitor

# 清理資料庫
# SQLite VACUUM 會自動執行
```

### 日誌檔案位置
- **應用程式日誌**：控制台輸出
- **錯誤日誌**：`backend/logs/` (如果設定)
- **存取日誌**：使用 Morgan 中介軟體記錄

---

**專案維護者**：[您的名稱]  
**最後更新**：2024/07/28  
**專案版本**：v1.0.0

如有任何問題或建議，歡迎透過 Issues 或 Pull Requests 與我們聯繫！