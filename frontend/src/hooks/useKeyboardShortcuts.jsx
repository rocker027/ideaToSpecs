import { useEffect, useCallback } from 'react';

/**
 * Hook for managing keyboard shortcuts
 * @param {Object} shortcuts - Object with key combinations as keys and callbacks as values
 * @param {Array} dependencies - Dependencies for useCallback optimization
 */
export const useKeyboardShortcuts = (shortcuts, dependencies = []) => {
  const handleKeyDown = useCallback((event) => {
    // Ignore shortcuts when user is typing in input/textarea elements
    if (
      event.target.tagName === 'INPUT' ||
      event.target.tagName === 'TEXTAREA' ||
      event.target.contentEditable === 'true'
    ) {
      // Allow specific shortcuts even in input fields
      const allowedInInputs = ['Escape'];
      if (!allowedInInputs.includes(event.key)) {
        return;
      }
    }

    // Build the key combination string
    const keyCombo = [];
    if (event.ctrlKey) keyCombo.push('Ctrl');
    if (event.metaKey) keyCombo.push('Cmd');
    if (event.altKey) keyCombo.push('Alt');
    if (event.shiftKey) keyCombo.push('Shift');
    keyCombo.push(event.key);

    const keyString = keyCombo.join('+');
    
    // Check if we have a handler for this key combination
    if (shortcuts[keyString]) {
      event.preventDefault();
      shortcuts[keyString](event);
    }
    
    // Also check for case-insensitive matches
    const keyStringLower = keyCombo.map(k => k.toLowerCase()).join('+');
    if (shortcuts[keyStringLower]) {
      event.preventDefault();
      shortcuts[keyStringLower](event);
    }
  }, [shortcuts, ...dependencies]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
};

/**
 * Hook for managing global keyboard shortcuts
 */
export const useGlobalKeyboardShortcuts = (callbacks) => {
  const shortcuts = {
    // Application shortcuts
    'Ctrl+/': callbacks.showHelp || (() => {}),
    'Cmd+/': callbacks.showHelp || (() => {}),
    'Escape': callbacks.closeModals || (() => {}),
    'F1': callbacks.showHelp || (() => {}),
    
    // Navigation shortcuts
    'Ctrl+1': () => callbacks.focusInput && callbacks.focusInput(),
    'Cmd+1': () => callbacks.focusInput && callbacks.focusInput(),
    'Ctrl+2': () => callbacks.focusHistory && callbacks.focusHistory(),
    'Cmd+2': () => callbacks.focusHistory && callbacks.focusHistory(),
    
    // Action shortcuts
    'Ctrl+Enter': callbacks.submitForm || (() => {}),
    'Cmd+Enter': callbacks.submitForm || (() => {}),
    'Ctrl+c': callbacks.copySpec || (() => {}),
    'Cmd+c': callbacks.copySpec || (() => {}),
    'Ctrl+d': callbacks.downloadSpec || (() => {}),
    'Cmd+d': callbacks.downloadSpec || (() => {}),
    
    // Accessibility shortcuts
    'Alt+a': callbacks.showAccessibilitySettings || (() => {}),
    'Alt+A': callbacks.showAccessibilitySettings || (() => {}),
    'Alt+1': () => callbacks.announceStatus && callbacks.announceStatus(),
    'Alt+2': () => callbacks.skipToMain && callbacks.skipToMain(),
  };

  useKeyboardShortcuts(shortcuts, [callbacks]);
};

/**
 * Utility function to format key combinations for display
 */
export const formatKeyCombo = (combo) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  return combo
    .replace('Ctrl', isMac ? '⌘' : 'Ctrl')
    .replace('Cmd', '⌘')
    .replace('Alt', isMac ? '⌥' : 'Alt')
    .replace('Shift', isMac ? '⇧' : 'Shift')
    .replace('Enter', '↵')
    .replace('Escape', 'Esc');
};

/**
 * Component to display keyboard shortcuts help
 */
export const KeyboardShortcutsHelp = ({ onClose }) => {
  const shortcuts = [
    { combo: 'Ctrl+Enter / Cmd+Enter', description: 'Generate specification' },
    { combo: 'Ctrl+C / Cmd+C', description: 'Copy current specification' },
    { combo: 'Ctrl+D / Cmd+D', description: 'Download current specification' },
    { combo: 'Ctrl+1 / Cmd+1', description: 'Focus input area' },
    { combo: 'Ctrl+2 / Cmd+2', description: 'Focus history panel' },
    { combo: 'Ctrl+/ / Cmd+/', description: 'Show this help' },
    { combo: 'Escape', description: 'Close modals and notifications' },
    { combo: 'F1', description: 'Show help' },
    { combo: 'Alt+A', description: 'Open accessibility settings' },
    { combo: 'Alt+1', description: 'Announce current status' },
    { combo: 'Alt+2', description: 'Skip to main content' },
  ];

  return (
    <div className="keyboard-shortcuts-help" role="dialog" aria-labelledby="shortcuts-title">
      <div className="keyboard-shortcuts-help__content">
        <div className="keyboard-shortcuts-help__header">
          <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
          <button 
            onClick={onClose}
            className="keyboard-shortcuts-help__close"
            aria-label="Close shortcuts help"
          >
            ×
          </button>
        </div>
        <div className="keyboard-shortcuts-help__list">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="keyboard-shortcuts-help__item">
              <kbd className="keyboard-shortcuts-help__combo">
                {formatKeyCombo(shortcut.combo)}
              </kbd>
              <span className="keyboard-shortcuts-help__description">
                {shortcut.description}
              </span>
            </div>
          ))}
        </div>
        <div className="keyboard-shortcuts-help__footer">
          <p>Press <kbd>Escape</kbd> to close this dialog</p>
        </div>
      </div>
    </div>
  );
};