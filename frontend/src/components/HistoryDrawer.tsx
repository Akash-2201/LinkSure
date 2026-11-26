import React from 'react';
import { X, History, Trash2, ArrowRight, Calendar, Globe } from 'lucide-react';
import { RunHistoryItem } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: RunHistoryItem[];
  onLoadRun: (run: RunHistoryItem) => void;
  onClearHistory: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onLoadRun,
  onClearHistory,
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      justifyContent: 'flex-end',
      zIndex: 50,
    }}>
      <div 
        className="animate-fade-in"
        style={{
          width: '420px',
          maxWidth: '90vw',
          height: '100%',
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Drawer Header */}
        <div style={{
          padding: '1.25rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Recent Runs</h3>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: '999px',
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-muted)',
            }}>
              {history.length}/10 stored
            </span>
          </div>

          <button
            onClick={onClose}
            aria-label="Close history drawer"
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer List Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {history.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: 'var(--text-dim)',
              fontSize: '0.9rem',
            }}>
              No saved runs yet. LinkSure automatically retains your last 10 verification runs in browser storage.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {history.map((run) => (
                <div
                  key={run.id}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.85rem 1rem',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.4rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      <Calendar size={13} />
                      <span>{new Date(run.timestamp).toLocaleString()}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <Globe size={13} />
                      <span>{run.domain}</span>
                    </div>
                  </div>

                  {/* Status counts mini pills */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.35rem',
                    margin: '0.5rem 0',
                    fontSize: '0.75rem',
                  }}>
                    <span style={{
                      backgroundColor: 'var(--bg-subtle)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}>
                      Total: {run.total}
                    </span>
                    {run.counts.OK > 0 && (
                      <span style={{
                        backgroundColor: 'var(--status-ok-bg)',
                        color: 'var(--status-ok)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}>
                        {run.counts.OK} OK
                      </span>
                    )}
                    {run.counts.REDIRECTED > 0 && (
                      <span style={{
                        backgroundColor: 'var(--status-redirect-bg)',
                        color: 'var(--status-redirect)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}>
                        {run.counts.REDIRECTED} Redirected
                      </span>
                    )}
                    {run.counts.NOT_FOUND > 0 && (
                      <span style={{
                        backgroundColor: 'var(--status-notfound-bg)',
                        color: 'var(--status-notfound)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}>
                        {run.counts.NOT_FOUND} Not Found
                      </span>
                    )}
                    {run.counts.BLOCKED > 0 && (
                      <span style={{
                        backgroundColor: 'var(--status-blocked-bg)',
                        color: 'var(--status-blocked)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}>
                        {run.counts.BLOCKED} Blocked
                      </span>
                    )}
                    {run.counts.ERROR > 0 && (
                      <span style={{
                        backgroundColor: 'var(--status-error-bg)',
                        color: 'var(--status-error)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}>
                        {run.counts.ERROR} Error
                      </span>
                    )}
                  </div>

                  {/* Load button */}
                  <button
                    type="button"
                    onClick={() => {
                      onLoadRun(run);
                      onClose();
                    }}
                    style={{
                      width: '100%',
                      marginTop: '0.4rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      padding: '5px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--primary-subtle)',
                      color: 'var(--primary)',
                      border: '1px solid var(--primary-border)',
                    }}
                  >
                    <span>Load this run</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        {history.length > 0 && (
          <div style={{
            padding: '1rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}>
            <button
              type="button"
              onClick={onClearHistory}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                color: 'var(--status-notfound)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--status-notfound-border)',
                backgroundColor: 'var(--status-notfound-bg)',
              }}
            >
              <Trash2 size={14} />
              <span>Clear History</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
