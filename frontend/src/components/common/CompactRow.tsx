import type { ReactNode } from 'react';

interface CompactRowGroupProps {
  children: ReactNode;
  /** Sum of the group's fixed-width columns/gaps, so short content doesn't scroll for nothing. */
  minWidth: number;
}

// Wraps a set of fixed-column rows (grip handle / name / select / checkbox / action buttons —
// the "compact row" shape used by stage editors and similar inline-edit lists) in its own
// horizontal scroll container. Without this, a row whose fixed-width columns add up past the
// viewport (a phone, or this panel's own narrow width) overflows silently — later columns become
// unreachable rather than scrollable. Same overflow-x-auto + hidden-scrollbar treatment as
// .full-table-wrap, just generic enough for a row group instead of a <table>.
export default function CompactRowGroup({ children, minWidth }: CompactRowGroupProps) {
  return (
    <div className="full-table-wrap">
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
