import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

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
  return <PrimaryActionContext.Provider value={{ action, setAction }}>{children}</PrimaryActionContext.Provider>;
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
export function usePrimaryAction(action: PrimaryAction | null): void {
  const ctx = useContext(PrimaryActionContext);
  if (!ctx) throw new Error('usePrimaryAction must be used within a PrimaryActionProvider');
  const { setAction } = ctx;
  useEffect(() => {
    setAction(action);
    return () => setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.label, action?.onClick, setAction]);
}
