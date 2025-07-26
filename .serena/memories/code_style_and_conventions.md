## 代碼風格與命名慣例

### 前端 (frontend/)
- 使用 ES2020+ 語法，模組化 (type: module)
- React 函式型元件，檔名/元件名採 PascalCase
- hooks 以 use 開頭 (如 useKeyboardShortcuts)
- CSS Modules 或 Tailwind，樣式檔案與元件同名
- ESLint recommended + react-hooks + react-refresh
- 變數/函式：camelCase
- 常數：全大寫底線分隔 (如 API_BASE)
- 明確型別 (如有 TypeScript 則加強)

### 後端 (backend/)
- ES modules (import/export)
- 檔案/類別/函式：camelCase
- 常數：全大寫底線分隔
- API 路徑採 RESTful 命名
- 中介軟體、驗證、錯誤處理分層
- 日誌、錯誤、驗證訊息結構化

### 文件/註解
- 重要模組/函式皆有 JSDoc 或區塊註解
- README/CLAUDE.md/plan.md 詳細說明架構與流程

### 其他
- 前後端皆強制 lint (eslint)
- 建議使用 Prettier (如有)
- 測試/監控腳本皆有明確說明與顏色提示