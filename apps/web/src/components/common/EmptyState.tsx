import React from 'react';
import { LucideIcon, Compass } from 'lucide-react';
import { Button } from './Button';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  icon?: LucideIcon;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  secondaryAction,
  icon: Icon = Compass,
  className = '',
}) => {
  return (
    <div
      className={`empty-state-card ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-10) var(--space-6)',
        backgroundColor: 'var(--surface)',
        border: '1px dashed var(--border-subtle, #e5e7eb)',
        borderRadius: 'var(--radius-lg, 12px)',
        margin: 'var(--space-4) 0',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'var(--canvas-subtle, #f1f3f7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted, #9ca3af)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <Icon size={24} strokeWidth={1.8} />
      </div>

      <h3
        style={{
          fontSize: 'var(--text-lg, 1.125rem)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: '0 0 var(--space-2)',
          fontFamily: 'var(--font-display, inherit)',
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: 'var(--text-sm, 0.875rem)',
          color: 'var(--text-secondary)',
          maxWidth: '420px',
          margin: '0 0 var(--space-6)',
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>

      {(action || secondaryAction) && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
          {action && (
            action.href ? (
              <Link to={action.href} className="btn btn-primary btn-md">
                {action.label}
              </Link>
            ) : (
              <Button variant="primary" size="md" onClick={action.onClick}>
                {action.label}
              </Button>
            )
          )}

          {secondaryAction && (
            secondaryAction.href ? (
              <Link to={secondaryAction.href} className="btn btn-secondary btn-md">
                {secondaryAction.label}
              </Link>
            ) : (
              <Button variant="secondary" size="md" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
};
