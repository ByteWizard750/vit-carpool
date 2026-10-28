import React from 'react';
import {
  Clock,
  Check,
  CheckCircle2,
  X,
  Ban,
  Calendar,
  Repeat,
  Pause,
  ShieldCheck,
  AlertCircle,
  LucideIcon,
} from 'lucide-react';

export type StatusDomain = 'booking' | 'ride' | 'schedule' | 'vehicle' | 'account';

interface StatusBadgeProps {
  status: string;
  domain?: StatusDomain;
  label?: string;
  className?: string;
}

interface BadgeConfig {
  label: string;
  tint: 'success' | 'warning' | 'danger' | 'brand' | 'neutral';
  icon: LucideIcon;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  domain = 'booking',
  label: customLabel,
  className = '',
}) => {
  const normStatus = (status || '').toUpperCase();

  const getConfig = (): BadgeConfig => {
    switch (domain) {
      case 'booking':
        switch (normStatus) {
          case 'PENDING':
            return { label: 'PENDING', tint: 'warning', icon: Clock };
          case 'CONFIRMED':
            return { label: 'CONFIRMED', tint: 'success', icon: Check };
          case 'DECLINED':
          case 'REJECTED':
            return { label: 'DECLINED', tint: 'neutral', icon: X };
          case 'EXPIRED':
            return { label: 'EXPIRED', tint: 'neutral', icon: Clock };
          case 'CANCELLED':
            return { label: 'CANCELLED', tint: 'neutral', icon: Ban };
          case 'COMPLETED':
            return { label: 'COMPLETED', tint: 'neutral', icon: CheckCircle2 };
          default:
            return { label: normStatus, tint: 'neutral', icon: Clock };
        }

      case 'ride':
        switch (normStatus) {
          case 'SCHEDULED':
          case 'UPCOMING':
          case 'ACTIVE':
          case 'OPEN':
            return { label: 'Upcoming', tint: 'brand', icon: Calendar };
          case 'CANCELLED':
            return { label: 'Cancelled', tint: 'neutral', icon: Ban };
          case 'COMPLETED':
            return { label: 'Completed', tint: 'neutral', icon: CheckCircle2 };
          default:
            return { label: normStatus, tint: 'neutral', icon: Calendar };
        }

      case 'schedule':
        switch (normStatus) {
          case 'ACTIVE':
            return { label: 'Active', tint: 'success', icon: Repeat };
          case 'PAUSED':
            return { label: 'Paused', tint: 'warning', icon: Pause };
          case 'ENDED':
          case 'CANCELLED':
            return { label: 'Ended', tint: 'neutral', icon: Ban };
          default:
            return { label: normStatus, tint: 'neutral', icon: Repeat };
        }

      case 'vehicle':
        switch (normStatus) {
          case 'VERIFIED':
            return { label: 'Verified', tint: 'success', icon: ShieldCheck };
          case 'IN_REVIEW':
          case 'PENDING':
            return { label: 'In review', tint: 'warning', icon: Clock };
          case 'NEEDS_CHANGES':
          case 'REJECTED':
            return { label: 'Needs changes', tint: 'danger', icon: AlertCircle };
          default:
            return { label: normStatus, tint: 'neutral', icon: Clock };
        }

      case 'account':
        switch (normStatus) {
          case 'VERIFIED':
            return { label: 'Verified', tint: 'success', icon: ShieldCheck };
          case 'PENDING':
          case 'MANUAL_ID_REVIEW':
            return { label: 'Verified by ID review', tint: 'success', icon: ShieldCheck };
          case 'IN_REVIEW':
            return { label: 'Pending verification', tint: 'warning', icon: Clock };
          case 'REJECTED':
            return { label: 'Rejected', tint: 'danger', icon: X };
          case 'SUSPENDED':
            return { label: 'Suspended', tint: 'danger', icon: Ban };
          default:
            return { label: normStatus, tint: 'neutral', icon: Clock };
        }

      default:
        return { label: normStatus, tint: 'neutral', icon: Clock };
    }
  };

  const config = getConfig();
  const Icon = config.icon;
  const displayLabel = customLabel || config.label;

  return (
    <span className={`status-badge status-badge-${config.tint} ${className}`}>
      <Icon className="status-badge-icon" strokeWidth={2.2} />
      <span>{displayLabel}</span>
    </span>
  );
};
