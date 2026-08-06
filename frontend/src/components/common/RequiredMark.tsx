// The one reusable marker for "this field can't be left empty" — every label
// next to a required input renders this instead of a hand-rolled " *" (text
// node, inconsistent color/spacing) so the whole app has exactly one visual
// definition of "required" to change if it ever needs to. Rendered as its
// own element (not baked into Field's label string) so it can drop into any
// label, not just Field's.
export default function RequiredMark() {
  return (
    <span className="required-mark" aria-hidden="true">
      {' '}
      *
    </span>
  );
}
