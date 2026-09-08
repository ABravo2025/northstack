import { useRef, useState } from 'react';

// Touch pointers get no native HTML5 drag-and-drop (mobile browsers don't fire drag events from
// touch input at all, so `draggable`/onDragStart below is silently inert there) — this is the
// minimum distance a touch has to move before it counts as a card drag rather than a tap or a
// column scroll. Kept small since kanban cards are already deliberately small drop targets.
const TOUCH_DRAG_THRESHOLD_PX = 8;

export interface KanbanColumn {
  key: string;
  label: string;
  color?: string | null;
}

interface KanbanBoardProps<T> {
  columns: KanbanColumn[];
  items: T[];
  getItemKey: (item: T) => string;
  getItemColumn: (item: T) => string;
  onMove: (item: T, newColumnKey: string) => void;
  renderCard: (item: T) => React.ReactNode;
  renderColumnFooter?: (columnKey: string) => React.ReactNode;
  /** Optional total shown right of the item count in the column header (e.g. "USD 84k"). */
  renderColumnTotal?: (columnItems: T[]) => React.ReactNode;
}

export default function KanbanBoard<T>({
  columns,
  items,
  getItemKey,
  getItemColumn,
  onMove,
  renderCard,
  renderColumnFooter,
  renderColumnTotal,
}: KanbanBoardProps<T>) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const touchDrag = useRef<{ itemKey: string; startX: number; startY: number; active: boolean } | null>(null);

  const itemsByColumn = new Map<string, T[]>();
  for (const col of columns) itemsByColumn.set(col.key, []);
  for (const item of items) {
    const col = getItemColumn(item);
    if (!itemsByColumn.has(col)) itemsByColumn.set(col, []);
    itemsByColumn.get(col)!.push(item);
  }

  const handleDrop = (columnKey: string) => {
    setDragOverColumn(null);
    const item = items.find((i) => getItemKey(i) === draggingKey);
    setDraggingKey(null);
    if (!item) return;
    if (getItemColumn(item) === columnKey) return;
    onMove(item, columnKey);
  };

  const columnKeyAt = (x: number, y: number): string | undefined =>
    (document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-kanban-column]') ?? undefined)?.dataset.kanbanColumn;

  const handleCardPointerDown = (e: React.PointerEvent, key: string) => {
    if (e.pointerType !== 'touch') return;
    touchDrag.current = { itemKey: key, startX: e.clientX, startY: e.clientY, active: false };
  };

  const handleCardPointerMove = (e: React.PointerEvent) => {
    const drag = touchDrag.current;
    if (!drag) return;
    if (!drag.active) {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (moved < TOUCH_DRAG_THRESHOLD_PX) return;
      drag.active = true;
      setDraggingKey(drag.itemKey);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    setDragOverColumn(columnKeyAt(e.clientX, e.clientY) ?? null);
  };

  const handleCardPointerUp = (e: React.PointerEvent) => {
    const drag = touchDrag.current;
    touchDrag.current = null;
    if (!drag?.active) return;
    const columnKey = columnKeyAt(e.clientX, e.clientY);
    if (columnKey) {
      handleDrop(columnKey);
    } else {
      setDraggingKey(null);
      setDragOverColumn(null);
    }
  };

  return (
    <div className="kanban-wrap">
      {columns.map((col) => {
        const colItems = itemsByColumn.get(col.key) ?? [];
        return (
          <div className="kanban-col" key={col.key}>
            <div className="kanban-col-head">
              {col.color && <span className="dot" style={{ background: col.color }} />}
              {col.label}
              <span className="cnt">{colItems.length}</span>
              {renderColumnTotal && <span className="kanban-col-total">{renderColumnTotal(colItems)}</span>}
            </div>
            <div
              className={`kanban-body ${dragOverColumn === col.key ? 'drag-over' : ''}`}
              data-kanban-column={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverColumn(col.key);
              }}
              onDragLeave={() => setDragOverColumn((current) => (current === col.key ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col.key);
              }}
            >
              {colItems.map((item) => {
                const key = getItemKey(item);
                return (
                  <div
                    className={`kcard ${draggingKey === key ? 'dragging' : ''}`}
                    key={key}
                    draggable
                    onDragStart={() => setDraggingKey(key)}
                    onDragEnd={() => setDraggingKey(null)}
                    onPointerDown={(e) => handleCardPointerDown(e, key)}
                    onPointerMove={handleCardPointerMove}
                    onPointerUp={handleCardPointerUp}
                    onPointerCancel={handleCardPointerUp}
                    style={{ touchAction: draggingKey === key ? 'none' : undefined }}
                  >
                    {renderCard(item)}
                  </div>
                );
              })}
              {renderColumnFooter?.(col.key)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
