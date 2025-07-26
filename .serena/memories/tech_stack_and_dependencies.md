## 技術棧與主要依賴

### 前端 (frontend/)
- React 18/19
- Vite (開發/建置工具)
- Axios (HTTP 請求)
- React hooks (useState, useEffect)
- CSS Modules 或 Tailwind CSS
- ESLint (含 react-hooks, react-refresh)
- socket.io-client

### 後端 (backend/)
- Node.js 18+
- Express.js (ESM)
- Socket.IO (WebSocket)
- Pino (結構化日誌)
- Joi, express-validator (輸入驗證)
- helmet, cors, express-rate-limit (安全)
- Turso (libSQL/SQLite)
- dotenv (環境變數)
- morgan, compression
- nodemon (開發)

### 其他
- Gemini CLI (AI 規格產生)
- concurrently (多進程啟動)

### 主要 scripts
- scripts/install.sh：安裝與初始化
- scripts/start.sh：一鍵啟動
- scripts/setup-database.js：資料庫初始化

### 主要 API
- POST /api/generate
- GET /api/history
- GET /api/download/:id
- DELETE /api/history/:id
- GET /api/gemini/health (健康檢查)

### 主要測試/監控工具
- backend/test-api.js：API 測試
- backend/performance-monitor.js：效能監控
- backend/validate-deployment.js：部署驗證

### 主要開發指令
- npm run dev:frontend / dev:backend
- npm run dev
- npm run build:frontend
- npm start
- npm run setup:db

### 主要設計模式/慣例
- 前端：函式型元件、React hooks、ESLint 標準
- 後端：中介軟體、結構化日誌、明確錯誤處理、WebSocket 實時通訊
- API/DB：明確 schema 驗證、結構化回應、分層設計