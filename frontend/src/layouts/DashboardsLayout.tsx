import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import DateRangeFilter, { DEFAULT_PRESET, rangeForPreset } from '../components/metrics/DateRangeFilter';
import type { DateRange, PresetKey } from '../lib/dateRangePresets';
import { getDashboardSections } from '../lib/dashboardsSections';
import { usePermissions } from '../contexts/PermissionsContext';

interface DashboardsLayoutProps {
  token: string;
}

export interface DashboardsOutletContext {
  token: string;
  range: DateRange;
}

// Mirrors WorkspaceSettingsLayout's index-vs-subpage split: /dashboards
// itself shows the tile grid (DashboardsHomePage), while a category route
// shows that category's title plus the shared date range filter. Moving
// between categories now happens via DashboardsSidebar (swapped in for the
// main Sidebar, see AppLayout.tsx) instead of the in-page .view-tab strip
// this used to render here — Alejandro found the tab strip cramped with 6
// tabs on mobile and asked for the Settings-style pattern instead
// (2026-09-09). The date range still lives here, not per-page, so switching
// categories doesn't reset your selected range.
export default function DashboardsLayout({ token }: DashboardsLayoutProps) {
  const location = useLocation();
  const permissions = usePermissions();
  const sections = getDashboardSections(permissions);
  const isIndex = location.pathname === '/dashboards' || location.pathname === '/dashboards/';
  const active = sections.find((s) => location.pathname.startsWith(s.to));

  const [presetKey, setPresetKey] = useState<PresetKey>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => rangeForPreset(DEFAULT_PRESET));

  const handleRangeChange = (nextRange: DateRange, nextPreset: PresetKey) => {
    setRange(nextRange);
    setPresetKey(nextPreset);
  };

  return (
    <div className="page-full">
      {isIndex ? (
        <h2 className="mb-5 text-xl font-semibold">Dashboards</h2>
      ) : (
        <div className="page-toolbar">
          <h2 className="text-xl font-semibold">{active?.label ?? 'Dashboards'}</h2>
          <div className="ml-auto">
            <DateRangeFilter presetKey={presetKey} range={range} onChange={handleRangeChange} />
          </div>
        </div>
      )}
      {!isIndex && !active ? (
        // Route guard for direct URL navigation (e.g. a Member without view_dashboards typing
        // /dashboards/hr in the address bar) — `sections` is already filtered by
        // getDashboardSections/usePermissions, so a pathname that doesn't match anything in it is
        // either an unknown route or one this role isn't allowed to see. Bails out here instead of
        // rendering <Outlet>, so the page component's useTenantMetrics never even fires.
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">This dashboard isn't visible to your role.</p>
      ) : (
        <Outlet context={{ token, range } satisfies DashboardsOutletContext} />
      )}
    </div>
  );
}
