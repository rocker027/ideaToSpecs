## 完成任務後應執行事項

1. **Lint/格式化**
   - 前端：`npm run lint`（ESLint）
   - 建議加 Prettier 格式化（如有）
2. **單元/整合測試**
   - 後端：`node backend/test-api.js`（API 測試）
   - 效能/壓力測試：`node backend/performance-monitor.js`
   - 部署驗證：`node backend/validate-deployment.js`
3. **手動驗證**
   - 前端功能、UI/UX、WebSocket 即時互動
   - Markdown 下載、複製、歷史查詢
4. **日誌/監控**
   - 檢查 Pino/morgan 日誌輸出
   - 監控 WebSocket 連線與狀態
5. **環境/部署檢查**
   - .env 設定正確（資料庫、CORS、PORT）
   - Gemini CLI、Turso DB 正常運作
6. **文件更新**
   - CLAUDE.md、plan.md、README.md 補充新功能/流程

### 推薦流程
- 開發 → Lint/測試 → 手動驗證 → 日誌/監控 → 文件 → 部署/驗證

### 其他
- 若有新依賴/腳本，更新 package.json/scripts
- 若有新 API，補充 API 文件
- 若有架構/流程重大變更，更新 CLAUDE.md/plan.md