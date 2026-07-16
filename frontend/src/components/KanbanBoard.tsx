import { useState } from 'react';

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
}

export default function KanbanBoard<T>({
  columns,
  items,
  getItemKey,
  getItemColumn,
  onMove,
  renderCard,
}: KanbanBoardProps<T>) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

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
            </div>
            <div
              className={`kanban-body ${dragOverColumn === col.key ? 'drag-over' : ''}`}
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
                  >
                    {renderCard(item)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
