import React, { useState } from 'react';
import { 
  Link2, 
  Sun, 
  Moon, 
  History, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle,
  Info
} from 'lucide-react';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  demoMode: boolean;
  historyCount: number;
  onOpenHistory: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  demoMode,
  historyCount,
  onOpenHistory,
}) => {
  const [showExplainer, setShowExplainer] = useState(false);

  return (
    <header style={{ marginBottom: '1.75rem' }}>
      {/* Loud Demo Banner — shown ONLY when backend has DEMO_MODE=1 env var set */}
      {demoMode && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.85rem 1.1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--status-notfound)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            boxShadow: 'var(--shadow-md)',
            letterSpacing: '0.02em',
          }}
        >
          <AlertTriangle size={20} />
          <span>DEMO MODE - results are fake (serving local mock responses via DEMO_MODE=1)</span>
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid var(--border-color)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'var(--primary)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <Link2 size={24} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 className="display" style={{
                fontSize: '1.45rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}>
                LinkSure
              </h1>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                padding: '2px 7px',
                borderRadius: '6px',
                backgroundColor: 'var(--primary-subtle)',
                color: 'var(--primary)',
                border: '1px solid var(--primary-border)',
              }}>
                ASIN Verifier
              </span>
            </div>
            <p style={{
              fontSize: '0.86rem',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}>
              Detect silent Amazon variant redirects, canonical mismatches &amp; broken links
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* History Drawer Button */}
          <button
            onClick={onOpenHistory}
            title="View last 10 runs history"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.82rem',
              fontWeight: 500,
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
            }}
          >
            <History size={16} />
            <span>History</span>
            {historyCount > 0 && (
              <span style={{
                fontSize: '0.72rem',
                padding: '1px 6px',
                borderRadius: '999px',
                backgroundColor: 'var(--primary-subtle)',
                color: 'var(--primary)',
                fontWeight: 700,
              }}>
                {historyCount}
              </span>
            )}
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            aria-label="Toggle color theme"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </div>

      {/* Explainer / How It Works Strip */}
      <div style={{
        marginTop: '0.85rem',
        padding: '0.65rem 0.9rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-subtle)',
        border: '1px solid var(--border-color)',
        fontSize: '0.85rem',
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span>
              <strong>How it works:</strong> Paste ASINs or URLs. LinkSure inspects the live HTTP response &amp; canonical HTML tags to verify if the link lands on the exact product listing you intended.
            </span>
          </div>

          <button
            onClick={() => setShowExplainer(!showExplainer)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--primary)',
              cursor: 'pointer',
              background: 'none',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            <span>Why did this redirect?</span>
            {showExplainer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Collapsible Explainer Content */}
        {showExplainer && (
          <div className="animate-fade-in" style={{
            marginTop: '0.5rem',
            paddingTop: '0.65rem',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.82rem',
            lineHeight: 1.6,
            color: 'var(--text-muted)',
          }}>
            <p style={{ marginBottom: '0.4rem' }}>
              <strong>Why Amazon silently redirects product links:</strong>
            </p>
            <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <li>
                <strong>Variant Consolidation:</strong> Amazon often merges child ASINs (color/size/pack variants) into a single master canonical listing. The original URL may redirect (via HTTP 301/302 or HTML canonical tags) to a different ASIN (e.g. <span className="mono">B0F6ZG4YKF &rarr; B0F715G4NF</span>).
              </li>
              <li>
                <strong>Stock &amp; Buy-Box Exhaustion:</strong> When an exact variant sells out, Amazon will frequently redirect shoppers to an in-stock sibling variant rather than 404ing.
              </li>
              <li>
                <strong>De-listed Listings:</strong> If a seller re-lists an item or deletes a SKU, Amazon routes the old ASIN to search results or the Amazon homepage.
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
};
