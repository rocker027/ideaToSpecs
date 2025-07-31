import React, { useState, useRef, useEffect } from 'react';
import './TextField.css';

const TextField = ({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  error = false,
  helperText,
  multiline = false,
  rows = 4,
  type = 'text',
  variant = 'outlined',
  className = '',
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  const [hasValue, setHasValue] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setHasValue(value && value.toString().length > 0);
  }, [value]);

  const baseClass = 'md-textfield';
  const variantClass = `md-textfield--${variant}`;
  const focusedClass = focused ? 'md-textfield--focused' : '';
  const errorClass = error ? 'md-textfield--error' : '';
  const disabledClass = disabled ? 'md-textfield--disabled' : '';
  const hasValueClass = hasValue ? 'md-textfield--has-value' : '';
  const hasLabelClass = label ? 'md-textfield--has-label' : '';
  
  const textfieldClass = [
    baseClass,
    variantClass,
    focusedClass,
    errorClass,
    disabledClass,
    hasValueClass,
    hasLabelClass,
    className
  ].filter(Boolean).join(' ');

  const handleFocus = (e) => {
    setFocused(true);
    if (props.onFocus) props.onFocus(e);
  };

  const handleBlur = (e) => {
    setFocused(false);
    if (props.onBlur) props.onBlur(e);
  };

  const InputComponent = multiline ? 'textarea' : 'input';

  return (
    <div className={textfieldClass}>
      <div className="md-textfield__container">
        <InputComponent
          ref={inputRef}
          className="md-textfield__input"
          type={multiline ? undefined : type}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={variant === 'filled' ? placeholder : ''}
          disabled={disabled}
          rows={multiline ? rows : undefined}
          {...props}
        />
        
        {label && (
          <label className="md-textfield__label">
            {label}
          </label>
        )}
        
        {variant === 'outlined' && (
          <fieldset className="md-textfield__outline">
            <legend className="md-textfield__legend">
              {label && (focused || hasValue) && (
                <span>{label}</span>
              )}
            </legend>
          </fieldset>
        )}
      </div>
      
      {helperText && (
        <div className="md-textfield__helper-text">
          {helperText}
        </div>
      )}
    </div>
  );
};

export default TextField;