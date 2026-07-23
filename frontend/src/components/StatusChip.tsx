interface StatusChipProps {
  color: string;
  label: string;
}

export default function StatusChip({ color, label }: StatusChipProps) {
  return (
    <span className="status-chip">
      <span className="status-dot" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
