import { useState, useEffect, useRef } from 'react';
import './AccessibilityHelper.css';

/**
 * Screen Reader Announcer Component
 * Provides live region announcements for screen readers
 */
export const ScreenReaderAnnouncer = () => {
  const [announcement, setAnnouncement] = useState('');
  const [priority, setPriority] = useState('polite');

  // Global function to make announcements
  useEffect(() => {
    window.announceToScreenReader = (message, urgency = 'polite') => {
      setAnnouncement(''); // Clear previous announcement
      setTimeout(() => {
        setPriority(urgency);
        setAnnouncement(message);
      }, 100);
    };

    return () => {
      delete window.announceToScreenReader;
    };
  }, []);

  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className="screen-reader-only"
    >
      {announcement}
    </div>
  );
};

/**
 * Skip Links Component
 * Provides navigation shortcuts for keyboard users
 */
export const SkipLinks = () => {
  const skipLinks = [
    { href: '#main-content', label: 'Skip to main content' },
    { href: '#idea-input', label: 'Skip to idea input' },
    { href: '#history-panel', label: 'Skip to history panel' },
    { href: '#specification-preview', label: 'Skip to specification preview' },
  ];

  return (
    <div className="skip-links">
      {skipLinks.map((link, index) => (
        <a
          key={index}
          href={link.href}
          className="skip-links__link"
          onClick={(e) => {
            e.preventDefault();
            const target = document.querySelector(link.href);
            if (target) {
              target.focus();
              target.scrollIntoView({ behavior: 'smooth' });
              window.announceToScreenReader(`Navigated to ${link.label}`);
            }
          }}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
};

/**
 * Focus Manager Hook
 * Manages focus for keyboard navigation and accessibility
 */
export const useFocusManagement = () => {
  const focusHistory = useRef([]);
  const currentFocusIndex = useRef(-1);

  const saveFocus = () => {
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body) {
      focusHistory.current.push(activeElement);
      currentFocusIndex.current = focusHistory.current.length - 1;
    }
  };

  const restoreFocus = () => {
    const lastFocused = focusHistory.current[currentFocusIndex.current];
    if (lastFocused && document.contains(lastFocused)) {
      lastFocused.focus();
      return true;
    }
    return false;
  };

  const focusElement = (selector) => {
    const element = document.querySelector(selector);
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
    return false;
  };

  const trapFocus = (containerSelector) => {
    const container = document.querySelector(containerSelector);
    if (!container) return () => {};

    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    
    // Focus first element
    if (firstElement) {
      firstElement.focus();
    }

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  };

  return {
    saveFocus,
    restoreFocus,
    focusElement,
    trapFocus
  };
};

/**
 * Accessibility Settings Component
 * Provides user controls for accessibility preferences
 */
export const AccessibilitySettings = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState({
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: window.matchMedia('(prefers-contrast: high)').matches,
    largeText: false,
    screenReaderOptimized: false,
    keyboardNavigation: true
  });

  const { trapFocus } = useFocusManagement();

  useEffect(() => {
    if (isOpen) {
      const cleanup = trapFocus('.accessibility-settings');
      return cleanup;
    }
  }, [isOpen, trapFocus]);

  useEffect(() => {
    // Apply settings to document
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
    document.documentElement.classList.toggle('large-text', settings.largeText);
    document.documentElement.classList.toggle('screen-reader-optimized', settings.screenReaderOptimized);
    document.documentElement.classList.toggle('keyboard-navigation', settings.keyboardNavigation);
  }, [settings]);

  const updateSetting = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    
    window.announceToScreenReader(
      `${key.replace(/([A-Z])/g, ' $1').toLowerCase()} ${value ? 'enabled' : 'disabled'}`
    );
  };

  if (!isOpen) return null;

  return (
    <div className="accessibility-settings" role="dialog" aria-labelledby="a11y-title">
      <div className="accessibility-settings__content">
        <div className="accessibility-settings__header">
          <h2 id="a11y-title">Accessibility Settings</h2>
          <button
            onClick={onClose}
            className="accessibility-settings__close"
            aria-label="Close accessibility settings"
          >
            ×
          </button>
        </div>

        <div className="accessibility-settings__options">
          <div className="accessibility-settings__option">
            <label htmlFor="reduced-motion">
              <input
                id="reduced-motion"
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(e) => updateSetting('reducedMotion', e.target.checked)}
              />
              <span>Reduce motion and animations</span>
            </label>
            <p className="accessibility-settings__description">
              Minimizes animations and transitions for users sensitive to motion
            </p>
          </div>

          <div className="accessibility-settings__option">
            <label htmlFor="high-contrast">
              <input
                id="high-contrast"
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) => updateSetting('highContrast', e.target.checked)}
              />
              <span>High contrast mode</span>
            </label>
            <p className="accessibility-settings__description">
              Increases contrast for better visibility
            </p>
          </div>

          <div className="accessibility-settings__option">
            <label htmlFor="large-text">
              <input
                id="large-text"
                type="checkbox"
                checked={settings.largeText}
                onChange={(e) => updateSetting('largeText', e.target.checked)}
              />
              <span>Large text</span>
            </label>
            <p className="accessibility-settings__description">
              Increases text size for better readability
            </p>
          </div>

          <div className="accessibility-settings__option">
            <label htmlFor="screen-reader-optimized">
              <input
                id="screen-reader-optimized"
                type="checkbox"
                checked={settings.screenReaderOptimized}
                onChange={(e) => updateSetting('screenReaderOptimized', e.target.checked)}
              />
              <span>Screen reader optimizations</span>
            </label>
            <p className="accessibility-settings__description">
              Enhances experience for screen reader users
            </p>
          </div>

          <div className="accessibility-settings__option">
            <label htmlFor="keyboard-navigation">
              <input
                id="keyboard-navigation"
                type="checkbox"
                checked={settings.keyboardNavigation}
                onChange={(e) => updateSetting('keyboardNavigation', e.target.checked)}
              />
              <span>Enhanced keyboard navigation</span>
            </label>
            <p className="accessibility-settings__description">
              Improves keyboard-only navigation experience
            </p>
          </div>
        </div>

        <div className="accessibility-settings__footer">
          <button
            onClick={() => {
              setSettings({
                reducedMotion: false,
                highContrast: false,
                largeText: false,
                screenReaderOptimized: false,
                keyboardNavigation: true
              });
              window.announceToScreenReader('Accessibility settings reset to default');
            }}
            className="accessibility-settings__reset"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Live Region Component
 * For announcing dynamic content changes
 */
export const LiveRegion = ({ message, priority = 'polite', className = '' }) => {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className={`live-region ${className}`}
    >
      {message}
    </div>
  );
};

/**
 * Loading Announcement Component
 * Specifically for loading states
 */
export const LoadingAnnouncement = ({ isLoading, message = 'Loading' }) => {
  if (!isLoading) return null;

  return (
    <LiveRegion
      message={message}
      priority="assertive"
      className="screen-reader-only"
    />
  );
};