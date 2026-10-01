import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

// 2026-10: the 7 old sections collapsed into 3 views — "mine" (My Timeoff + My Requests),
// "team" (Approvals + Balances + All Requests, for managers and admins) and "policies"
// (Policies + Assignments, admins).
export type TimeOffTab = 'mine' | 'team' | 'policies';

interface TimeOffTabContextValue {
  tab: TimeOffTab;
  setTab: (tab: TimeOffTab) => void;
  pendingApprovalsCount: number;
  setPendingApprovalsCount: (count: number) => void;
  // Whether "Team" applies to this person — admins, anyone with direct reports, or anyone with
  // requests waiting on them. Only the page knows (it loads that data), so it publishes it here
  // for the sidebar.
  showTeam: boolean;
  setShowTeam: (show: boolean) => void;
}

const TimeOffTabContext = createContext<TimeOffTabContextValue | null>(null);

// Time Off's sections aren't routes (unlike Settings/Dashboards) — they're a `tab` state
// TimeOffOverviewPage owns. The switcher lives in TimeOffSidebar (a sibling of <Outlet>, see
// AppLayout.tsx), so the page and the sidebar need a shared place to read/write it from, the
// same problem PrimaryActionContext solves for the mobile FAB (2026-09-09).
export function TimeOffTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TimeOffTab>('mine');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [showTeam, setShowTeam] = useState(false);
  const value = useMemo(
    () => ({ tab, setTab, pendingApprovalsCount, setPendingApprovalsCount, showTeam, setShowTeam }),
    [tab, pendingApprovalsCount, showTeam],
  );
  return <TimeOffTabContext.Provider value={value}>{children}</TimeOffTabContext.Provider>;
}

export function useTimeOffTab(): TimeOffTabContextValue {
  const ctx = useContext(TimeOffTabContext);
  if (!ctx) throw new Error('useTimeOffTab must be used within a TimeOffTabProvider');
  return ctx;
}
