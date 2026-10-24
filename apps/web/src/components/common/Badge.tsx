import React from 'react';
import { ShieldCheck, GraduationCap, Briefcase, AlertCircle, Info } from 'lucide-react';

export type BadgeVariant = 'verified' | 'student' | 'faculty' | 'neutral' | 'warning' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  icon = true,
  className = '',
}) => {
  const getIcon = () => {
    if (!icon) return null;
    switch (variant) {
      case 'verified':
        return <ShieldCheck size={13} strokeWidth={2.5} />;
      case 'student':
        return <GraduationCap size={13} strokeWidth={2.5} />;
      case 'faculty':
        return <Briefcase size={13} strokeWidth={2.5} />;
      case 'warning':
        return <AlertCircle size={13} strokeWidth={2.5} />;
      case 'info':
        return <Info size={13} strokeWidth={2.5} />;
      default:
        return null;
    }
  };

  return (
    <span className={`badge badge-${variant} ${className}`}>
      {getIcon()}
      <span>{children}</span>
    </span>
  );
};
