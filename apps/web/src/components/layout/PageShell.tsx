import React from 'react';

export type PageShellWidth = 'narrow' | 'content' | 'wide';

interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: PageShellWidth;
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

const WIDTH_STYLES: Record<PageShellWidth, string> = {
  narrow: 'page-shell-narrow', // max-width: 560px
  content: 'page-shell-content', // max-width: 880px
  wide: 'page-shell-wide', // max-width: 1120px
};

export const PageShell: React.FC<PageShellProps> = ({
  width = 'content',
  children,
  className = '',
  as: Component = 'div',
  style,
  ...props
}) => {
  return (
    <Component
      className={`page-shell ${WIDTH_STYLES[width]} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </Component>
  );
};
