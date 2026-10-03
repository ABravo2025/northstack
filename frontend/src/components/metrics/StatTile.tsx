interface StatTileProps {
  label: string;
  value: string;
  subtitle?: string;
}

// The value's font size follows the tile's own width (container query units): a long value like
// "$114,900.00" or "USD 12,400 + ARS 3.500.000" shrinks to fit a narrow tile instead of spilling out
// of it, down to a floor, and wraps past that (client report, 2026-10-03).
function valueFontSize(value: string): string {
  const chars = Math.max(value.length, 1);
  return `clamp(0.75rem, ${(100 / (chars * 0.62)).toFixed(2)}cqi, 1.5rem)`;
}

// Shared "single number" tile — used by the /overview general strip and every
// /dashboards category page's headline row, so the two surfaces read as one
// system instead of two different visual languages. Label and value centered.
export default function StatTile({ label, value, subtitle }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-1 px-2 py-4 text-center sm:px-4 dark:border-dark-line dark:bg-dark-surface">
      <div style={{ containerType: 'inline-size' }}>
        <p
          className="font-medium uppercase tracking-wide text-ink-faint dark:text-dark-ink-faint [overflow-wrap:break-word]"
          style={{ fontSize: 'clamp(0.625rem, 8cqi, 0.75rem)' }}
        >
          {label}
        </p>
        <p
          className="mt-1 font-semibold leading-tight text-ink dark:text-dark-ink [overflow-wrap:anywhere]"
          style={{ fontVariantNumeric: 'tabular-nums', fontSize: valueFontSize(value) }}
        >
          {value}
        </p>
        {subtitle && <p className="mt-0.5 text-xs text-ink-muted dark:text-dark-ink-muted [overflow-wrap:break-word]">{subtitle}</p>}
      </div>
    </div>
  );
}
