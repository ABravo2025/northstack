interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="pagination" role="navigation" aria-label="Table pagination">
      <button
        type="button"
        className="btn-secondary px-2 py-1 text-xs"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <span className="pagination-status">
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        className="btn-secondary px-2 py-1 text-xs"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
