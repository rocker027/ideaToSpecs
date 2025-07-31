import React from 'react';
import './Card.css';

const Card = ({
  children,
  variant = 'elevated',
  interactive = false,
  onClick,
  className = '',
  ...props
}) => {
  const baseClass = 'md-card';
  const variantClass = `md-card--${variant}`;
  const interactiveClass = interactive ? 'md-card--interactive' : '';
  
  const cardClass = [
    baseClass,
    variantClass,
    interactiveClass,
    className
  ].filter(Boolean).join(' ');

  const Component = interactive || onClick ? 'button' : 'div';

  return (
    <Component
      className={cardClass}
      onClick={onClick}
      type={Component === 'button' ? 'button' : undefined}
      {...props}
    >
      {children}
    </Component>
  );
};

export default Card;