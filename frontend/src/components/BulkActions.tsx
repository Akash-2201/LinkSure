import React, { useState } from 'react';
import { 
  Copy, 
  Check, 
  RefreshCw, 
  FileSpreadsheet,
  Zap
} from 'lucide-react';
import { CheckResult } from '../types';

interface BulkActionsProps {
  results: CheckResult[];
  domain: string;
  onDownloadCsv: () => void;
  onRecheckBlocked: (asinsToRecheck: string[]) => void;
  onForceRecheckAll: (asinsToRecheck: string[]) => void;
  isRunning: boolean;
}

export const BulkActions: React.FC<BulkActionsProps> = ({
  results,
  domain,
  onDownloadCsv,
  onRecheckBlocked,
  onForceRecheckAll,
  isRunning,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const okLinks = results
    .filter((r) => r.status === 'OK')
    .map((r) => r.start_url)
    .join('\n');

  const correctedLinks = results
    .filter((r) => r.status === 'OK' || (r.status === 'REDIRECTED' && r.final_asin))
    .map((r) => {
      const activeAsin = r.status === 'REDIRECTED' && r.final_asin ? r.final_asin : r.asin;
      return `https://www.${domain}/dp/${activeAsin}`;
    })
    .join('\n');

  const problemResults = results.filter((r) => r.status !== 'OK');
  const problemIds = problemResults.map((r) => r.asin).join('\n');

  const retryableAsins = results
    .filter((r) => r.status === 'BLOCKED' || r.status === 'ERROR')
    .map((r) => r.asin);

  const hasCached = results.some((r) => r.cached);

  if (results.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.6rem',
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      padding: '0.75rem',
      marginBottom: '1rem',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Left side: Copy bulk helpers */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem' }}>
        <button
          type="button"
          onClick={() => handleCopy('ok', okLinks)}
          disabled={!okLinks || isRunning}
          title="Copies verified Amazon links for all OK items"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--status-ok-border)',
            backgroundColor: 'var(--status-ok-bg)',
            color: 'var(--status-ok)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: okLinks && !isRunning ? 'pointer' : 'default',
            opacity: okLinks ? 1 : 0.5,
          }}
        >
          {copiedKey === 'ok' ? <Check size={14} /> : <Copy size={14} />}
          <span>{copiedKey === 'ok' ? 'Copied OK Links!' : 'Copy all OK links'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleCopy('corrected', correctedLinks)}
          disabled={!correctedLinks || isRunning}
          title="Copies active working links (replaces redirected ASINs with their landed ASIN)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--status-redirect-border)',
            backgroundColor: 'var(--status-redirect-bg)',
            color: 'var(--status-redirect)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: correctedLinks && !isRunning ? 'pointer' : 'default',
            opacity: correctedLinks ? 1 : 0.5,
          }}
        >
          {copiedKey === 'corrected' ? <Check size={14} /> : <Copy size={14} />}
          <span>{copiedKey === 'corrected' ? 'Copied Corrected!' : 'Copy corrected links'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleCopy('problems', problemIds)}
          disabled={!problemIds || isRunning}
          title="Copies ASINs that redirected, failed, or had errors"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-app)',
            color: 'var(--text-muted)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: problemIds && !isRunning ? 'pointer' : 'default',
            opacity: problemIds ? 1 : 0.5,
          }}
        >
          {copiedKey === 'problems' ? <Check size={14} /> : <Copy size={14} />}
          <span>{copiedKey === 'problems' ? 'Copied Problem IDs!' : 'Copy problem IDs only'}</span>
        </button>
      </div>

      {/* Right side: Recheck & Download */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem' }}>
        {retryableAsins.length > 0 && (
          <button
            type="button"
            onClick={() => onRecheckBlocked(retryableAsins)}
            disabled={isRunning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--status-blocked-border)',
              backgroundColor: 'var(--status-blocked-bg)',
              color: 'var(--status-blocked)',
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            <RefreshCw size={13} />
            <span>Re-check blocked only ({retryableAsins.length})</span>
          </button>
        )}

        {hasCached && (
          <button
            type="button"
            onClick={() => onForceRecheckAll(results.map((r) => r.asin))}
            disabled={isRunning}
            title="Bypass the 24-hour cache and re-fetch all IDs live"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-strong)',
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-main)',
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            <Zap size={13} />
            <span>Force re-check</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDownloadCsv}
          disabled={isRunning}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--primary-border)',
            backgroundColor: 'var(--primary-subtle)',
            color: 'var(--primary)',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          <FileSpreadsheet size={15} />
          <span>Download CSV</span>
        </button>
      </div>
    </div>
  );
};
