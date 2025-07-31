import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { availableLanguages } from '../i18n/resources';
import './LanguageSwitch.css';

const LanguageSwitch = () => {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  
  const currentLanguage = availableLanguages.find(lang => lang.code === i18n.language) || availableLanguages[0];
  
  const handleLanguageChange = (languageCode) => {
    i18n.changeLanguage(languageCode);
    setIsOpen(false);
  };
  
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };
  
  return (
    <div className="language-switch">
      <button
        className="language-switch__trigger"
        onClick={toggleDropdown}
        aria-label={t('language.switch')}
        title={t('language.switch')}
      >
        <span className="language-switch__flag">{currentLanguage.flag}</span>
        <span className="language-switch__name">{currentLanguage.name}</span>
        <span className={`language-switch__arrow ${isOpen ? 'language-switch__arrow--open' : ''}`}>
          ▼
        </span>
      </button>
      
      {isOpen && (
        <div className="language-switch__dropdown">
          {availableLanguages.map((language) => (
            <button
              key={language.code}
              className={`language-switch__option ${
                language.code === i18n.language ? 'language-switch__option--active' : ''
              }`}
              onClick={() => handleLanguageChange(language.code)}
            >
              <span className="language-switch__option-flag">{language.flag}</span>
              <span className="language-switch__option-name">{language.name}</span>
            </button>
          ))}
        </div>
      )}
      
      {/* 點擊外部關閉下拉選單 */}
      {isOpen && (
        <div 
          className="language-switch__backdrop"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default LanguageSwitch;