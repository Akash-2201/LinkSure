import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { StatusStrip } from './components/StatusStrip';
import { ProgressBar } from './components/ProgressBar';
import { BlockedWarning } from './components/BlockedWarning';
import { BulkActions } from './components/BulkActions';
import { ResultsTable } from './components/ResultsTable';
import { HistoryDrawer } from './components/HistoryDrawer';
import { computeCounts } from './utils/counts';
import { apiUrl } from './utils/api';
import { 
  CheckResult, 
  ParseSummary, 
  RunHistoryItem, 
  SpeedPreset, 
  StatusType 
} from './types';

const SAMPLE_IDS = [
  'B0DS8PP26V',
  'B0DSG16349',
  'B0DSLB1778',
  'B0FSN4SK8T',
  'B0DTHPWFWK',
  'B0DTV21KQQ',
  'B0FFGZK7ZG',
  'B0H26YWBMX',
].join('\n');

const INITIAL_PARSE: ParseSummary = {
  unique_asins: [],
  total_found: 0,
  duplicates_count: 0,
  duplicates: [],
  invalid_skipped: [],
  invalid_count: 0,
};

export const App: React.FC = () => {
  // Theme management
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('linksure_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('linksure_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Server health & Render cold-start state
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [serverState, setServerState] = useState<'checking' | 'waking' | 'ready'>('checking');

  const checkServerHealth = useCallback(async () => {
    let wakeTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      setServerState((prev) => (prev !== 'ready' ? 'waking' : prev));
    }, 1000);

    try {
      const res = await fetch(apiUrl('/api/health'));
      if (wakeTimer) clearTimeout(wakeTimer);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.demo_mode === 'boolean') {
          setDemoMode(data.demo_mode);
        }
        setServerState('ready');
        return true;
      }
      setServerState('waking');
      return false;
    } catch {
      if (wakeTimer) clearTimeout(wakeTimer);
      setServerState('waking');
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const ok = await checkServerHealth();
      if (!ok && active) {
        retryTimer = setTimeout(poll, 3500);
      }
    };
    poll();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [checkServerHealth]);

  // Input & Configuration state
  const [inputText, setInputText] = useState<string>('');
  const [parseSummary, setParseSummary] = useState<ParseSummary>(INITIAL_PARSE);
  const [domain, setDomain] = useState<string>('amazon.in');
  const [speed, setSpeed] = useState<SpeedPreset>('careful');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Active check execution state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [totalToCheck, setTotalToCheck] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<StatusType | 'ALL'>('ALL');

  // Summary counts computed directly from the results array so they can NEVER disagree
  const counts = useMemo(() => computeCounts(results), [results]);
  const completedCount = results.length;

  // History & Drawer state
  const [history, setHistory] = useState<RunHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('linksure_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const sseRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Debounced input parsing (local fallback if server is waking up, synced with /api/parse)
  useEffect(() => {
    if (!inputText.trim()) {
      setParseSummary(INITIAL_PARSE);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(apiUrl('/api/parse'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: inputText }),
        });
        if (resp.ok) {
          const data: ParseSummary = await resp.json();
          setParseSummary(data);
          return;
        }
      } catch {
        // Fallback local regex parsing while server wakes up
      }
      const tokens = inputText.match(/[A-Z0-9]{10}/gi) || [];
      const seen = new Set<string>();
      const unique: string[] = [];
      let dups = 0;
      tokens.forEach((t) => {
        const up = t.toUpperCase();
        if (seen.has(up)) {
          dups++;
        } else {
          seen.add(up);
          unique.push(up);
        }
      });
      setParseSummary({
        unique_asins: unique,
        total_found: unique.length,
        duplicates_count: dups,
        duplicates: [],
        invalid_skipped: [],
        invalid_count: 0,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [inputText]);

  useEffect(() => {
    return () => {
      if (sseRef.current) sseRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const saveToHistory = useCallback((newRun: RunHistoryItem) => {
    setHistory((prev) => {
      const updated = [newRun, ...prev.filter((item) => item.id !== newRun.id)].slice(0, 10);
      try {
        localStorage.setItem('linksure_history', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save history', e);
      }
      return updated;
    });
  }, []);

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('linksure_history');
    } catch {}
  };

  const handleLoadRun = (run: RunHistoryItem) => {
    if (isRunning) return;
    setActiveJobId(run.id);
    setResults(run.results);
    setTotalToCheck(run.total);
    setDomain(run.domain);
    setSpeed(run.speed === 'slow' ? 'careful' : run.speed);
    setActiveFilter('ALL');
    setErrorBanner(null);
  };

  const handleStartCheck = async (
    overrideAsins?: string[],
    options?: { speedOverride?: SpeedPreset; forceRecheck?: boolean }
  ) => {
    const asinsToCheck = overrideAsins || parseSummary.unique_asins;
    if (asinsToCheck.length === 0 || isRunning) return;

    const effectiveSpeed = options?.speedOverride || speed;
    const forceRecheck = options?.forceRecheck ?? false;

    setErrorBanner(null);
    setResults([]);
    setTotalToCheck(asinsToCheck.length);
    setElapsedSeconds(0);
    setIsRunning(true);
    setActiveFilter('ALL');

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    try {
      const response = await fetch(apiUrl('/api/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asins: asinsToCheck,
          domain,
          speed: effectiveSpeed,
          force_recheck: forceRecheck,
        }),
      });

      if (!response.ok) {
        let detail = `Server returned HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.detail) detail = errData.detail;
        } catch {}
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          setServerState('waking');
          detail = 'Server is waking up (~30s). Please wait a moment and try again.';
        }
        throw new Error(detail);
      }

      setServerState('ready');
      const data = await response.json();
      const job_id: string = data.job_id;
      if (typeof data.demo_mode === 'boolean') {
        setDemoMode(data.demo_mode);
      }
      setActiveJobId(job_id);

      if (sseRef.current) sseRef.current.close();
      const sse = new EventSource(apiUrl(`/api/jobs/${job_id}/stream`));
      sseRef.current = sse;

      const mergeResults = (prev: CheckResult[], incoming: CheckResult[]): CheckResult[] => {
        const seen = new Set(prev.map((r) => r.asin));
        const next = [...prev];
        for (const item of incoming) {
          if (!seen.has(item.asin)) {
            seen.add(item.asin);
            next.push(item);
          }
        }
        return next;
      };

      sse.addEventListener('init', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (Array.isArray(payload.existing_results) && payload.existing_results.length > 0) {
            setResults((prev) => mergeResults(prev, payload.existing_results));
          }
        } catch (e) {
          console.error('Error parsing SSE init event', e);
        }
      });

      sse.addEventListener('result', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.result) {
            setResults((prev) => mergeResults(prev, [payload.result]));
          }
        } catch (e) {
          console.error('Error parsing SSE result event', e);
        }
      });

      sse.addEventListener('done', () => {
        setIsRunning(false);
        if (timerRef.current) clearInterval(timerRef.current);
        sse.close();

        setResults((currentResults) => {
          const newHistoryItem: RunHistoryItem = {
            id: job_id,
            timestamp: new Date().toISOString(),
            domain,
            speed: effectiveSpeed,
            total: asinsToCheck.length,
            counts: computeCounts(currentResults),
            results: currentResults,
            asins: asinsToCheck,
          };
          saveToHistory(newHistoryItem);
          return currentResults;
        });
      });

      sse.onerror = () => {
        setIsRunning(false);
        if (timerRef.current) clearInterval(timerRef.current);
        sse.close();
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initiate check job';
      setErrorBanner(msg);
      setIsRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      await fetch(apiUrl(`/api/jobs/${activeJobId}/cancel`), { method: 'POST' });
    } catch (e) {
      console.error('Error cancelling job', e);
    }
    if (sseRef.current) sseRef.current.close();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
  };

  const handleDownloadCsv = () => {
    if (activeJobId) {
      window.open(apiUrl(`/api/jobs/${activeJobId}/export.csv`), '_blank');
    } else if (results.length > 0) {
      const cols = ['asin', 'status', 'start_url', 'final_url', 'final_asin', 'http', 'title', 'note', 'cached'];
      const rows = [cols.join(',')];
      for (const r of results) {
        rows.push([
          `"${r.asin}"`,
          `"${r.status}"`,
          `"${r.start_url}"`,
          `"${r.final_url}"`,
          `"${r.final_asin}"`,
          `"${r.http_status || ''}"`,
          `"${(r.title || '').replace(/"/g, '""')}"`,
          `"${(r.note || '').replace(/"/g, '""')}"`,
          `"${Boolean(r.cached)}"`,
        ].join(','));
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linksure_export_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleRecheckSingle = (asin: string, forceRecheck = true) => {
    handleStartCheck([asin], { forceRecheck });
  };

  const handleRecheckBlocked = (asinsToRecheck: string[]) => {
    handleStartCheck(asinsToRecheck, { speedOverride: 'slow', forceRecheck: true });
  };

  const handleForceRecheckAll = (asinsToRecheck: string[]) => {
    handleStartCheck(asinsToRecheck, { forceRecheck: true });
  };

  return (
    <div className="container">
      {/* Header */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        demoMode={demoMode}
        historyCount={history.length}
        onOpenHistory={() => setIsHistoryOpen(true)}
      />

      {/* Friendly Cold Start Banner for Render Free Tier */}
      {serverState === 'waking' && (
        <div
          role="status"
          className="animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.6rem',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--primary-subtle)',
            border: '1px solid var(--primary-border)',
            color: 'var(--primary)',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Loader2 size={17} className="animate-spin" style={{ flexShrink: 0 }} />
            <span>Waking up the server (~30s) — free cloud backend spins down when idle.</span>
          </div>
          <button
            type="button"
            onClick={() => checkServerHealth()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.78rem',
              padding: '4px 9px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--primary-border)',
              color: 'var(--primary)',
              fontWeight: 600,
            }}
          >
            <RefreshCw size={12} />
            <span>Retry ping</span>
          </button>
        </div>
      )}

      {/* API / Quota Error Banner */}
      {errorBanner && (
        <div
          role="alert"
          className="animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.8rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--status-notfound-bg)',
            border: '1px solid var(--status-notfound-border)',
            color: 'var(--status-notfound)',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Main Input Section */}
      <InputSection
        inputText={inputText}
        onChangeText={setInputText}
        parseSummary={parseSummary}
        domain={domain}
        onChangeDomain={setDomain}
        speed={speed}
        onChangeSpeed={setSpeed}
        onStartCheck={() => handleStartCheck()}
        isRunning={isRunning}
        onLoadSample={() => setInputText(SAMPLE_IDS)}
      />

      {/* Live Progress Bar */}
      {(isRunning || results.length > 0) && (
        <ProgressBar
          completed={completedCount}
          total={totalToCheck || results.length}
          elapsedSeconds={elapsedSeconds}
          isRunning={isRunning}
          onCancel={handleCancel}
        />
      )}

      {/* Blocked Rate Indicator & Honest Blocked Explanation */}
      <BlockedWarning
        results={results}
        isRunning={isRunning}
        onRecheckBlockedOnly={handleRecheckBlocked}
      />

      {/* Status Summary Strip (Clickable Filters) */}
      {results.length > 0 && (
        <StatusStrip
          total={results.length}
          counts={counts}
          activeFilter={activeFilter}
          onSelectFilter={setActiveFilter}
        />
      )}

      {/* Bulk Action Toolbar */}
      <BulkActions
        results={results}
        domain={domain}
        onDownloadCsv={handleDownloadCsv}
        onRecheckBlocked={handleRecheckBlocked}
        onForceRecheckAll={handleForceRecheckAll}
        isRunning={isRunning}
      />

      {/* Results Table / Mobile Cards */}
      <ResultsTable
        results={results}
        activeFilter={activeFilter}
        domain={domain}
        onRecheckSingle={handleRecheckSingle}
        isRunning={isRunning}
      />

      {/* History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onLoadRun={handleLoadRun}
        onClearHistory={handleClearHistory}
      />
    </div>
  );
};
