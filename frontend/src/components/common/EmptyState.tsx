import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  /** 'secondary' for a corrective action (e.g. "Clear filters" on a no-results state), not a creation CTA. */
  primaryVariant?: 'primary' | 'secondary';
  secondaryLabel?: string;
  onSecondary?: () => void;
  hint?: string;
  /** Extra actions beyond primary/secondary (e.g. Employees' "Import CSV" + "Load sample data"). */
  children?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  body,
  primaryLabel,
  onPrimary,
  primaryVariant = 'primary',
  secondaryLabel,
  onSecondary,
  hint,
  children,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-body">{body}</p>
      <div className="empty-state-actions">
        <button
          type="button"
          className={`${primaryVariant === 'primary' ? 'btn-primary' : 'btn-secondary'} btn-md`}
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button type="button" className="btn-secondary btn-md" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        )}
        {children}
      </div>
      {hint && <p className="empty-state-hint">{hint}</p>}
    </div>
  );
}
