interface RoleChipProps {
  role: 'owner' | 'admin' | 'member';
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

export default function RoleChip({ role }: RoleChipProps) {
  return <span className={`role-chip ${VARIANT[role]}`}>{LABEL[role]}</span>;
}
