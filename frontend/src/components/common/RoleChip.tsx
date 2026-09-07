interface RoleChipProps {
  role: 'owner' | 'admin' | 'member';
  // Custom Roles Fase I — the tenant's real role name (e.g. "Manager"), when the assigned role
  // isn't one of the 3 seed roles. `role` still carries the legacy enum for color-coding purposes
  // ('member' as the neutral fallback tier), but `label` overrides the displayed text.
  label?: string;
}

const VARIANT: Record<RoleChipProps['role'], string> = {
  owner: 'chip-good',
  admin: 'chip-blue',
  member: 'chip-neutral',
};

const LABEL: Record<RoleChipProps['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export default function RoleChip({ role, label }: RoleChipProps) {
  return <span className={`role-chip ${VARIANT[role]}`}>{label ?? LABEL[role]}</span>;
}
