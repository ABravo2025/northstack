import { useTranslation } from 'react-i18next';

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  const { t } = useTranslation();
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="pagination" role="navigation" aria-label={t('pagination.ariaLabel')}>
      <div className="seg-nav">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          {t('pagination.previous')}
        </button>
        <span className="seg-nav-status">
          {t('pagination.pageStatus', { page, pageCount })}
        </span>
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          {t('pagination.next')}
        </button>
      </div>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
