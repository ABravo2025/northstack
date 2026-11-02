import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { api, ApiError, type Opportunity, type PipelineStage } from '../../api';
import { useToast } from '../common/ToastProvider';

// Clientes C1: the current stage's exit checklist on a deal. Required items must be ticked before
// the deal moves forward (the backend enforces it; this is where people tick them).
export default function StageChecklist({
  token,
  opportunity,
  stage,
  onSaved,
}: {
  token: string;
  opportunity: Opportunity;
  stage: PipelineStage | undefined;
  onSaved: (patch: Partial<Opportunity>) => void;
}) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const items = stage?.exitChecklist ?? [];
  if (!stage || items.length === 0) return null;
  const done = new Set(opportunity.checklistState?.[stage.id] ?? []);
  const requiredLeft = items.filter((i) => i.required && !done.has(i.id)).length;

  const toggle = async (itemId: string, value: boolean) => {
    setBusy(itemId);
    try {
      const res = await api.setOpportunityChecklistItem(token, opportunity.id, { stageId: stage.id, itemId, done: value });
      onSaved({ checklistState: res.checklistState });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-4 mb-3 rounded-lg border border-line px-3 py-2.5 dark:border-dark-line">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <strong className="text-sm">{t('stageChecklist.title')}</strong>
        <span className={`text-xs ${requiredLeft ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
          {requiredLeft ? t('stageChecklist.left', { count: requiredLeft }) : t('stageChecklist.ready')}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={done.has(item.id)} disabled={busy === item.id} onChange={(e) => toggle(item.id, e.target.checked)} />
              <span className={done.has(item.id) ? 'text-ink-muted line-through dark:text-dark-ink-muted' : ''}>{item.label}</span>
              {!item.required && <span className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('stageChecklist.optional')}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The message for a move the backend refused because the checklist isn't done, naming the items.
export function checklistErrorMessage(t: TFunction, error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body as { code?: string; missing?: { label: string }[] } | undefined;
  if (body?.code !== 'checklist_incomplete') return null;
  return t('crm:stageChecklist.blocked', { items: (body.missing ?? []).map((m) => m.label).join(', ') });
}
