import { useCallback, useEffect, useState } from 'react';

function readHidden(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

// Hidden-column set, keyed by column key (including dynamic `cf:<id>` custom
// field keys). `storageKey` is scoped per saved view by the caller (e.g.
// `northstack:hiddenColumns:employee:${activeViewId}`), so hiding a column in
// one view doesn't leak into another. Persisted to localStorage only, same
// "not worth a backend model" call already made for column widths/order and
// the active saved view.
export function useColumnVisibility(storageKey: string) {
  const [state, setState] = useState(() => ({ key: storageKey, hidden: readHidden(storageKey) }));

  // storageKey changed since the last render (switched saved view) — reload
  // synchronously during render, not in a useEffect. An effect-based reload
  // would race the persist effect below: on the render where the key
  // changes, the persist effect would still see the *previous* view's
  // `hidden` value and write it into the *new* key before the reload effect
  // had a chance to run, clobbering whatever was already saved for that view.
  const hidden = state.key === storageKey ? state.hidden : readHidden(storageKey);
  if (state.key !== storageKey) {
    setState({ key: storageKey, hidden });
  }

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
    setState((prev) => {
      const next = new Set(prev.hidden);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { key: storageKey, hidden: next };
    });
  }, [storageKey]);

  const hide = useCallback((key: string) => {
    setState((prev) => (prev.hidden.has(key) ? prev : { key: storageKey, hidden: new Set(prev.hidden).add(key) }));
  }, [storageKey]);

  return { isHidden, toggle, hide, hiddenKeys: hidden };
}
