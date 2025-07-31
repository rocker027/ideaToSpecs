import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { resources } from './resources';

const i18nConfig = {
  // 預設語言設定為中文
  fallbackLng: 'zh',
  lng: 'zh', // 強制預設為中文
  
  // 語言檢測設定
  detection: {
    // 檢測順序：localStorage -> navigator -> fallback
    order: ['localStorage', 'navigator'],
    
    // localStorage 設定
    lookupLocalStorage: 'i18nextLng',
    
    // 快取用戶選擇
    caches: ['localStorage'],
    
    // 不要自動設定文檔語言
    convertDetectedLanguage: (lng) => {
      // 只支援 zh 和 en，其他都回到中文
      return ['zh', 'en'].includes(lng) ? lng : 'zh';
    }
  },
  
  // 語言資源
  resources,
  
  // 命名空間設定
  defaultNS: 'translation',
  ns: ['translation'],
  
  // 插值設定
  interpolation: {
    escapeValue: false, // React 已經防止 XSS
  },
  
  // 開發設定
  debug: process.env.NODE_ENV === 'development',
  
  // React 設定
  react: {
    useSuspense: false
  }
};

// 初始化 i18next
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init(i18nConfig);

export default i18n;