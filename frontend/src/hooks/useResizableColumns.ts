import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_COLUMN_WIDTH = 80;
const DEFAULT_COLUMN_WIDTH = 160;

function readWidths(storageKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Column widths, keyed by column key (including dynamic `cf:<id>` custom
// field keys). `storageKey` is scoped per saved view by the caller (e.g.
// `northstack:columnWidths:employee:${activeViewId}`), so resizing a column
// in one view doesn't leak into another. Persisted to localStorage only —
// same "not worth a backend model" call already made for column
// order/visibility and the active saved view.
export function useResizableColumns(storageKey: string) {
  const [state, setState] = useState(() => ({ key: storageKey, widths: readWidths(storageKey) }));

  // storageKey changed since the last render (switched saved view) — reload
  // synchronously during render, not in a useEffect (see useColumnVisibility
  // for why an effect-based reload races the persist effect below and can
  // clobber the new view's already-saved widths).
  const widths = state.key === storageKey ? state.widths : readWidths(storageKey);
  if (state.key !== storageKey) {
    setState({ key: storageKey, widths });
  }

  const draggingKeyRef = useRef<string | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_COLUMN_WIDTH);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      // localStorage can throw in private-browsing/storage-full edge cases —
      // resizing still works for the session, it just won't persist.
    }
  }, [storageKey, widths]);

  const getWidth = useCallback((key: string) => widths[key] ?? DEFAULT_COLUMN_WIDTH, [widths]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const key = draggingKeyRef.current;
      if (!key) return;
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidthRef.current + delta);
      setState((prev) =>
        prev.widths[key] === newWidth ? prev : { key: storageKey, widths: { ...prev.widths, [key]: newWidth } },
      );
    };
    const handleMouseUp = () => {
      draggingKeyRef.current = null;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [storageKey]);

  const startResize = useCallback(
    (key: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      draggingKeyRef.current = key;
      startXRef.current = e.clientX;
      startWidthRef.current = getWidth(key);
    },
    [getWidth],
  );

  return { getWidth, startResize };
}
