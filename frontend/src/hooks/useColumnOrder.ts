import { useCallback, useEffect, useState } from 'react';

function readOrder(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Column order, persisted to localStorage only, same pattern as
// useResizableColumns/useColumnVisibility — `storageKey` is scoped per saved
// view by the caller (e.g. `northstack:columnOrder:employee:${activeViewId}`),
// so reordering columns in one view doesn't leak into another. Stores just
// the key sequence — any key not yet seen (a new column, a newly-active
// custom field) is appended at the end; any key no longer present (a
// deactivated custom field) is dropped, so stale storage never hides a real
// column.
export function useColumnOrder(storageKey: string, allKeys: string[]) {
  const [state, setState] = useState(() => ({ key: storageKey, order: readOrder(storageKey) }));

  // storageKey changed since the last render (switched saved view) — reload
  // synchronously during render, not in a useEffect (see useColumnVisibility
  // for why an effect-based reload races the persist effect below and can
  // clobber the new view's already-saved order).
  const order = state.key === storageKey ? state.order : readOrder(storageKey);
  if (state.key !== storageKey) {
    setState({ key: storageKey, order });
  }

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(order));
    } catch {
      // localStorage can throw in private-browsing/storage-full edge cases —
      // ordering still works for the session, it just won't persist.
    }
  }, [storageKey, order]);

  const known = new Set(allKeys);
  const fromStorage = order.filter((k) => known.has(k));
  const missing = allKeys.filter((k) => !fromStorage.includes(k));
  const orderedKeys = [...fromStorage, ...missing];

  const reorder = useCallback((draggedKey: string, targetKey: string) => {
    if (draggedKey === targetKey) return;
    setState((prev) => {
      const current = prev.order.length ? [...prev.order] : [...allKeys];
      // Make sure every known key is represented before splicing, otherwise
      // a key that was never persisted yet (order.length === 0 case aside)
      // could be missing from `current` and silently dropped.
      for (const k of allKeys) {
        if (!current.includes(k)) current.push(k);
      }
      const withoutDragged = current.filter((k) => k !== draggedKey);
      const targetIndex = withoutDragged.indexOf(targetKey);
      if (targetIndex === -1) return prev;
      const next = [...withoutDragged];
      next.splice(targetIndex, 0, draggedKey);
      return { key: storageKey, order: next };
    });
  }, [allKeys, storageKey]);

  return { orderedKeys, reorder };
}
