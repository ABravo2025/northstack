import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ClientTicket } from '../../../api';
import { NewTicketModal, TicketModal, TicketsTable } from '../../../pages/tickets/TicketsPage';

// Clientes C7: the company's tickets, open first, in its 360 view.
export default function CompanyTicketsTab({ token, companyId, canManage }: { token: string; companyId: string; canManage: boolean }) {
  const { t } = useTranslation('crm');
  const [tickets, setTickets] = useState<ClientTicket[] | null>(null);
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.listClientTickets(token, { view: 'all', companyId }).then(setTickets).catch(() => setTickets([]));
  }, [token, companyId]);
  useEffect(load, [load]);
  useEffect(() => {
    api.listUserDirectory(token).then(setUsers).catch(() => setUsers([]));
  }, [token]);

  return (
    <div className="overview-panel-left">
      <div className="field-group border-b-0">
        <h4 className="field-group-title">{t('tickets.title')}</h4>
        {tickets === null ? (
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.loading')}</p>
        ) : (
          <TicketsTable tickets={tickets} users={users} showCompany={false} onOpen={setOpen} onAdd={canManage ? () => setCreating(true) : undefined} />
        )}
      </div>
      {open && <TicketModal token={token} id={open} users={users} canManage={canManage} onClose={() => setOpen(null)} onChanged={load} />}
      {creating && (
        <NewTicketModal
          token={token}
          users={users}
          companyId={companyId}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setOpen(id);
            load();
          }}
        />
      )}
    </div>
  );
}
