import { useCallback, useEffect, useState } from 'react';

// Per-table column order, persisted to localStorage only, same pattern as
// useResizableColumns/useColumnVisibility. Stores just the key sequence —
// any key not yet seen (a new column, a newly-active custom field) is
// appended at the end; any key no longer present (a deactivated custom
// field) is dropped, so stale storage never hides a real column.
export function useColumnOrder(storageKey: string, allKeys: string[]) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

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
    setOrder((prev) => {
      const current = prev.length ? [...prev] : [...allKeys];
      // Make sure every known key is represented before splicing, otherwise
      // a key that was never persisted yet (order.length === 0 case aside)
      // could be missing from `current` and silently dropped.
      for (const k of allKeys) {
        if (!current.includes(k)) current.push(k);
      }
      const withoutDragged = current.filter((k) => k !== draggedKey);
      const targetIndex = withoutDragged.indexOf(targetKey);
      if (targetIndex === -1) return current;
      const next = [...withoutDragged];
      next.splice(targetIndex, 0, draggedKey);
      return next;
    });
  }, [allKeys]);

  return { orderedKeys, reorder };
}
