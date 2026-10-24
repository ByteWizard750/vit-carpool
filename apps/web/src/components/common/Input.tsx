import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  leftIcon?: React.ReactNode;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  leftIcon,
  error,
  helperText,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="form-group">
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
        </label>
      )}
      <div className="form-control-wrap">
        {leftIcon && <span className="form-icon-left">{leftIcon}</span>}
        <input
          id={inputId}
          className={`form-input ${leftIcon ? 'form-input-with-icon' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <span style={{ fontSize: '0.75rem', color: 'var(--status-error)' }}>{error}</span>}
      {!error && helperText && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{helperText}</span>
      )}
    </div>
  );
};
