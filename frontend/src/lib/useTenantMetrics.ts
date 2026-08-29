import { useEffect, useState } from 'react';
import { api, type TenantMetricsOverview } from '../api';
import type { DateRange } from './dateRangePresets';

// Shared by /overview's stat strip and every /dashboards category page — all
// six read from the same combined endpoint, so the fetch/loading boilerplate
// lives here once instead of six times. On a range change, the previous
// `metrics` value is left in place while the new request is in flight (never
// reset to null) — dataviz's "refetch keeps the frame" rule: charts hold
// their last render instead of flashing back to a loading state.
export function useTenantMetrics(token: string, range?: DateRange) {
  const [metrics, setMetrics] = useState<TenantMetricsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getTenantMetricsOverview(token, range)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, range?.since?.getTime(), range?.until?.getTime()]);

  return { metrics, loading };
}
