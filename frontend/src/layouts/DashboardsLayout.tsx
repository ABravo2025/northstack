import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import DateRangeFilter, { DEFAULT_PRESET, rangeForPreset } from '../components/metrics/DateRangeFilter';
import type { DateRange, PresetKey } from '../lib/dateRangePresets';

interface DashboardsLayoutProps {
  user: any;
  token: string;
}

export interface DashboardsOutletContext {
  token: string;
  range: DateRange;
}

const CATEGORIES = [
  { to: '/dashboards/hr', label: 'HR' },
  { to: '/dashboards/time-off', label: 'Time Off' },
  { to: '/dashboards/payroll', label: 'Payroll', ownerOnly: true },
  { to: '/dashboards/sales', label: 'Sales' },
  { to: '/dashboards/tasks', label: 'Tasks' },
  { to: '/dashboards/adoption', label: 'Adoption' },
];

// Mirrors WorkspaceSettingsLayout's parent-route-with-Outlet pattern, but with
// route-driven tabs (.view-tab, same class Opportunities uses for its
// per-Pipeline tabs) instead of a tile grid — each category is its own URL.
// The date range lives here, not per-page: dataviz's filter-composition rule
// is "one row above the content, scopes everything below it" — switching
// tabs must not reset your selected range, so it's lifted to the layout and
// handed down via Outlet context instead of each page owning its own copy.
export default function DashboardsLayout({ user, token }: DashboardsLayoutProps) {
  const isOwner = user?.role === 'owner';
  const categories = CATEGORIES.filter((c) => !c.ownerOnly || isOwner);

  const [presetKey, setPresetKey] = useState<PresetKey>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => rangeForPreset(DEFAULT_PRESET));

  const handleRangeChange = (nextRange: DateRange, nextPreset: PresetKey) => {
    setRange(nextRange);
    setPresetKey(nextPreset);
  };

  return (
    <div className="page-full">
      <div className="page-toolbar">
        <h2 className="text-xl font-semibold">Dashboards</h2>
        <div className="ml-auto">
          <DateRangeFilter presetKey={presetKey} range={range} onChange={handleRangeChange} />
        </div>
      </div>
      <div className="mb-4 flex gap-1 border-b border-line dark:border-dark-line">
        {categories.map((c) => (
          <NavLink key={c.to} to={c.to} className={({ isActive }) => `view-tab${isActive ? ' active' : ''}`}>
            {c.label}
          </NavLink>
        ))}
      </div>
      <Outlet context={{ token, range } satisfies DashboardsOutletContext} />
    </div>
  );
}
