import React from 'react';
import { Square, Loader2 } from 'lucide-react';

interface ProgressBarProps {
  completed: number;
  total: number;
  elapsedSeconds: number;
  isRunning: boolean;
  onCancel: () => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  completed,
  total,
  elapsedSeconds,
  isRunning,
  onCancel,
}) => {
  const percentage = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-color)',
      padding: '0.85rem 1.25rem',
      marginBottom: '1.25rem',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.5rem',
        fontSize: '0.85rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {isRunning && (
            <Loader2 size={16} className="animate-pulse" style={{ color: 'var(--primary)', animation: 'spin 1.5s linear infinite' }} />
          )}
          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
            {isRunning ? 'Checking Amazon Links...' : 'Check Complete'}
          </span>
          <span className="mono" style={{ color: 'var(--text-muted)' }}>
            {completed} of {total} checked ({percentage}%)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Time: {elapsedSeconds}s
          </span>

          {isRunning && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--status-notfound)',
                backgroundColor: 'var(--status-notfound-bg)',
                border: '1px solid var(--status-notfound-border)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Square size={13} fill="currentColor" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Track */}
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'var(--border-color)',
        borderRadius: '999px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${percentage}%`,
          height: '100%',
          backgroundColor: isRunning ? 'var(--primary)' : 'var(--status-ok)',
          borderRadius: '999px',
          transition: 'width 0.25s ease-out',
        }} />
      </div>
    </div>
  );
};
