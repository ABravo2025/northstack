import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Opportunity } from '../../api';
import type { ProjectTemplateSummary } from '../../api/projects';
import { useToast } from '../common/ToastProvider';

// Clientes C3: on a won deal, hand it off to the account owner — onboarding project from a
// template, kickoff on the calendar (a task with a video call, synced like any task), welcome email.
export default function HandoffPanel({ token, opportunity, onDone }: { token: string; opportunity: Opportunity; onDone: (patch: Partial<Opportunity>) => void }) {
  const { t, i18n } = useTranslation('crm');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplateSummary[]>([]);
  const contacts = (opportunity.contactLinks ?? []).map((l) => l.contact);
  const [form, setForm] = useState({
    accountOwnerId: opportunity.ownerId ?? '',
    templateId: '',
    kickoffAt: '',
    welcomeContactId: contacts[0]?.id ?? '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.listUserDirectory(token).then(setUsers).catch(() => setUsers([]));
    api
      .listProjectTemplates(token, i18n.language.startsWith('es') ? 'es' : 'en')
      .then((r) => setTemplates(r.templates))
      .catch(() => setTemplates([]));
  }, [open, token, i18n.language]);

  if (opportunity.handoffAt) {
    return (
      <div className="fm-lands mx-4 mb-3">
        <strong>{t('handoff.doneTitle')}</strong>
        <span>{t('handoff.doneBody', { date: new Date(opportunity.handoffAt).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US') })}</span>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.handoffOpportunity(token, opportunity.id, {
        accountOwnerId: form.accountOwnerId,
        templateId: form.templateId || null,
        kickoffAt: form.kickoffAt ? new Date(form.kickoffAt).toISOString() : null,
        welcomeContactId: form.welcomeContactId || null,
      });
      toast.success(t('handoff.done'));
      onDone({ handoffAt: new Date().toISOString(), handoffProjectId: r.projectId });
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-4 mb-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2.5 dark:border-brand-blue-light/40 dark:bg-brand-blue-light/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-col">
          <strong className="text-sm">{t('handoff.title')}</strong>
          <span className="text-xs text-ink-muted dark:text-dark-ink-muted">{t('handoff.subtitle')}</span>
        </span>
        {!open && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
            {t('handoff.start')}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <label className="ex-field">
            {t('handoff.owner')}
            <select value={form.accountOwnerId} onChange={(e) => setForm({ ...form, accountOwnerId: e.target.value })}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </label>
          <label className="ex-field">
            {t('handoff.template')}
            <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
              <option value="">{t('handoff.noProject')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <span className="ex-hint font-normal">{t('handoff.templateHint')}</span>
          </label>
          <label className="ex-field">
            {t('handoff.kickoff')}
            <input type="datetime-local" value={form.kickoffAt} onChange={(e) => setForm({ ...form, kickoffAt: e.target.value })} />
            <span className="ex-hint font-normal">{t('handoff.kickoffHint')}</span>
          </label>
          <label className="ex-field">
            {t('handoff.welcome')}
            <select value={form.welcomeContactId} onChange={(e) => setForm({ ...form, welcomeContactId: e.target.value })}>
              <option value="">{t('handoff.noWelcome')}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName} · {c.email}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              {t('handoff.cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={busy || !form.accountOwnerId} onClick={submit}>
              {t('handoff.confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
