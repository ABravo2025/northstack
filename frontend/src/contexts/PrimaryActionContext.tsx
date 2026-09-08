import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface PrimaryAction {
  label: string;
  onClick: () => void;
}

interface PrimaryActionContextValue {
  action: PrimaryAction | null;
  setAction: (action: PrimaryAction | null) => void;
}

const PrimaryActionContext = createContext<PrimaryActionContextValue | null>(null);

export function PrimaryActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<PrimaryAction | null>(null);
  // Memoized so a re-render of AppLayout for an unrelated reason (mobileSidebarOpen, location,
  // tenant, ...) doesn't hand every context consumer a new object identity — see the dependency
  // note in usePrimaryAction below for why an unstable context value here is more than just a
  // wasted render.
  const value = useMemo(() => ({ action, setAction }), [action]);
  return <PrimaryActionContext.Provider value={value}>{children}</PrimaryActionContext.Provider>;
}

// Consumed by PrimaryActionFab to render the mobile FAB — pages register via usePrimaryAction
// below, not this.
export function usePrimaryActionValue(): PrimaryAction | null {
  const ctx = useContext(PrimaryActionContext);
  if (!ctx) throw new Error('usePrimaryActionValue must be used within a PrimaryActionProvider');
  return ctx.action;
}

// A page calls this with its main "Add X" handler (the same one its toolbar/EmptyState button
// already uses) to put it behind the mobile FAB too. Cleared automatically on unmount or when the
// action changes, so navigating away never leaves the FAB pointing at a different page's handler.
// Pass null (or omit the call) on pages with no single primary action — dashboards, detail views,
// settings forms — and no FAB renders.
//
// The registration effect deliberately does NOT depend on `action.onClick` itself, only on
// `action.label` (and whether an action is registered at all). A page's onClick is normally a
// plain function defined in its render body, so it's a new reference on every render — depending
// on it here would re-run this effect, and therefore call setAction, on every single render of
// the calling page. Because this hook also reads the same context (for `setAction`), that
// setAction call re-renders the page itself via context propagation, which produces yet another
// new onClick reference, which re-fires the effect again: an infinite render loop that hangs the
// tab (found 2026-09-08 — tapping into any page that calls this hook froze the app). A ref always
// holds the latest onClick without needing the effect to re-run for it.
export function usePrimaryAction(action: PrimaryAction | null): void {
  const ctx = useContext(PrimaryActionContext);
  if (!ctx) throw new Error('usePrimaryAction must be used within a PrimaryActionProvider');
  const { setAction } = ctx;

  const actionRef = useRef(action);
  actionRef.current = action;

  const label = action?.label;
  useEffect(() => {
    if (!label) {
      setAction(null);
      return;
    }
    setAction({ label, onClick: () => actionRef.current?.onClick() });
    return () => setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, setAction]);
}
