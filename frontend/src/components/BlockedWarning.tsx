import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, RefreshCw, Clock } from 'lucide-react';
import { CheckResult } from '../types';

interface BlockedWarningProps {
  results: CheckResult[];
  isRunning: boolean;
  onRecheckBlockedOnly: (asins: string[]) => void;
}

export const BlockedWarning: React.FC<BlockedWarningProps> = ({
  results,
  isRunning,
  onRecheckBlockedOnly,
}) => {
  const [retryLaterMessage, setRetryLaterMessage] = useState(false);

  if (results.length === 0) return null;

  const blockedResults = results.filter((r) => r.status === 'BLOCKED');
  const blockedCount = blockedResults.length;
  const verifiedCount = results.filter(
    (r) => r.status === 'OK' || r.status === 'REDIRECTED' || r.status === 'NOT_FOUND'
  ).length;
  const total = results.length;
  const cachedCount = results.filter((r) => r.cached).length;
  const allBlocked = !isRunning && verifiedCount === 0 && blockedCount > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {/* Blocked rate indicator strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.6rem',
          padding: '0.65rem 0.95rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: blockedCount > 0 ? 'var(--status-blocked-bg)' : 'var(--status-ok-bg)',
          border: `1px solid ${blockedCount > 0 ? 'var(--status-blocked-border)' : 'var(--status-ok-border)'}`,
          color: blockedCount > 0 ? 'var(--status-blocked)' : 'var(--status-ok)',
          fontSize: '0.84rem',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {blockedCount > 0 ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
          <span>
            Blocked rate: <strong>{verifiedCount} of {total} verified</strong>,{' '}
            <strong>{blockedCount} blocked by Amazon</strong>
          </span>
          {cachedCount > 0 && (
            <span style={{
              fontSize: '0.74rem',
              padding: '1px 7px',
              borderRadius: '999px',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)',
            }}>
              {cachedCount} from 24h cache
            </span>
          )}
        </div>

        {blockedCount > 0 && !isRunning && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onRecheckBlockedOnly(blockedResults.map((r) => r.asin))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--status-blocked)',
                color: '#ffffff',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              <RefreshCw size={13} />
              <span>Re-check blocked only ({blockedCount})</span>
            </button>
          </div>
        )}
      </div>

      {/* Honest explanation & Retry later prompt when requests are blocked */}
      {blockedCount > 0 && !isRunning && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--status-blocked-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.9rem 1rem',
            color: 'var(--text-main)',
          }}
        >
          <ShieldAlert size={20} style={{ color: 'var(--status-blocked)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.84rem', lineHeight: 1.5, flex: 1 }}>
            <strong style={{ display: 'block', color: 'var(--status-blocked)', marginBottom: '2px' }}>
              {allBlocked
                ? 'Amazon blocked all requests in this batch (could not verify)'
                : `Amazon blocked ${blockedCount} ${blockedCount === 1 ? 'request' : 'requests'} with a captcha or 503/429 throttle`}
            </strong>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
              LinkSure never guesses or fakes results. <strong>BLOCKED</strong> means Amazon withheld the product page from this server&apos;s IP — it does <strong>not</strong> mean your listings are broken. Try retrying only the blocked IDs with slower pacing, or wait a few minutes before trying again.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => onRecheckBlockedOnly(blockedResults.map((r) => r.asin))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--status-blocked-border)',
                  backgroundColor: 'var(--status-blocked-bg)',
                  color: 'var(--status-blocked)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={14} />
                <span>Re-check blocked only (slower pacing)</span>
              </button>

              <button
                type="button"
                onClick={() => setRetryLaterMessage(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                <Clock size={14} />
                <span>Retry later</span>
              </button>
            </div>
            {retryLaterMessage && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                This run is saved in History. Wait 5–10 minutes and reopen it from History to re-check the blocked IDs.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
