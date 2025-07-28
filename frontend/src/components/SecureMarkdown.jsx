/**
 * 安全的 Markdown 渲染組件
 * 防止 XSS 攻擊並安全地渲染用戶生成的內容
 */

import React from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * 安全的 Markdown 渲染器配置
 */
const SECURE_CONFIG = {
  // DOMPurify 配置
  domPurify: {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'strong', 'em', 'u', 'del', 's',
      'code', 'pre', 'blockquote',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'alt', 'src',
      'class', 'id',
      'target', 'rel'
    ],
    FORBID_TAGS: [
      'script', 'object', 'embed', 'link', 'style',
      'iframe', 'frame', 'frameset', 'noframes',
      'meta', 'base', 'form', 'input', 'textarea',
      'button', 'select', 'option'
    ],
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover',
      'onfocus', 'onblur', 'onkeydown', 'onkeyup',
      'onsubmit', 'onreset', 'onchange', 'onselect',
      'style' // 禁止內聯樣式
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_SCRIPT: true,
    USE_PROFILES: { html: true }
  },
  
  // Marked 配置
  marked: {
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
    sanitize: false, // 我們使用 DOMPurify 進行消毒
    smartLists: true,
    smartypants: false,
    xhtml: false
  }
};

/**
 * 安全地處理連結
 * @param {string} href - 連結地址
 * @returns {object} - 安全的連結屬性
 */
function secureLinkHandler(href) {
  if (!href) return {};
  
  // 只允許 http/https 連結和 mailto
  const allowedProtocols = /^(https?:|mailto:)/i;
  
  if (!allowedProtocols.test(href)) {
    return { href: '#', title: '不安全的連結已被移除' };
  }
  
  return {
    href: href,
    target: '_blank',
    rel: 'noopener noreferrer'
  };
}

/**
 * 自定義 Marked 渲染器
 */
const secureRenderer = new marked.Renderer();

// 安全的連結渲染
secureRenderer.link = function(href, title, text) {
  const linkAttrs = secureLinkHandler(href);
  const titleAttr = title ? ` title="${DOMPurify.sanitize(title)}"` : '';
  const targetAttr = linkAttrs.target ? ` target="${linkAttrs.target}"` : '';
  const relAttr = linkAttrs.rel ? ` rel="${linkAttrs.rel}"` : '';
  
  return `<a href="${linkAttrs.href}"${titleAttr}${targetAttr}${relAttr}>${text}</a>`;
};

// 安全的圖片渲染
secureRenderer.image = function(href, title, text) {
  if (!href) return '';
  
  // 只允許 http/https 圖片
  if (!/^https?:/i.test(href)) {
    return `<span class="removed-image">[圖片已移除：不安全的來源]</span>`;
  }
  
  const titleAttr = title ? ` title="${DOMPurify.sanitize(title)}"` : '';
  const altAttr = text ? ` alt="${DOMPurify.sanitize(text)}"` : ' alt=""';
  
  return `<img src="${href}"${altAttr}${titleAttr} loading="lazy" style="max-width: 100%; height: auto;">`;
};

// 安全的程式碼塊渲染
secureRenderer.code = function(code, infostring, escaped) {
  const lang = (infostring || '').match(/\S*/)[0];
  const langClass = lang ? ` class="language-${DOMPurify.sanitize(lang)}"` : '';
  
  return `<pre><code${langClass}>${DOMPurify.sanitize(code)}</code></pre>`;
};

// 設定 Marked 選項
marked.setOptions({
  ...SECURE_CONFIG.marked,
  renderer: secureRenderer
});

/**
 * 安全的 Markdown 組件
 * @param {object} props - 組件屬性
 * @param {string} props.content - 要渲染的 Markdown 內容
 * @param {string} props.className - CSS 類名
 * @param {object} props.style - 內聯樣式
 * @param {boolean} props.allowHtml - 是否允許 HTML（預設為 false）
 */
export function SecureMarkdown({ 
  content = '', 
  className = 'secure-markdown',
  style = {},
  allowHtml = false,
  ...props 
}) {
  if (!content || typeof content !== 'string') {
    return <div className={className} style={style}>無內容可顯示</div>;
  }

  try {
    // 第一步：使用 Marked 轉換 Markdown 為 HTML
    let html = marked(content);
    
    // 第二步：使用 DOMPurify 消毒 HTML
    const sanitizedHtml = DOMPurify.sanitize(html, {
      ...SECURE_CONFIG.domPurify,
      // 如果不允許 HTML，則更嚴格的設定
      ...(allowHtml ? {} : {
        ALLOWED_TAGS: SECURE_CONFIG.domPurify.ALLOWED_TAGS.filter(tag => 
          !['div', 'span', 'img'].includes(tag)
        )
      })
    });

    return (
      <div 
        className={className}
        style={{
          lineHeight: '1.6',
          color: '#333',
          ...style
        }}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        {...props}
      />
    );
  } catch (error) {
    console.error('Markdown 渲染錯誤:', error);
    return (
      <div className={className} style={style}>
        <p style={{ color: '#d32f2f' }}>
          ⚠️ 內容渲染失敗，請檢查格式
        </p>
      </div>
    );
  }
}

/**
 * 簡化版安全文字渲染器（用於預覽等場景）
 * @param {object} props - 組件屬性
 * @param {string} props.content - 要渲染的文字內容
 * @param {number} props.maxLength - 最大長度（可選）
 */
export function SecureText({ content = '', maxLength = null, className = 'secure-text', ...props }) {
  if (!content || typeof content !== 'string') {
    return <span className={className}>無內容</span>;
  }

  // 基本文字消毒
  let sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });

  // 長度限制
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }

  return (
    <span className={className} {...props}>
      {sanitized}
    </span>
  );
}

/**
 * 安全的預覽組件（用於歷史記錄等）
 * @param {object} props - 組件屬性
 * @param {string} props.content - 要預覽的內容
 * @param {number} props.maxLength - 最大預覽長度
 */
export function SecurePreview({ content = '', maxLength = 200, className = 'secure-preview', ...props }) {
  if (!content) {
    return <div className={className}>無預覽內容</div>;
  }

  // 先移除 Markdown 語法，只保留純文字
  const plainText = content
    .replace(/#{1,6}\s+/g, '') // 移除標題標記
    .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗體標記
    .replace(/\*(.*?)\*/g, '$1') // 移除斜體標記
    .replace(/```[\s\S]*?```/g, '[程式碼區塊]') // 替換程式碼區塊
    .replace(/`([^`]+)`/g, '$1') // 移除行內程式碼標記
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除連結，保留文字
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[圖片: $1]') // 替換圖片
    .replace(/\n+/g, ' ') // 將換行替換為空格
    .trim();

  // 文字消毒和長度限制
  let sanitized = DOMPurify.sanitize(plainText, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }

  return (
    <div className={className} style={{ fontSize: '0.9em', color: '#666' }} {...props}>
      {sanitized || '無預覽內容'}
    </div>
  );
}

// 預設導出
export default SecureMarkdown;