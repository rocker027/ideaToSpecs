// Test script for generateIntelligentFallbackSpec function

function generateIntelligentFallbackSpec(idea) {
  const timestamp = new Date().toLocaleString('zh-TW');
  
  // Analyze the idea to determine category and suggest relevant features
  const ideaLower = idea.toLowerCase();
  let category = 'general';
  let techStack = ['JavaScript', 'HTML/CSS', 'Node.js', 'Database'];
  let features = ['基礎功能', '用戶管理', '數據處理', '界面設計'];
  
  // Smart categorization based on keywords
  if (ideaLower.includes('mobile') || ideaLower.includes('app') || ideaLower.includes('手機') || ideaLower.includes('移動')) {
    category = 'mobile';
    techStack = ['React Native', 'Flutter', 'iOS/Android', 'Firebase'];
    features = ['移動端UI', '推送通知', '離線功能', '設備集成'];
  } else if (ideaLower.includes('web') || ideaLower.includes('網站') || ideaLower.includes('website') || ideaLower.includes('todo') || ideaLower.includes('管理')) {
    category = 'web';
    techStack = ['React/Vue', 'Node.js', 'Express', 'MongoDB/PostgreSQL'];
    features = ['響應式設計', '即時更新', '用戶認證', '數據同步'];
  } else if (ideaLower.includes('ai') || ideaLower.includes('machine learning') || ideaLower.includes('人工智能')) {
    category = 'ai';
    techStack = ['Python', 'TensorFlow/PyTorch', 'FastAPI', 'Docker'];
    features = ['機器學習模型', '數據預處理', 'API接口', '模型部署'];
  } else if (ideaLower.includes('游戲') || ideaLower.includes('game') || ideaLower.includes('遊戲')) {
    category = 'game';
    techStack = ['Unity/Unreal', 'C#/C++', 'WebGL', 'Socket.io'];
    features = ['遊戲邏輯', '多人對戰', '成就系統', '虛擬經濟'];
  }
  
  return `# 📋 產品規格文檔：${idea}

*生成時間：${timestamp}*
*狀態：智能生成版本 (如需更詳細的規格，建議使用Gemini CLI)*

## 🎯 項目概述

**項目名稱**: ${idea}
**項目類型**: ${category === 'mobile' ? '移動應用程式' : 
              category === 'web' ? '網頁應用程式' : 
              category === 'ai' ? 'AI智能系統' :
              category === 'game' ? '遊戲應用程式' : '綜合應用程式'}
**開發優先級**: 高

### 目標願景
基於「${idea}」的核心概念，打造一個用戶友好、功能完整、技術先進的${category === 'mobile' ? '移動端' : category === 'web' ? '網頁端' : ''}解決方案。

## ⚡ 核心功能需求

### 主要功能
${features.map(feature => `- 🔹 ${feature}`).join('\n')}
- 🔹 用戶界面設計
- 🔹 數據管理
- 🔹 安全認證
- 🔹 效能優化

### 進階功能
- 📊 數據分析和報表
- 🔄 自動備份和同步
- 🌐 多語言支持
- 📱 跨平台兼容性

## 🛠️ 技術規格

### 推薦技術棧
${techStack.map(tech => `- **${tech}**`).join('\n')}

### 系統架構
- **前端**: 現代化框架，響應式設計
- **後端**: RESTful API，微服務架構
- **數據庫**: 關係型/非關係型數據庫
- **部署**: 雲端服務，容器化部署

### 安全要求
- 🔒 數據加密 (傳輸和存儲)
- 🔐 身份認證和授權
- 🛡️ 輸入驗證和防護
- 📝 審計日誌

## 🎨 用戶界面設計

### 設計原則
- **簡潔性**: 直觀易用的界面
- **一致性**: 統一的設計語言
- **響應性**: 適配各種設備尺寸
- **可訪問性**: 符合無障礙設計標準

### 核心頁面/功能
- 🏠 主頁/儀表板
- ⚙️ 設置和配置
- 👤 用戶管理
- 📊 數據展示

## 🗓️ 開發路線圖

### Phase 1: 基礎建設 (2-3週)
- [x] 項目初始化和環境配置
- [x] 基礎架構搭建
- [x] 核心功能原型
- [x] 基本UI框架

### Phase 2: 核心功能 (3-4週)
- [ ] 主要功能模塊開發
- [ ] 數據庫設計和實現
- [ ] API接口開發
- [ ] 前端功能集成

### Phase 3: 完善優化 (2-3週)
- [ ] 功能測試和調試
- [ ] 性能優化
- [ ] 安全加固
- [ ] 用戶體驗優化

### Phase 4: 部署上線 (1-2週)
- [ ] 生產環境部署
- [ ] 監控和日誌系統
- [ ] 文檔完善
- [ ] 用戶培訓

## 📈 成功指標

### 技術指標
- ⚡ 頁面加載時間 < 2秒
- 🎯 系統可用性 > 99.5%
- 📱 移動端兼容性 100%
- 🔒 安全漏洞 = 0

### 業務指標
- 👥 用戶滿意度 > 4.5/5
- 📊 日活躍用戶增長
- 💰 成本效益比優化
- 🚀 功能採用率 > 80%

## 🔧 維護和支持

### 持續維護
- 🔄 定期更新和補丁
- 📊 性能監控和優化
- 🐛 問題追蹤和修復
- 📚 文檔維護

### 用戶支持
- 📞 技術支持服務
- 📖 用戶手冊和教程
- 💬 社區支持
- 🎓 培訓資源

---

**注意**: 此規格文檔是基於「${idea}」自動生成的智能模板。實際開發時請根據具體需求進行詳細規劃和調整。`;
}

// Test the function
try {
  console.log('Testing generateIntelligentFallbackSpec function...');
  const result = generateIntelligentFallbackSpec('製作一個todo list');
  console.log('✅ Function executed successfully');
  console.log('Result length:', result.length);
  console.log('First 200 characters:', result.substring(0, 200));
} catch (error) {
  console.error('❌ Function failed:', error);
  console.error('Error details:', error.message);
  console.error('Stack trace:', error.stack);
}