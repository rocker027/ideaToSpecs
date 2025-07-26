## 專案目的
本專案為 Idea-to-Specifications Generator，一個本地端 Web 應用，能將使用者輸入的想法自動轉換為產品開發規格，並整合 Gemini CLI 進行 AI 驅動的規格產生。前端採用 React，後端為 Node.js/Express，資料庫使用 Turso (libSQL/SQLite)。

## 架構概覽
- Monorepo 結構，含 frontend (React)、backend (Express)、database (Turso/SQLite)、scripts (啟動/部署腳本)
- 前端：React 18/19 + Vite + Axios + React hooks
- 後端：Node.js 18+、Express.js、ES modules、Socket.IO、Pino、Joi、helmet、CORS、Turso
- 外部：Gemini CLI (AI 規格產生)

## 主要功能
- 使用 Gemini CLI 產生規格
- 即時規格產生進度 (WebSocket)
- 歷史紀錄查詢、下載、刪除
- Markdown 下載、複製
- 完整 API 與資料庫設計

## 重要檔案/目錄
- frontend/：前端 React 專案
- backend/：Express API server
- database/：Turso/SQLite DB
- scripts/：安裝、啟動腳本
- CLAUDE.md、plan.md：開發規劃與說明

## 主要開發流程
1. 安裝依賴與初始化 (scripts/install.sh)
2. 啟動前後端 (scripts/start.sh 或 npm start)
3. 前端開發 (Vite, React)
4. 後端開發 (Express, API, WebSocket)
5. 整合 Gemini CLI 與資料庫
6. 測試、效能監控、部署驗證

## 參考文件
- CLAUDE.md：完整開發指引
- backend/README.md：API 與後端功能說明
- INTEGRATION_FEATURES.md：進階整合特性
- plan.md：開發計畫與技術細節

## 系統需求
- macOS (Darwin)
- Node.js 18+
- Gemini CLI
- Turso/SQLite
- npm/yarn