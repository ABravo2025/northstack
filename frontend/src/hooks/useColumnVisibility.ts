import { useCallback, useEffect, useState } from 'react';

// Per-table hidden-column set, keyed by column key (including dynamic `cf:<id>`
// custom field keys). Persisted to localStorage only, same "not worth a backend
// model" call already made for column widths and the active saved view.
export function useColumnVisibility(storageKey: string) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...hidden]));
    } catch {
      // localStorage can throw in private-browsing/storage-full edge cases —
      // visibility still works for the session, it just won't persist.
    }
  }, [storageKey, hidden]);

  const isHidden = useCallback((key: string) => hidden.has(key), [hidden]);

  const toggle = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const hide = useCallback((key: string) => {
    setHidden((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  return { isHidden, toggle, hide, hiddenKeys: hidden };
}
