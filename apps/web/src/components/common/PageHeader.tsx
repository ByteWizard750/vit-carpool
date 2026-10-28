import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  action,
  tabs,
  className = '',
}) => {
  return (
    <div className={`page-header ${className}`}>
      <div className="page-header-row">
        <div className="page-header-title-block">
          <div className="page-header-title-row">
            <h1 className="page-header-title">{title}</h1>
            {badge && <div>{badge}</div>}
          </div>
          {description && <p className="page-header-description">{description}</p>}
        </div>

        {action && <div className="page-header-action">{action}</div>}
      </div>

      {tabs && <div className="page-header-tabs">{tabs}</div>}
    </div>
  );
};
