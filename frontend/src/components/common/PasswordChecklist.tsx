import { CheckIcon } from './Icons';

export const PASSWORD_RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: '1 uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: '1 number', test: (p) => /[0-9]/.test(p) },
  { label: '1 special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

interface PasswordChecklistProps {
  password: string;
}

export default function PasswordChecklist({ password }: PasswordChecklistProps) {
  return (
    <ul className="password-checklist">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.label} className={met ? 'met' : ''}>
            <span className="password-checklist-dot">{met && <CheckIcon className="h-2.5 w-2.5" />}</span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
