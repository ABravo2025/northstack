import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_COLUMN_WIDTH = 80;
const DEFAULT_COLUMN_WIDTH = 160;

// Per-table column widths, keyed by column key (including dynamic `cf:<id>`
// custom field keys). Persisted to localStorage only — same "not worth a
// backend model" call already made for saved-view selection and custom
// ColorPicker swatches elsewhere in the app.
export function useResizableColumns(storageKey: string) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

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
      setWidths((prev) => (prev[key] === newWidth ? prev : { ...prev, [key]: newWidth }));
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
  }, []);

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
