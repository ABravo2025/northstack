import type { ReactNode } from 'react';
import { TONE_CLASS, type Tone } from './format';

export function Chip({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Panel({ title, aside, children, className = '' }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-surface-1 dark:border-dark-line dark:bg-dark-surface ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 dark:border-dark-line">
          <h3 className="text-sm font-semibold">{title}</h3>
          {aside && <span className="text-xs text-ink-faint dark:text-dark-ink-faint">{aside}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Loading() {
  return <div className="py-16 text-center text-sm text-ink-faint dark:text-dark-ink-faint">Cargando…</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{message}</div>;
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className="inline-grid flex-none place-items-center rounded-lg font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hash} 55% 45%)` }}
    >
      {initials}
    </span>
  );
}

// Bar track used for health parts and module adoption.
export function Meter({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full border border-line bg-surface-2 dark:border-dark-line dark:bg-dark-raised">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }} />
    </div>
  );
}
