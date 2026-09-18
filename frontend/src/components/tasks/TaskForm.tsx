import { useEffect, useState } from 'react';
import type { Task } from '../../api';
import RequiredMark from '../common/RequiredMark';
import { TrashIcon, XIcon } from '../common/Icons';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TaskFormPayload {
  title: string;
  description: string | null;
  assigneeId: string;
  dueDate: string | null;
  hasVideoCall: boolean;
  // Only present when the `folders` prop was passed — omitted entirely otherwise, so existing
  // callers that never offer folders keep sending exactly the payload shape they always have.
  folderId?: string | null;
}

interface TaskFolderLite {
  id: string;
  name: string;
}

interface TaskFormProps {
  task: Task | null; // null = composing a new task
  tenantUsers: TenantUserLite[];
  defaultAssigneeId: string;
  // Pre-fills the due date for a *new* task (e.g. the day clicked on the
  // Overview calendar) — ignored once `task` is set, which already has its
  // own dueDate. YYYY-MM-DD, date-only (same convention as the field itself).
  defaultDueDate?: string;
  // Passing this list renders a "Folder" select and includes folderId in the submitted payload —
  // omitted (the default everywhere except the My Tasks hub) renders nothing folder-related.
  folders?: TaskFolderLite[];
  defaultFolderId?: string | null;
  // Google Meet needs a real Calendar connection to actually produce a joinable link — omitted
  // defaults to `true` (unchanged behavior at every existing call site); the My Tasks hub is the
  // first surface to pass the real status through and hide the checkbox when it's false.
  googleCalendarConnected?: boolean;
  onSubmit: (payload: TaskFormPayload) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onCancelEdit?: () => void;
}

// Always-expanded compose form for the right-column "Tasks" tab — no more
// click-to-open Popover (2026-07-30 redesign): the tab has a dedicated, tall
// column to put the form in, so there's no anchoring/positioning to manage
// anymore, and no morphology-jump risk between add/edit like the old popover
// had (D2 fix, now moot).
// A stored dueDate is either date-only (always exactly UTC midnight — no
// time was ever set, matches the calendar day regardless of the viewer's
// timezone) or a real instant (a specific time was set, converted from the
// picker's local time to UTC on submit). Reading exact-midnight-UTC back as
// a *local* hour would shift the displayed date by a day for any timezone
// west of UTC, so which convention applies has to be detected first — same
// UTC-getter reasoning already used for the Overview calendar's birthdays.
function hasTimeComponent(iso: string): boolean {
  const d = new Date(iso);
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A Google Meet call needs a specific time to join at, not just a day — arbitrary business-hours
// default, only ever used to fill in what "Add Google Meet" needs when the user hasn't already
// picked a time (they can still change it afterward).
const DEFAULT_CALL_TIME = '10:00';

export default function TaskForm({
  task,
  tenantUsers,
  defaultAssigneeId,
  defaultDueDate,
  folders,
  defaultFolderId,
  googleCalendarConnected = true,
  onSubmit,
  onDelete,
  onCancelEdit,
}: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [hasVideoCall, setHasVideoCall] = useState(false);
  const [folderId, setFolderId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setAssigneeId(task?.assigneeId ?? defaultAssigneeId);
    setHasVideoCall(task?.hasVideoCall ?? false);
    setFolderId(task ? task.folderId ?? '' : defaultFolderId ?? '');
    if (task?.dueDate && hasTimeComponent(task.dueDate)) {
      const d = new Date(task.dueDate);
      setDueDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setDueTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setDueDate(task?.dueDate ? task.dueDate.slice(0, 10) : defaultDueDate ?? '');
      setDueTime('');
    }
  }, [task, defaultAssigneeId, defaultDueDate, defaultFolderId]);

  // A Meet call needs a specific date+time, not just a date (or nothing) — checking the box
  // fills in whatever's missing with a default instead of blocking the user on filling those in
  // by hand first. Unchecking date/time while Meet is on doesn't make sense either way, so it
  // takes Meet down with it (mirrors dueTime already clearing itself when dueDate is cleared).
  const handleVideoCallToggle = (checked: boolean) => {
    setHasVideoCall(checked);
    if (checked) {
      if (!dueDate) setDueDate(todayIso());
      if (!dueTime) setDueTime(DEFAULT_CALL_TIME);
    }
  };

  // Guards against a fast double/triple click firing this before the first submit's request
  // even lands — found live (2026-09-16): repeated clicks on "Add task" created several
  // identical tasks, since nothing disabled the button or blocked re-entry while awaiting.
  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const wasNew = !task;
      // No time set: keep the existing date-only/all-day semantics (UTC
      // midnight of the chosen calendar day — synced to Google as an all-day
      // event). A time turns it into a real instant, synced as a timed event
      // instead — see googleCalendarSyncService.ts.
      const dueDateIso = !dueDate ? null : dueTime ? new Date(`${dueDate}T${dueTime}`).toISOString() : new Date(dueDate).toISOString();
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        assigneeId,
        dueDate: dueDateIso,
        hasVideoCall,
        ...(folders ? { folderId: folderId || null } : {}),
      });
      if (wasNew) {
        setTitle('');
        setDescription('');
        setDueDate('');
        setDueTime('');
        setHasVideoCall(false);
        setAssigneeId(defaultAssigneeId);
        setFolderId(defaultFolderId ?? '');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="inline-compose-form">
      <div className="nv-field">
        <label htmlFor="task-form-title">
          Title
          <RequiredMark />
        </label>
        <input
          id="task-form-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          required
        />
      </div>
      <div className="nv-field">
        <label htmlFor="task-form-description">Description</label>
        <textarea
          id="task-form-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="nv-field">
        <label htmlFor="task-form-assignee">Assignee</label>
        <select id="task-form-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          {tenantUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
      </div>
      <div className="nv-field flex gap-2">
        <div className="flex-1">
          <label htmlFor="task-form-due-date">Due date</label>
          <input
            id="task-form-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              if (!e.target.value) {
                setDueTime('');
                setHasVideoCall(false);
              }
            }}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="task-form-due-time">Time (optional)</label>
          <input
            id="task-form-due-time"
            type="time"
            value={dueTime}
            disabled={!dueDate}
            onChange={(e) => {
              setDueTime(e.target.value);
              if (!e.target.value) setHasVideoCall(false);
            }}
          />
        </div>
      </div>
      {folders && (
        <div className="nv-field">
          <label htmlFor="task-form-folder">Folder</label>
          <select id="task-form-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {googleCalendarConnected ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasVideoCall} onChange={(e) => handleVideoCallToggle(e.target.checked)} />
          Add Google Meet video call
        </label>
      ) : (
        <p className="text-xs text-ink-faint dark:text-dark-ink-faint">
          Connect Google Calendar in Settings to add a Meet link.
        </p>
      )}
      {task?.googleMeetUrl && (
        <div className="nv-field">
          <a href={task.googleMeetUrl} target="_blank" rel="noopener noreferrer" className="text-accent text-xs underline">
            Join Google Meet
          </a>
        </div>
      )}
      <div className="nv-field flex items-center gap-2">
        <button type="button" className="btn-primary flex-1 text-center" onClick={handleSubmit} disabled={!title.trim() || submitting}>
          {submitting ? 'Saving…' : task ? 'Save' : 'Add task'}
        </button>
        {task && onCancelEdit && (
          <button type="button" className="icon-btn" onClick={onCancelEdit} aria-label="Cancel edit">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {task && onDelete && (
          <button type="button" className="icon-btn danger" onClick={onDelete} aria-label="Delete task">
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
