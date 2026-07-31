const COLUMN_WIDTHS = [170, 110, 64, 64];

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export default function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div>
      <div className="skeleton-head" />
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="skeleton-row" style={{ animationDelay: `${rowIndex * 0.08}s` }}>
          {Array.from({ length: columns }, (_, colIndex) => {
            const width = COLUMN_WIDTHS[colIndex] ?? 64;
            return (
              <span key={colIndex} className="inline-flex items-center gap-2" style={{ width }}>
                {colIndex === 0 && <span className="skeleton-avatar" />}
                <span className="skeleton-bar" style={{ width: colIndex === 0 ? width - 34 : width }} />
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
