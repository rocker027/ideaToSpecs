import zh from './locales/zh.json';
import en from './locales/en.json';

export const resources = {
  zh: {
    translation: zh
  },
  en: {
    translation: en
  }
};

export const availableLanguages = [
  { code: 'zh', name: '中文', flag: '🇹🇼' },
  { code: 'en', name: 'English', flag: '🇺🇸' }
];

export default resources;