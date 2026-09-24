import { useTranslation } from 'react-i18next';
import { CheckIcon } from './Icons';

export const PASSWORD_RULES: { id: 'minLength' | 'uppercase' | 'number' | 'special'; test: (password: string) => boolean }[] = [
  { id: 'minLength', test: (p) => p.length >= 8 },
  { id: 'uppercase', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', test: (p) => /[0-9]/.test(p) },
  { id: 'special', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

interface PasswordChecklistProps {
  password: string;
}

export default function PasswordChecklist({ password }: PasswordChecklistProps) {
  const { t } = useTranslation();
  return (
    <ul className="password-checklist">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.id} className={met ? 'met' : ''}>
            <span className="password-checklist-dot">{met && <CheckIcon className="h-2.5 w-2.5" />}</span>
            {t(`passwordChecklist.${rule.id}`)}
          </li>
        );
      })}
    </ul>
  );
}
