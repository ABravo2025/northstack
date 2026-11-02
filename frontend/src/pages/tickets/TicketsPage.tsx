import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api, type ClientTicket, type ClientTicketPriority, type ClientTicketStatus, type Company } from '../../api';
import Modal from '../../components/common/Modal';
import RequiredMark from '../../components/common/RequiredMark';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import { useToast } from '../../components/common/ToastProvider';
import { usePermissions } from '../../contexts/PermissionsContext';

// Clientes C7 (spec-clientes-gastos-formularios.md): customer tickets with SLA — first response and
// resolution due by priority. Sorted by what's due first. Also the company's Tickets tab.
const PRIORITY_CHIP: Record<ClientTicketPriority, string> = {
  urgent: 'to-chip-rejected',
  high: 'to-chip-pending',
  normal: 'to-chip-cancelled',
  low: 'to-chip-cancelled',
};
const PRIORITIES: ClientTicketPriority[] = ['urgent', 'high', 'normal', 'low'];
const STATUSES: ClientTicketStatus[] = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];

type Users = { id: string; firstName: string; lastName: string }[];

export function useTicketDate() {
  const { i18n } = useTranslation('crm');
  return (iso: string) =>
    new Date(iso).toLocaleString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function TicketsTable({
  tickets,
  users,
  onOpen,
  onAdd,
  showCompany = true,
}: {
  tickets: ClientTicket[];
  users: Users;
  onOpen: (id: string) => void;
  onAdd?: () => void;
  showCompany?: boolean;
}) {
  const { t } = useTranslation('crm');
  const date = useTicketDate();
  const name = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const open = (tk: ClientTicket) => !['resolved', 'closed'].includes(tk.status);
  return (
    <div className="full-table-wrap">
      <table className="table full-table to-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t('tickets.columns.subject')}</th>
            {showCompany && <th>{t('tickets.columns.company')}</th>}
            <th>{t('tickets.columns.priority')}</th>
            <th>{t('tickets.columns.status')}</th>
            <th>{t('tickets.columns.sla')}</th>
            <th>{t('tickets.columns.assignee')}</th>
          </tr>
        </thead>
        <TableBody colSpan={showCompany ? 7 : 6} isEmpty={tickets.length === 0} empty={{ title: t('tickets.empty') }} onAdd={onAdd} addLabel={t('tickets.new')}>
          {tickets.map((tk) => (
            <tr key={tk.id} className="cursor-pointer" tabIndex={0} onClick={() => onOpen(tk.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(tk.id)}>
              <td className="num ex-muted">{tk.number}</td>
              <td className="!whitespace-normal">
                <span className="flex flex-col">
                  <strong>{tk.subject}</strong>
                  {(tk.requesterName || tk.requesterEmail) && <span className="ex-muted text-xs">{tk.requesterName ?? tk.requesterEmail}</span>}
                </span>
              </td>
              {showCompany && <td>{tk.company?.name ?? '—'}</td>}
              <td>
                <span className={`to-chip ${PRIORITY_CHIP[tk.priority]}`}>{t(`tickets.priority.${tk.priority}`)}</span>
              </td>
              <td>{t(`tickets.status.${tk.status}`)}</td>
              <td className="text-sm">
                {!open(tk) ? (
                  <span className={tk.sla.resolutionBreached ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}>
                    {tk.sla.resolutionBreached ? t('tickets.sla.resolvedLate') : t('tickets.sla.resolvedOnTime')}
                  </span>
                ) : tk.sla.overdue ? (
                  <span className="font-semibold text-red-700 dark:text-red-300">{t('tickets.sla.overdue')}</span>
                ) : (
                  <span>{t(tk.firstRespondedAt ? 'tickets.sla.resolveBy' : 'tickets.sla.respondBy', { date: date(tk.firstRespondedAt ? tk.resolutionDueAt : tk.firstResponseDueAt) })}</span>
                )}
              </td>
              <td className="text-sm">{tk.assigneeId ? (name.get(tk.assigneeId) ?? '—') : <span className="ex-muted">{t('tickets.unassigned')}</span>}</td>
            </tr>
          ))}
        </TableBody>
      </table>
    </div>
  );
}

export default function TicketsPage({ token, userId }: { token: string; userId: string }) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const permissions = usePermissions();
  const canManage = permissions.has('manage_company');
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'open' | 'closed' | 'all'>('open');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [tickets, setTickets] = useState<ClientTicket[] | null>(null);
  const [users, setUsers] = useState<Users>([]);
  const [creating, setCreating] = useState(false);
  const openId = params.get('open');

  useEffect(() => {
    api.listUserDirectory(token).then(setUsers).catch(() => setUsers([]));
  }, [token]);

  const load = useCallback(() => {
    api
      .listClientTickets(token, { view, assigneeId: mine ? userId : undefined, q: q || undefined })
      .then(setTickets)
      .catch((e) => toast.error((e as Error).message));
  }, [token, view, mine, userId, q, toast]);
  useEffect(() => {
    const h = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(h);
  }, [load, q]);

  return (
    <div className="container sh-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="to-title">{t('tickets.title')}</h2>
          <p className="to-subtitle max-w-3xl">{t('tickets.subtitle')}</p>
        </div>
        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            {t('tickets.new')}
          </button>
        )}
      </div>
      <div className="ex-filters">
        <div className="mini-toggle-row">
          {(['open', 'closed', 'all'] as const).map((v) => (
            <button key={v} type="button" className={`mini-toggle-opt ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {t(`tickets.views.${v}`)}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t('tickets.mine')}
        </label>
        <input className="max-w-72 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tickets.search')} aria-label={t('tickets.search')} />
      </div>
      {tickets === null ? <TableSkeleton rows={6} /> : <TicketsTable tickets={tickets} users={users} onOpen={(id) => setParams({ open: id })} onAdd={canManage ? () => setCreating(true) : undefined} />}
      <p className="ex-hint">{t('tickets.slaNote')}</p>

      {openId && (
        <TicketModal
          token={token}
          id={openId}
          users={users}
          canManage={canManage}
          onClose={() => {
            params.delete('open');
            setParams(params, { replace: true });
          }}
          onChanged={load}
        />
      )}
      {creating && (
        <NewTicketModal
          token={token}
          users={users}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setParams({ open: id });
            load();
          }}
        />
      )}
    </div>
  );
}

export function NewTicketModal({
  token,
  users,
  companyId,
  onClose,
  onCreated,
}: {
  token: string;
  users: Users;
  companyId?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'normal' as ClientTicketPriority, companyId: companyId ?? '', requesterEmail: '', assigneeId: '' });
  useEffect(() => {
    if (!companyId) api.listCompanies(token).then(setCompanies).catch(() => setCompanies([]));
  }, [token, companyId]);

  const submit = async () => {
    try {
      const tk = await api.createClientTicket(token, {
        subject: form.subject,
        description: form.description || null,
        priority: form.priority,
        companyId: form.companyId || null,
        requesterEmail: form.requesterEmail || null,
        assigneeId: form.assigneeId || null,
      });
      toast.success(t('tickets.created', { number: tk.number }));
      onCreated(tk.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Modal
      open
      title={t('tickets.new')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('tickets.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={!form.subject.trim()} onClick={submit}>
            {t('tickets.create')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="ex-field">
          <span>
            {t('tickets.columns.subject')}
            <RequiredMark />
          </span>
          <input maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </label>
        <label className="ex-field">
          {t('tickets.description')}
          <textarea rows={4} maxLength={10000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="ex-field">
            {t('tickets.columns.priority')}
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as ClientTicketPriority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`tickets.priority.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="ex-field">
            {t('tickets.columns.assignee')}
            <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">{t('tickets.unassigned')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </label>
          {!companyId && (
            <label className="ex-field">
              {t('tickets.columns.company')}
              <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                <option value="">—</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="ex-field">
            {t('tickets.requesterEmail')}
            <input type="email" value={form.requesterEmail} onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

export function TicketModal({
  token,
  id,
  users,
  canManage,
  onClose,
  onChanged,
}: {
  token: string;
  id: string;
  users: Users;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const date = useTicketDate();
  const [tk, setTk] = useState<ClientTicket | null>(null);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const name = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  useEffect(() => {
    api
      .getClientTicket(token, id)
      .then(setTk)
      .catch((e) => {
        toast.error((e as Error).message);
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  const patch = async (input: Parameters<typeof api.updateClientTicket>[2]) => {
    try {
      setTk(await api.updateClientTicket(token, id, input));
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const send = async () => {
    try {
      setTk(await api.addClientTicketComment(token, id, { body: reply, internal }));
      setReply('');
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!tk) return null;
  return (
    <Modal open wide title={`#${tk.number} · ${tk.subject}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="ex-field">
            {t('tickets.columns.status')}
            <select disabled={!canManage} value={tk.status} onChange={(e) => patch({ status: e.target.value as ClientTicketStatus })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`tickets.status.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="ex-field">
            {t('tickets.columns.priority')}
            <select disabled={!canManage} value={tk.priority} onChange={(e) => patch({ priority: e.target.value as ClientTicketPriority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`tickets.priority.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="ex-field">
            {t('tickets.columns.assignee')}
            <select disabled={!canManage} value={tk.assigneeId ?? ''} onChange={(e) => patch({ assigneeId: e.target.value || null })}>
              <option value="">{t('tickets.unassigned')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="ex-muted m-0 text-sm">
          {[tk.company?.name, tk.requesterName ?? tk.requesterEmail, t(`tickets.source.${tk.source}`, { defaultValue: tk.source }), date(tk.createdAt)].filter(Boolean).join(' · ')}
        </p>
        <p className={`m-0 text-sm ${tk.sla.overdue ? 'font-semibold text-red-700 dark:text-red-300' : ''}`}>
          {t('tickets.sla.detail', { response: date(tk.firstResponseDueAt), resolution: date(tk.resolutionDueAt) })}
          {tk.firstRespondedAt ? ` · ${t('tickets.sla.respondedAt', { date: date(tk.firstRespondedAt) })}` : ''}
        </p>
        {tk.description && <p className="m-0 rounded-lg border border-line p-3 text-sm whitespace-pre-line dark:border-dark-line">{tk.description}</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(tk.comments ?? []).map((c) => (
            <li key={c.id} className={`rounded-lg p-3 text-sm ${c.internal ? 'border border-dashed border-amber-400/60 bg-amber-50 dark:bg-amber-400/10' : 'bg-surface-1 dark:bg-dark-raised'}`}>
              <span className="ex-muted mb-1 block text-xs">
                {c.authorId ? name.get(c.authorId) : '—'} · {date(c.createdAt)}
                {c.internal ? ` · ${t('tickets.internal')}` : ''}
              </span>
              <span className="whitespace-pre-line">{c.body}</span>
            </li>
          ))}
        </ul>
        {canManage && (
          <div className="flex flex-col gap-2">
            <textarea rows={3} maxLength={10000} value={reply} placeholder={internal ? t('tickets.notePlaceholder') : t('tickets.replyPlaceholder')} aria-label={t('tickets.replyPlaceholder')} onChange={(e) => setReply(e.target.value)} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                {t('tickets.internalToggle')}
              </label>
              <button type="button" className="btn-primary btn-sm" disabled={!reply.trim()} onClick={send}>
                {internal ? t('tickets.addNote') : t('tickets.addReply')}
              </button>
            </div>
            <span className="ex-hint">{t('tickets.replyHint')}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
