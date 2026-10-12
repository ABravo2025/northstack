// "45 min", "2 h", "1 h 15 min" — the same in English and Spanish.
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '−' : '';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m} min`;
  return m === 0 ? `${sign}${h} h` : `${sign}${h} h ${m} min`;
}

// Fired by api.updateTask whenever a task is marked completed, from any screen, so one global
// prompt can ask how long it took (spec-shifts.md Unidad 10) without touching every task list.
export const TASK_COMPLETED_EVENT = 'northstack:task-completed';
