import type { ReactNode } from 'react';
import { PlusIcon } from './Icons';

// The one standard for every list/table in the app (design-system.md §14): the table
// never disappears. With rows it shows the rows; with none it keeps the header and shows
// a quiet empty row in its place; and whenever the viewer can create, the dashed "+ Add"
// row sits at the bottom either way. Pages declare columns and what "Add" does; they
// don't build their own empty card or ghost row.

interface TableAddRowProps {
  colSpan: number;
  label: string;
  onAdd: () => void;
}

export function TableAddRow({ colSpan, label, onAdd }: TableAddRowProps) {
  return (
    <tr className="ghost-row">
      <td colSpan={colSpan} className="ghost-row-cell">
        <button type="button" className="ghost-row-inner" onClick={onAdd}>
          <span className="ghost-plus-box">
            <PlusIcon className="h-3 w-3" />
          </span>
          {label}
        </button>
      </td>
    </tr>
  );
}

export interface TableEmptyContent {
  icon?: ReactNode;
  title: string;
  body?: string;
  /** Extra actions for the empty state (Import CSV, Load sample data, Clear filters…). */
  actions?: ReactNode;
}

interface TableEmptyRowProps extends TableEmptyContent {
  colSpan: number;
}

export function TableEmptyRow({ colSpan, icon, title, body, actions }: TableEmptyRowProps) {
  return (
    <tr className="table-empty-row">
      <td colSpan={colSpan}>
        <div className="table-empty">
          {icon && <span className="table-empty-icon">{icon}</span>}
          <div className="table-empty-text">
            <span className="table-empty-title">{title}</span>
            {body && <span className="table-empty-body">{body}</span>}
          </div>
          {actions && <div className="table-empty-actions">{actions}</div>}
        </div>
      </td>
    </tr>
  );
}

interface TableBodyProps {
  colSpan: number;
  isEmpty: boolean;
  empty: TableEmptyContent;
  /** Omit when the viewer can't create — the "+ Add" row is then left out. */
  onAdd?: () => void;
  addLabel?: string;
  children?: ReactNode;
}

export default function TableBody({ colSpan, isEmpty, empty, onAdd, addLabel, children }: TableBodyProps) {
  return (
    <tbody>
      {isEmpty ? <TableEmptyRow colSpan={colSpan} {...empty} /> : children}
      {onAdd && addLabel && <TableAddRow colSpan={colSpan} label={addLabel} onAdd={onAdd} />}
    </tbody>
  );
}

interface KanbanAddCardProps {
  label: string;
  onAdd: () => void;
}

// Same affordance at the foot of every Kanban column.
export function KanbanAddCard({ label, onAdd }: KanbanAddCardProps) {
  return (
    <button type="button" className="kanban-ghost-card" onClick={onAdd}>
      <span className="ghost-plus-box">
        <PlusIcon className="h-3 w-3" />
      </span>
      {label}
    </button>
  );
}
