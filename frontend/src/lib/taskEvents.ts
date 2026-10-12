// Fired by api.updateTask whenever a task is marked completed, from any screen, so one global
// prompt can ask how long it took (spec-shifts.md Unidad 10) without touching every task list.
export const TASK_COMPLETED_EVENT = 'northstack:task-completed';
