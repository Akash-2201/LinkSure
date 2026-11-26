import React, { useState, useMemo } from 'react';
import { 
  ExternalLink, 
  Copy, 
  Check, 
  ArrowRight, 
  Search, 
  CheckCircle2, 
  ArrowRightLeft, 
  XCircle, 
  ShieldAlert, 
  AlertOctagon,
  RefreshCw,
  Database
} from 'lucide-react';
import { CheckResult, StatusType } from '../types';

interface ResultsTableProps {
  results: CheckResult[];
  activeFilter: StatusType | 'ALL';
  domain: string;
  onRecheckSingle: (asin: string, forceRecheck?: boolean) => void;
  isRunning: boolean;
}

type SortField = 'index' | 'asin' | 'status' | 'final_asin' | 'title';
type SortOrder = 'asc' | 'desc';

export const ResultsTable: React.FC<ResultsTableProps> = ({
  results,
  activeFilter,
  domain,
  onRecheckSingle,
  isRunning,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('index');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [copiedAsin, setCopiedAsin] = useState<string | null>(null);

  const handleCopyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedAsin(id);
    setTimeout(() => setCopiedAsin(null), 2000);
  };

  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      if (activeFilter !== 'ALL' && item.status !== activeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesAsin = item.asin.toLowerCase().includes(q);
        const matchesFinal = (item.final_asin || '').toLowerCase().includes(q);
        const matchesTitle = (item.title || '').toLowerCase().includes(q);
        const matchesNote = (item.note || '').toLowerCase().includes(q);
        return matchesAsin || matchesFinal || matchesTitle || matchesNote;
      }
      return true;
    });
  }, [results, activeFilter, searchQuery]);

  const sortedResults = useMemo(() => {
    if (sortField === 'index') {
      return sortOrder === 'asc' ? filteredResults : [...filteredResults].reverse();
    }
    return [...filteredResults].sort((a, b) => {
      const valA = (a[sortField] || '').toString().toLowerCase();
      const valB = (b[sortField] || '').toString().toLowerCase();
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredResults, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getStatusBadge = (status: StatusType) => {
    switch (status) {
      case 'OK':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-ok-bg)',
            color: 'var(--status-ok)',
            border: '1px solid var(--status-ok-border)',
            fontSize: '0.76rem',
            fontWeight: 700,
          }}>
            <CheckCircle2 size={13} />
            <span>OK</span>
          </span>
        );
      case 'REDIRECTED':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-redirect-bg)',
            color: 'var(--status-redirect)',
            border: '1px solid var(--status-redirect-border)',
            fontSize: '0.76rem',
            fontWeight: 700,
          }}>
            <ArrowRightLeft size={13} />
            <span>REDIRECTED</span>
          </span>
        );
      case 'NOT_FOUND':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-notfound-bg)',
            color: 'var(--status-notfound)',
            border: '1px solid var(--status-notfound-border)',
            fontSize: '0.76rem',
            fontWeight: 700,
          }}>
            <XCircle size={13} />
            <span>NOT FOUND</span>
          </span>
        );
      case 'BLOCKED':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-blocked-bg)',
            color: 'var(--status-blocked)',
            border: '1px solid var(--status-blocked-border)',
            fontSize: '0.76rem',
            fontWeight: 700,
          }}>
            <ShieldAlert size={13} />
            <span>BLOCKED</span>
          </span>
        );
      case 'ERROR':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-error-bg)',
            color: 'var(--status-error)',
            border: '1px solid var(--status-error-border)',
            fontSize: '0.76rem',
            fontWeight: 700,
          }}>
            <AlertOctagon size={13} />
            <span>ERROR</span>
          </span>
        );
    }
  };

  const getCachedBadge = (item: CheckResult) => {
    if (!item.cached) return null;
    return (
      <span
        title={item.cached_at ? `Served from 24h cache (checked ${item.cached_at})` : 'Served from 24h cache'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '2px 6px',
          borderRadius: '999px',
          backgroundColor: 'var(--bg-subtle)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-strong)',
          fontSize: '0.7rem',
          fontWeight: 600,
        }}
      >
        <Database size={10} />
        <span>cached</span>
      </span>
    );
  };

  const getRowBg = (status: StatusType) =>
    status === 'REDIRECTED'
      ? 'var(--status-redirect-bg)'
      : status === 'NOT_FOUND'
        ? 'var(--status-notfound-bg)'
        : status === 'BLOCKED'
          ? 'var(--status-blocked-bg)'
          : status === 'ERROR'
            ? 'var(--status-error-bg)'
            : 'var(--bg-surface)';

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
    }}>
      {/* Table Top Toolbar */}
      <div style={{
        padding: '0.85rem 1rem',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.65rem',
        backgroundColor: 'var(--bg-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>Results</span>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: '999px',
            backgroundColor: 'var(--bg-subtle)',
            color: 'var(--text-muted)',
          }}>
            Showing {sortedResults.length} of {results.length}
          </span>
        </div>

        {/* Search Filter Box */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          backgroundColor: 'var(--bg-app)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 10px',
          flex: '1 1 200px',
          maxWidth: '280px',
        }}>
          <Search size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search ASIN, title, note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '0.82rem',
              width: '100%',
              color: 'var(--text-main)',
            }}
          />
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="results-desktop-table">
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '0.86rem',
        }}>
          <thead>
            <tr style={{
              backgroundColor: 'var(--bg-subtle)',
              borderBottom: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              <th onClick={() => toggleSort('asin')} style={{ padding: '10px 14px', cursor: 'pointer', width: '150px' }}>
                Requested ID
              </th>
              <th onClick={() => toggleSort('status')} style={{ padding: '10px 14px', cursor: 'pointer', width: '155px' }}>
                Status
              </th>
              <th onClick={() => toggleSort('final_asin')} style={{ padding: '10px 14px', cursor: 'pointer', width: '220px' }}>
                Landed-On
              </th>
              <th onClick={() => toggleSort('title')} style={{ padding: '10px 14px', cursor: 'pointer' }}>
                Product Title &amp; Details
              </th>
              <th style={{ padding: '10px 14px', width: '220px' }}>
                Note
              </th>
              <th style={{ padding: '10px 14px', width: '115px', textAlign: 'right' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedResults.length === 0 ? (
              <tr>
                <td colSpan={6} style={{
                  padding: '3rem 1rem',
                  textAlign: 'center',
                  color: 'var(--text-dim)',
                  fontSize: '0.9rem',
                }}>
                  {results.length === 0
                    ? 'No links checked yet. Paste ASINs above and click "Check Links".'
                    : 'No results match the current search or status filter.'}
                </td>
              </tr>
            ) : (
              sortedResults.map((item, idx) => {
                const isRedirected = item.status === 'REDIRECTED';
                const isProblem = item.status !== 'OK';
                const linkUrl = item.start_url || `https://www.${domain}/dp/${item.asin}`;
                const landedUrl = item.final_url || (item.final_asin ? `https://www.${domain}/dp/${item.final_asin}` : '');

                return (
                  <tr
                    key={`${item.asin}-${idx}`}
                    className="animate-fade-in"
                    style={{
                      backgroundColor: getRowBg(item.status),
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <a
                        href={linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mono"
                        title="Open requested Amazon link in new tab"
                        style={{
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          color: 'var(--text-main)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <span>{item.asin}</span>
                        <ExternalLink size={12} style={{ opacity: 0.6 }} />
                      </a>
                    </td>

                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}>
                        {getStatusBadge(item.status)}
                        {getCachedBadge(item)}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      {isRedirected ? (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          backgroundColor: 'var(--bg-surface)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--status-redirect-border)',
                        }}>
                          <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {item.asin}
                          </span>
                          <ArrowRight size={13} style={{ color: 'var(--status-redirect)', flexShrink: 0 }} />
                          {item.final_asin ? (
                            <a
                              href={landedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mono"
                              title="Open redirected listing in new tab"
                              style={{
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                color: 'var(--status-redirect)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <span>{item.final_asin}</span>
                              <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--status-redirect)', fontWeight: 600 }}>
                              (Non-product page)
                            </span>
                          )}
                        </div>
                      ) : item.status === 'OK' ? (
                        <a
                          href={landedUrl || linkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mono"
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <span>{item.final_asin || item.asin}</span>
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div
                        title={item.title}
                        style={{
                          maxHeight: '2.8em',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          color: item.title ? 'var(--text-main)' : 'var(--text-dim)',
                          lineHeight: 1.4,
                        }}
                      >
                        {item.title || '(No page title extracted)'}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div style={{
                        fontSize: '0.82rem',
                        color: isProblem ? 'var(--text-main)' : 'var(--text-muted)',
                        fontWeight: isProblem ? 500 : 400,
                        lineHeight: 1.35,
                      }}>
                        {item.note || '—'}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(landedUrl || linkUrl, item.asin)}
                          title="Copy link to clipboard"
                          style={{
                            padding: '5px',
                            borderRadius: '4px',
                            color: copiedAsin === item.asin ? 'var(--status-ok)' : 'var(--text-dim)',
                          }}
                        >
                          {copiedAsin === item.asin ? <Check size={14} /> : <Copy size={14} />}
                        </button>

                        <a
                          href={landedUrl || linkUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open link in new tab"
                          style={{
                            padding: '5px',
                            borderRadius: '4px',
                            color: 'var(--text-dim)',
                            display: 'inline-flex',
                          }}
                        >
                          <ExternalLink size={14} />
                        </a>

                        <button
                          type="button"
                          onClick={() => onRecheckSingle(item.asin, true)}
                          disabled={isRunning}
                          title={item.cached ? 'Force re-check (bypass 24h cache)' : 'Re-check this ASIN'}
                          style={{
                            padding: '5px',
                            borderRadius: '4px',
                            color: 'var(--text-dim)',
                          }}
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile-first Cards View (< 768px, optimized for 375px width) */}
      <div className="results-mobile-cards">
        {sortedResults.length === 0 ? (
          <div style={{
            padding: '2.5rem 1rem',
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontSize: '0.88rem',
          }}>
            {results.length === 0
              ? 'No links checked yet. Paste ASINs above and tap "Check Links".'
              : 'No results match the current search or status filter.'}
          </div>
        ) : (
          sortedResults.map((item, idx) => {
            const isRedirected = item.status === 'REDIRECTED';
            const linkUrl = item.start_url || `https://www.${domain}/dp/${item.asin}`;
            const landedUrl = item.final_url || (item.final_asin ? `https://www.${domain}/dp/${item.final_asin}` : '');

            return (
              <div
                key={`mob-${item.asin}-${idx}`}
                className="animate-fade-in"
                style={{
                  backgroundColor: getRowBg(item.status),
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                {/* Row 1: ASIN + Status + Cached */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <a
                    href={linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                    style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: 'var(--text-main)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{item.asin}</span>
                    <ExternalLink size={12} style={{ opacity: 0.6 }} />
                  </a>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {getStatusBadge(item.status)}
                    {getCachedBadge(item)}
                  </div>
                </div>

                {/* Row 2: Redirect arrow diff if REDIRECTED */}
                {isRedirected && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    alignSelf: 'flex-start',
                    gap: '0.4rem',
                    backgroundColor: 'var(--bg-surface)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--status-redirect-border)',
                    fontSize: '0.82rem',
                  }}>
                    <span className="mono" style={{ color: 'var(--text-muted)' }}>{item.asin}</span>
                    <ArrowRight size={13} style={{ color: 'var(--status-redirect)' }} />
                    {item.final_asin ? (
                      <a
                        href={landedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mono"
                        style={{ fontWeight: 800, color: 'var(--status-redirect)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                      >
                        <span>{item.final_asin}</span>
                        <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span style={{ color: 'var(--status-redirect)', fontWeight: 600 }}>Non-product page</span>
                    )}
                  </div>
                )}

                {/* Row 3: Title */}
                <div style={{
                  fontSize: '0.84rem',
                  color: item.title ? 'var(--text-main)' : 'var(--text-dim)',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}>
                  {item.title || '(No page title extracted)'}
                </div>

                {/* Row 4: Note */}
                {item.note && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                    {item.note}
                  </div>
                )}

                {/* Row 5: Touch-friendly Mobile Actions */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.45rem',
                  paddingTop: '0.35rem',
                  borderTop: '1px solid var(--border-color)',
                }}>
                  <button
                    type="button"
                    onClick={() => handleCopyLink(landedUrl || linkUrl, item.asin)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 9px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: copiedAsin === item.asin ? 'var(--status-ok)' : 'var(--text-muted)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    {copiedAsin === item.asin ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedAsin === item.asin ? 'Copied' : 'Copy'}</span>
                  </button>

                  <a
                    href={landedUrl || linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 9px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-muted)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={13} />
                    <span>Open</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => onRecheckSingle(item.asin, true)}
                    disabled={isRunning}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 9px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--primary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>{item.cached ? 'Force' : 'Re-check'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
