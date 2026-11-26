import { CheckResult, StatusCounts } from '../types';

export function computeCounts(results: CheckResult[]): StatusCounts {
  const counts: StatusCounts = {
    OK: 0,
    REDIRECTED: 0,
    NOT_FOUND: 0,
    BLOCKED: 0,
    ERROR: 0,
  };
  for (const r of results) {
    if (r.status in counts) {
      counts[r.status] += 1;
    }
  }
  return counts;
}
