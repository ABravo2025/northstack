import { useRef } from 'react';

// Shared guard for "Add [Entity]" forms that auto-create once their required
// fields are complete (2026-08, matching the detail-panel autosave pattern —
// see docs/tareas-desarrollo.md). `attempt` is called from field
// commit points (blur for text, change for select, same asymmetry as
// AutoSaveField/AutoSaveSelect) — it's a no-op unless the fields are ready,
// nothing has been created yet, and no request is already in flight, so it's
// safe to call from every required field's commit handler without
// duplicating the entity. `run` should throw on failure (after reporting the
// error itself, e.g. via toast) so the guard knows not to mark this attempt
// as created — that keeps the door open for a retry once the user fixes
// whatever the backend rejected (e.g. a duplicate email).
export function useAutoCreateGuard() {
  const creatingRef = useRef(false);
  const createdRef = useRef(false);

  const attempt = async (isReady: boolean, run: () => Promise<void>) => {
    if (createdRef.current || creatingRef.current || !isReady) return;
    creatingRef.current = true;
    try {
      await run();
      createdRef.current = true;
    } catch {
      // run() is responsible for reporting its own error (toast); this only
      // needs to know creation didn't succeed so a later attempt can retry.
    } finally {
      creatingRef.current = false;
    }
  };

  // Call when the form is cleared (modal closed/reopened) so the next open
  // can auto-create again.
  const reset = () => {
    creatingRef.current = false;
    createdRef.current = false;
  };

  return { attempt, reset };
}
