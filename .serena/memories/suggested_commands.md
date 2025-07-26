## 開發常用指令 (建議收錄於 suggested_commands.md)

### 安裝與初始化
- `./scripts/install.sh`：一鍵安裝依賴與初始化資料庫
- `npm run setup:db`：初始化資料庫

### 啟動/開發
- `./scripts/start.sh` 或 `npm start`：一鍵啟動前後端 (production/dev)
- `npm run dev`：同時啟動前後端 (開發模式)
- `npm run dev:frontend`：啟動前端 (Vite, port 3000)
- `npm run dev:backend`：啟動後端 (Express, port 3001)

### 建置/部署
- `npm run build:frontend`：前端建置

### 測試/驗證/監控
- `node backend/test-api.js`：API 測試
- `node backend/performance-monitor.js`：效能監控
- `node backend/validate-deployment.js`：部署驗證

### 其他
- `npm run lint` (前端)：ESLint 檢查
- `npm run preview` (前端)：預覽建置後前端

### 系統工具 (macOS)
- `ls`, `cd`, `grep`, `find`, `cat`, `open` 等
- `node -v`, `npm -v`：檢查版本
- `gemini`：Gemini CLI (需安裝)

### 重要提醒
- Node.js 18+、npm 9+、Gemini CLI、Turso DB 必須安裝
- .env 設定資料庫與 CORS 參數