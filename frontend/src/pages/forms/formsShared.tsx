import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { api, type FormQuestion, type FormsMeta } from '../../api';
import TableSkeleton from '../../components/common/TableSkeleton';
import { usePermissions } from '../../contexts/PermissionsContext';

// Formularios y encuestas (spec-clientes-gastos-formularios.md, B5) — what every screen shares:
// the editor's catalog (meta), the page frame with the permission check, and labels.

export function useFormsMeta(token: string) {
  const [meta, setMeta] = useState<FormsMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api
      .getFormsMeta(token)
      .then(setMeta)
      .catch((e) => setError((e as Error).message));
  }, [token]);
  useEffect(load, [load]);
  return { meta, error };
}

// "contact.email" → "Contacto · Email"; "cf:<id>" → "Campo personalizado · <name>".
export function targetLabel(t: TFunction, target: string, meta: FormsMeta | null): string {
  if (target.startsWith('cf:')) {
    const field = meta?.customFields.find((c) => c.id === target.slice(3));
    return t('forms:target.customField', { name: field?.name ?? '—' });
  }
  return t(`forms:target.${target}`, { defaultValue: target });
}

export function FormsFrame({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation('forms');
  const permissions = usePermissions();
  const allowed = permissions.has('manage_custom_fields');
  return (
    <div className="container sh-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="to-title">{title}</h2>
          {subtitle && <p className="to-subtitle max-w-3xl">{subtitle}</p>}
        </div>
        {allowed && actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {allowed ? children : <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('state.noPermission')}</p>}
    </div>
  );
}

export function Loading() {
  return <TableSkeleton rows={5} />;
}

// The respondent's view of one question — used by the editor's live preview.
export function QuestionPreview({ question }: { question: FormQuestion }) {
  const { t } = useTranslation('forms');
  const [value, setValue] = useState<string | number | boolean | string[] | null>(null);
  const label = (
    <span className="text-sm font-semibold">
      {question.label || t('editor.untitled')}
      {question.required && <span className="text-red-600 dark:text-red-400"> *</span>}
    </span>
  );
  let input: ReactNode;
  switch (question.type) {
    case 'long_text':
      input = <textarea rows={3} aria-label={question.label} />;
      break;
    case 'rating_nps':
    case 'rating_csat': {
      const [min, max] = question.type === 'rating_nps' ? [0, 10] : [1, 5];
      input = (
        <>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
              <button key={n} type="button" className={`fm-scale ${value === n ? 'active' : ''}`} onClick={() => setValue(n)}>
                {n}
              </button>
            ))}
          </div>
          <span className="ex-muted text-xs">
            {question.type === 'rating_nps' ? `${t('editor.npsLow')} · ${t('editor.npsHigh')}` : `${t('editor.csatLow')} · ${t('editor.csatHigh')}`}
          </span>
        </>
      );
      break;
    }
    case 'select':
    case 'multi_select':
      input = (
        <div className="flex flex-wrap gap-1.5">
          {(question.options ?? []).map((o) => {
            const picked = Array.isArray(value) ? value.includes(o) : value === o;
            return (
              <button
                key={o}
                type="button"
                className={`ex-option ${picked ? 'active' : ''}`}
                onClick={() =>
                  question.type === 'select'
                    ? setValue(o)
                    : setValue(Array.isArray(value) ? (picked ? value.filter((v) => v !== o) : [...value, o]) : [o])
                }
              >
                {o}
              </button>
            );
          })}
        </div>
      );
      break;
    case 'yes_no':
      input = (
        <div className="flex gap-1.5">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" className={`ex-option ${value === v ? 'active' : ''}`} onClick={() => setValue(v)}>
              {v ? t('editor.yes') : t('editor.no')}
            </button>
          ))}
        </div>
      );
      break;
    default: {
      const type = question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : question.type === 'number' ? 'number' : question.type === 'date' ? 'date' : 'text';
      input = <input type={type} aria-label={question.label} />;
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {question.help && <span className="ex-muted text-xs">{question.help}</span>}
      {input}
    </div>
  );
}
