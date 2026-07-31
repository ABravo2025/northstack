interface EntityCardListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getInitials: (item: T) => string;
  getName: (item: T) => React.ReactNode;
  getMeta: (item: T) => React.ReactNode;
  getStatusColor?: (item: T) => string | null | undefined;
  onSelect?: (item: T) => void;
}

// Mobile (< md) replacement for `.full-table-wrap` (Tarea 9a, tareas-ux-ui.md)
// — a table's columns don't fit a 390px screen, so below md each row becomes
// a tappable card instead of a horizontally-scrolling table.
export default function EntityCardList<T>({
  items,
  getKey,
  getInitials,
  getName,
  getMeta,
  getStatusColor,
  onSelect,
}: EntityCardListProps<T>) {
  return (
    <div className="entity-card-list">
      {items.map((item) => {
        const statusColor = getStatusColor?.(item);
        return (
          <div
            key={getKey(item)}
            className={`entity-card ${onSelect ? 'clickable' : ''}`}
            onClick={() => onSelect?.(item)}
          >
            <span className="entity-card-avatar">{getInitials(item)}</span>
            <span className="entity-card-body">
              <span className="entity-card-name">{getName(item)}</span>
              <span className="entity-card-meta">{getMeta(item)}</span>
            </span>
            {statusColor && <span className="status-dot shrink-0" style={{ backgroundColor: statusColor }} />}
          </div>
        );
      })}
    </div>
  );
}
