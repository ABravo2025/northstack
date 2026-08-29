interface StatTileProps {
  label: string;
  value: string;
  subtitle?: string;
}

// Shared "single number" tile — used by the /overview general strip and every
// /dashboards category page's headline row, so the two surfaces read as one
// system instead of two different visual languages.
export default function StatTile({ label, value, subtitle }: StatTileProps) {
  return (
    <div className="rounded-lg border border-line bg-surface-1 p-4 dark:border-dark-line dark:bg-dark-surface">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink dark:text-dark-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {subtitle && <p className="mt-0.5 text-xs text-ink-muted dark:text-dark-ink-muted">{subtitle}</p>}
    </div>
  );
}
