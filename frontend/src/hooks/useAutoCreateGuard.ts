import { useRef, useState } from 'react';

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
//
// `run` itself is expected to only persist the record — it must NOT close
// the form or navigate away, since the user should be able to keep filling
// the rest of the form after the background create fires (backlog QA,
// 2026-08-27: auto-create used to also jump straight to the detail view,
// cutting the form short the instant required fields were complete). The
// caller's explicit "Create"/submit handler is what closes the form —
// it checks `isBusy`/whatever id the create returned instead of going
// through `attempt` again.
export function useAutoCreateGuard() {
  const creatingRef = useRef(false);
  const createdRef = useRef(false);
  const [isBusy, setIsBusy] = useState(false);

  const attempt = async (isReady: boolean, run: () => Promise<void>) => {
    if (createdRef.current || creatingRef.current || !isReady) return;
    creatingRef.current = true;
    setIsBusy(true);
    try {
      await run();
      createdRef.current = true;
    } catch {
      // run() is responsible for reporting its own error (toast); this only
      // needs to know creation didn't succeed so a later attempt can retry.
    } finally {
      creatingRef.current = false;
      setIsBusy(false);
    }
  };

  // Call when the form is cleared (modal closed/reopened) so the next open
  // can auto-create again.
  const reset = () => {
    creatingRef.current = false;
    createdRef.current = false;
    setIsBusy(false);
  };

  return { attempt, reset, isBusy };
}
