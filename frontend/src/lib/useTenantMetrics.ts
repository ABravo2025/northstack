import { useEffect, useState } from 'react';
import { api, type TenantMetricsOverview } from '../api';

// Shared by /overview's stat strip and every /dashboards category page — all
// six read from the same combined endpoint, so the fetch/loading boilerplate
// lives here once instead of six times.
export function useTenantMetrics(token: string) {
  const [metrics, setMetrics] = useState<TenantMetricsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getTenantMetricsOverview(token)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return { metrics, loading };
}
