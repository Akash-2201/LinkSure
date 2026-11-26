import React from 'react';
import { 
  CheckCircle2, 
  ArrowRightLeft, 
  XCircle, 
  ShieldAlert, 
  AlertOctagon, 
  Layers 
} from 'lucide-react';
import { StatusCounts, StatusType } from '../types';

interface StatusStripProps {
  total: number;
  counts: StatusCounts;
  activeFilter: StatusType | 'ALL';
  onSelectFilter: (filter: StatusType | 'ALL') => void;
}

export const StatusStrip: React.FC<StatusStripProps> = ({
  total,
  counts,
  activeFilter,
  onSelectFilter,
}) => {
  const items: Array<{
    type: StatusType | 'ALL';
    label: string;
    count: number;
    icon: React.ReactNode;
    colorVar: string;
    bgVar: string;
    borderVar: string;
  }> = [
    {
      type: 'ALL',
      label: 'All Items',
      count: total,
      icon: <Layers size={16} />,
      colorVar: 'var(--text-main)',
      bgVar: 'var(--bg-subtle)',
      borderVar: 'var(--border-color)',
    },
    {
      type: 'OK',
      label: 'OK',
      count: counts.OK,
      icon: <CheckCircle2 size={16} />,
      colorVar: 'var(--status-ok)',
      bgVar: 'var(--status-ok-bg)',
      borderVar: 'var(--status-ok-border)',
    },
    {
      type: 'REDIRECTED',
      label: 'Redirected',
      count: counts.REDIRECTED,
      icon: <ArrowRightLeft size={16} />,
      colorVar: 'var(--status-redirect)',
      bgVar: 'var(--status-redirect-bg)',
      borderVar: 'var(--status-redirect-border)',
    },
    {
      type: 'NOT_FOUND',
      label: 'Not Found',
      count: counts.NOT_FOUND,
      icon: <XCircle size={16} />,
      colorVar: 'var(--status-notfound)',
      bgVar: 'var(--status-notfound-bg)',
      borderVar: 'var(--status-notfound-border)',
    },
    {
      type: 'BLOCKED',
      label: 'Blocked',
      count: counts.BLOCKED,
      icon: <ShieldAlert size={16} />,
      colorVar: 'var(--status-blocked)',
      bgVar: 'var(--status-blocked-bg)',
      borderVar: 'var(--status-blocked-border)',
    },
    {
      type: 'ERROR',
      label: 'Error',
      count: counts.ERROR,
      icon: <AlertOctagon size={16} />,
      colorVar: 'var(--status-error)',
      bgVar: 'var(--status-error-bg)',
      borderVar: 'var(--status-error-border)',
    },
  ];

  return (
    <div className="status-strip-grid">
      {items.map((item) => {
        const isSelected = activeFilter === item.type;
        return (
          <button
            key={item.type}
            type="button"
            onClick={() => onSelectFilter(item.type)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.7rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              border: isSelected ? `2px solid ${item.colorVar}` : `1px solid ${item.borderVar}`,
              backgroundColor: isSelected ? item.bgVar : 'var(--bg-surface)',
              boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
              transform: isSelected ? 'translateY(-1px)' : 'none',
              cursor: 'pointer',
              textAlign: 'left',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
              <span style={{ color: item.colorVar, display: 'flex', flexShrink: 0 }}>
                {item.icon}
              </span>
              <span style={{
                fontSize: '0.8rem',
                fontWeight: isSelected ? 700 : 600,
                color: 'var(--text-main)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.label}
              </span>
            </div>
            <span className="mono" style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: item.colorVar,
              marginLeft: '0.4rem',
              flexShrink: 0,
            }}>
              {item.count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
