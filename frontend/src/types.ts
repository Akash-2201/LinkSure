export type StatusType = 'OK' | 'REDIRECTED' | 'NOT_FOUND' | 'BLOCKED' | 'ERROR';

export type SpeedPreset = 'slow' | 'careful' | 'normal' | 'fast';

export interface ParseSummary {
  unique_asins: string[];
  total_found: number;
  duplicates_count: number;
  duplicates: string[];
  invalid_skipped: string[];
  invalid_count: number;
}

export interface CheckResult {
  asin: string;
  start_url: string;
  final_url: string;
  final_asin: string;
  status: StatusType;
  http_status: number | null;
  title: string;
  note: string;
  duration_ms: number;
  checked_at: string;
  cached?: boolean;
  cached_at?: string;
  fetch_provider?: string;
}

export interface StatusCounts {
  OK: number;
  REDIRECTED: number;
  NOT_FOUND: number;
  BLOCKED: number;
  ERROR: number;
}

export interface JobProgress {
  completed: number;
  total: number;
  counts: StatusCounts;
  cancelled?: boolean;
}

export interface RunHistoryItem {
  id: string;
  timestamp: string;
  domain: string;
  speed: SpeedPreset;
  total: number;
  counts: StatusCounts;
  results: CheckResult[];
  asins: string[];
}
