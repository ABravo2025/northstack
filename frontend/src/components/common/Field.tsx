import RequiredMark from './RequiredMark';

// The one piece that was genuinely byte-identical across the 4 detail panels
// (Employee/Company/Contact/Opportunity) — evaluated as part of Checkpoint F
// (docs/tareas-desarrollo.md). The rest (header subtitle content, the actual
// fields, linked-record sections) has real per-entity variance that a single
// shared "detail modal" component would have to paper over with a growing
// prop surface, so it stays as 4 files for now rather than one fragile one.
interface FieldProps {
  label: string;
  children: React.ReactNode;
  // Spans both columns of the left panel's field grid (2026-07-30) — for a
  // field that's genuinely long (an address) rather than a short value that
  // benefits from sitting two-up.
  full?: boolean;
  // Red asterisk after the label (2026-08) — the one reusable marker for
  // "this field can't be left empty", used by every "Add [Entity]" form.
  // Detail panels don't set this: once an entity exists, every field there
  // is independently editable/clearable, so "required" no longer means
  // anything at that point.
  required?: boolean;
}

export default function Field({ label, children, full, required }: FieldProps) {
  return (
    <div className={`overview-field${full ? ' overview-field-full' : ''}`}>
      <span className="overview-field-label">
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
    </div>
  );
}
