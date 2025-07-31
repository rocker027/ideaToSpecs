import React from 'react';
import './Button.css';

const Button = ({
  children,
  variant = 'filled',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  onClick,
  type = 'button',
  className = '',
  ...props
}) => {
  const baseClass = 'md-button';
  const variantClass = `md-button--${variant}`;
  const sizeClass = `md-button--${size}`;
  const disabledClass = disabled ? 'md-button--disabled' : '';
  const loadingClass = loading ? 'md-button--loading' : '';
  
  const buttonClass = [
    baseClass,
    variantClass,
    sizeClass,
    disabledClass,
    loadingClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={buttonClass}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && <div className="md-button__loading-spinner" />}
      {icon && !loading && <span className="md-button__icon">{icon}</span>}
      <span className="md-button__label">{children}</span>
    </button>
  );
};

export default Button;