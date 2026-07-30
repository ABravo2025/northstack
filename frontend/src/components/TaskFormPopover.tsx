import type { Task } from '../api';
import Popover from './Popover';
import TaskForm, { type TaskFormPayload } from './TaskForm';

export type { TaskFormPayload };

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

interface TaskFormPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  tenantUsers: TenantUserLite[];
  task: Task | null; // null = creating a new task
  defaultAssigneeId: string;
  onSubmit: (payload: TaskFormPayload) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}

// Small anchored flyout for the two surfaces that aren't the wide 2-column
// detail panel — MyTasksWidget (/overview "My tasks" card) and the /overview
// calendar's Task entries — where there's no dedicated column to put an
// always-expanded form in. Wraps the same TaskForm the detail panels use
// inline, so the two surfaces never drift into separate implementations.
export default function TaskFormPopover({
  open,
  onClose,
  anchorRef,
  tenantUsers,
  task,
  defaultAssigneeId,
  onSubmit,
  onDelete,
}: TaskFormPopoverProps) {
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} width={280}>
      <TaskForm
        task={task}
        tenantUsers={tenantUsers}
        defaultAssigneeId={defaultAssigneeId}
        onSubmit={async (payload) => {
          await onSubmit(payload);
          onClose();
        }}
        onDelete={onDelete}
      />
    </Popover>
  );
}
