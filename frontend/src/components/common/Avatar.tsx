interface AvatarProps {
  firstName?: string | null;
  lastName?: string | null;
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName ?? '').trim().charAt(0);
  const last = (lastName ?? '').trim().charAt(0);
  return (first + last).toUpperCase() || '?';
}

export default function Avatar({ firstName, lastName }: AvatarProps) {
  return <span className="avatar">{getInitials(firstName, lastName)}</span>;
}
