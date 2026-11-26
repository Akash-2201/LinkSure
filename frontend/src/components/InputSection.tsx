import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { 
  Upload, 
  Play, 
  Trash2, 
  Globe, 
  Gauge, 
  ChevronDown, 
  ChevronUp, 
  Sparkles 
} from 'lucide-react';
import { ParseSummary, SpeedPreset } from '../types';

interface InputSectionProps {
  inputText: string;
  onChangeText: (text: string) => void;
  parseSummary: ParseSummary;
  domain: string;
  onChangeDomain: (domain: string) => void;
  speed: SpeedPreset;
  onChangeSpeed: (speed: SpeedPreset) => void;
  onStartCheck: () => void;
  isRunning: boolean;
  onLoadSample: () => void;
}

const DOMAINS = [
  { value: 'amazon.in', label: 'amazon.in (India - Default)' },
  { value: 'amazon.com', label: 'amazon.com (US)' },
  { value: 'amazon.co.uk', label: 'amazon.co.uk (UK)' },
  { value: 'amazon.de', label: 'amazon.de (Germany)' },
  { value: 'amazon.ca', label: 'amazon.ca (Canada)' },
  { value: 'amazon.co.jp', label: 'amazon.co.jp (Japan)' },
  { value: 'amazon.fr', label: 'amazon.fr (France)' },
  { value: 'amazon.es', label: 'amazon.es (Spain)' },
  { value: 'amazon.it', label: 'amazon.it (Italy)' },
];

export const InputSection: React.FC<InputSectionProps> = ({
  inputText,
  onChangeText,
  parseSummary,
  domain,
  onChangeDomain,
  speed,
  onChangeSpeed,
  onStartCheck,
  isRunning,
  onLoadSample,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showInvalid, setShowInvalid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      readFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      readFile(e.target.files[0]);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onChangeText(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <section style={{
      backgroundColor: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
      padding: '1.25rem',
      boxShadow: 'var(--shadow-sm)',
      marginBottom: '1.75rem',
    }}>
      {/* Dropzone & Textarea Wrapper */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-md)',
          border: isDragging ? '2px dashed var(--primary)' : '1px solid var(--border-color)',
          backgroundColor: isDragging ? 'var(--primary-subtle)' : 'var(--bg-app)',
          transition: 'all 0.2s ease',
        }}
      >
        <textarea
          value={inputText}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder="Paste Amazon ASINs or URLs here... (e.g., B0F6ZG4YKF, https://www.amazon.in/dp/B0DVZ845X5, comma separated, or drag & drop a .txt/.csv file)"
          rows={5}
          disabled={isRunning}
          style={{
            width: '100%',
            padding: '0.85rem 1rem',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            resize: 'vertical',
            fontSize: '0.88rem',
            lineHeight: 1.5,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-main)',
          }}
        />

        {/* Drag Overlay Hint */}
        {isDragging && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--primary-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--primary)',
            fontWeight: 600,
            fontSize: '1rem',
            gap: '0.5rem',
            pointerEvents: 'none',
          }}>
            <Upload size={22} />
            <span>Drop .txt or .csv file here</span>
          </div>
        )}
      </div>

      {/* Parse Summary Strip */}
      <div style={{
        marginTop: '0.85rem',
        padding: '0.65rem 0.9rem',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: parseSummary.total_found > 0 ? 'var(--bg-subtle)' : 'transparent',
        border: parseSummary.total_found > 0 ? '1px solid var(--border-color)' : 'none',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
        fontSize: '0.84rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
            Found <strong style={{ color: 'var(--primary)' }}>{parseSummary.total_found}</strong> unique {parseSummary.total_found === 1 ? 'ID' : 'IDs'}
          </span>

          {parseSummary.duplicates_count > 0 && (
            <span style={{
              color: 'var(--status-redirect)',
              backgroundColor: 'var(--status-redirect-bg)',
              border: '1px solid var(--status-redirect-border)',
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}>
              {parseSummary.duplicates_count} {parseSummary.duplicates_count === 1 ? 'duplicate' : 'duplicates'} removed
            </span>
          )}

          {parseSummary.invalid_count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{
                color: 'var(--text-muted)',
                backgroundColor: 'var(--border-color)',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}>
                {parseSummary.invalid_count} invalid skipped
              </span>
              <button
                type="button"
                onClick={() => setShowInvalid(!showInvalid)}
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                {showInvalid ? 'Hide' : 'Review'}
                {showInvalid ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          )}
        </div>

        {/* File upload trigger & Sample button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".txt,.csv"
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRunning}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <Upload size={13} />
            <span>Upload File</span>
          </button>

          <button
            type="button"
            onClick={onLoadSample}
            disabled={isRunning}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              color: 'var(--primary)',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--primary-border)',
              backgroundColor: 'var(--primary-subtle)',
            }}
          >
            <Sparkles size={13} />
            <span>Load Sample (8 IDs)</span>
          </button>

          {inputText.trim() && (
            <button
              type="button"
              onClick={() => onChangeText('')}
              disabled={isRunning}
              title="Clear input"
              style={{
                color: 'var(--text-dim)',
                padding: '4px',
                borderRadius: '4px',
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Expandable Invalid Tokens List */}
      {showInvalid && parseSummary.invalid_skipped.length > 0 && (
        <div className="animate-fade-in" style={{
          marginTop: '0.65rem',
          padding: '0.75rem',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--status-notfound-bg)',
          border: '1px solid var(--status-notfound-border)',
          fontSize: '0.8rem',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--status-notfound)', marginBottom: '0.4rem' }}>
            Skipped non-ASIN tokens:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {parseSummary.invalid_skipped.map((tok, i) => (
              <span key={i} className="mono" style={{
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                fontSize: '0.76rem',
              }}>
                {tok}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Configuration & Action Bar */}
      <div style={{
        marginTop: '1.25rem',
        paddingTop: '1.25rem',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.25rem' }}>
          {/* Domain Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Globe size={16} style={{ color: 'var(--text-muted)' }} />
            <label htmlFor="domain-select" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Amazon Region:
            </label>
            <select
              id="domain-select"
              value={domain}
              onChange={(e) => onChangeDomain(e.target.value)}
              disabled={isRunning}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-app)',
                color: 'var(--text-main)',
                fontSize: '0.84rem',
                fontWeight: 500,
                maxWidth: '100%',
              }}
            >
              {DOMAINS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Speed Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Gauge size={16} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Speed:
            </span>
            <div style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              padding: '2px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
            }}>
              {(['careful', 'normal', 'fast'] as SpeedPreset[]).map((sp) => {
                const isActive = speed === sp;
                const isCareful = sp === 'careful';
                return (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => onChangeSpeed(sp)}
                    disabled={isRunning}
                    title={
                      isCareful 
                        ? "Careful (Default): 1.5-3.0s delay, concurrency 3. Recommended to avoid Amazon bot blocks." 
                        : sp === 'normal' 
                          ? "Normal: 0.8-1.5s delay, concurrency 3." 
                          : "Fast: 0.2-0.6s delay, concurrency 5."
                    }
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      fontWeight: isActive ? 700 : 500,
                      borderRadius: '4px',
                      backgroundColor: isActive ? 'var(--bg-surface)' : 'transparent',
                      color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                      boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                      textTransform: 'capitalize',
                    }}
                  >
                    {sp} {isCareful && '(Default)'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Start Button & Max 100 IDs Warning */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {parseSummary.total_found > 100 && (
            <span style={{ fontSize: '0.8rem', color: 'var(--status-notfound)', fontWeight: 600 }}>
              Max 100 IDs per request ({parseSummary.total_found} found)
            </span>
          )}
          <button
            type="button"
            onClick={onStartCheck}
            disabled={isRunning || parseSummary.total_found === 0 || parseSummary.total_found > 100}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '8px 20px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor:
                parseSummary.total_found > 0 && parseSummary.total_found <= 100 && !isRunning
                  ? 'var(--primary)'
                  : 'var(--border-strong)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.9rem',
              boxShadow:
                parseSummary.total_found > 0 && parseSummary.total_found <= 100 && !isRunning
                  ? 'var(--shadow-md)'
                  : 'none',
              cursor:
                parseSummary.total_found > 0 && parseSummary.total_found <= 100 && !isRunning
                  ? 'pointer'
                  : 'not-allowed',
            }}
          >
            <Play size={16} fill="currentColor" />
            <span>Check {parseSummary.total_found > 0 ? `${parseSummary.total_found} Links` : 'Links'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
