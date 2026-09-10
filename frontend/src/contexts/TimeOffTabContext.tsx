import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type TimeOffTab = 'my-timeoff' | 'my-requests' | 'approvals' | 'balances' | 'all-requests' | 'policies' | 'assignments';

interface TimeOffTabContextValue {
  tab: TimeOffTab;
  setTab: (tab: TimeOffTab) => void;
  pendingApprovalsCount: number;
  setPendingApprovalsCount: (count: number) => void;
}

const TimeOffTabContext = createContext<TimeOffTabContextValue | null>(null);

// Time Off's 7 sections aren't routes (unlike Settings/Dashboards) — they're
// a `tab` state TimeOffOverviewPage owns. Moving the switcher into
// TimeOffSidebar (a sibling of <Outlet>, see AppLayout.tsx) means the page
// and the sidebar need a shared place to read/write it from, the same
// problem PrimaryActionContext solves for the mobile FAB (2026-09-09).
export function TimeOffTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TimeOffTab>('my-timeoff');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const value = useMemo(
    () => ({ tab, setTab, pendingApprovalsCount, setPendingApprovalsCount }),
    [tab, pendingApprovalsCount],
  );
  return <TimeOffTabContext.Provider value={value}>{children}</TimeOffTabContext.Provider>;
}

export function useTimeOffTab(): TimeOffTabContextValue {
  const ctx = useContext(TimeOffTabContext);
  if (!ctx) throw new Error('useTimeOffTab must be used within a TimeOffTabProvider');
  return ctx;
}
