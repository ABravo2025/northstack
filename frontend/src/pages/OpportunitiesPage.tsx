import { useEffect, useRef, useState } from 'react';
import { api, type Opportunity, type Pipeline } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import SlideOver from '../components/SlideOver';
import KanbanBoard from '../components/KanbanBoard';
import OpportunityDetailModal from '../components/OpportunityDetailModal';
import { formatMoney } from '../lib/currencies';
import { PlusIcon } from '../components/Icons';

interface OpportunitiesPageProps {
  user: any;
  token: string;
}

const emptyForm = {
  name: '',
  companyId: '',
  stageId: '',
  amountCents: '',
  currency: 'USD',
  estimatedCloseDate: '',
  ownerId: '',
  lossReasonId: '',
  nextStepDate: '',
  nextStepNote: '',
};

export default function OpportunitiesPage({ user, token }: OpportunitiesPageProps) {
  const toast = useToast();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [lossReasons, setLossReasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('');
  const [slideOverMode, setSlideOverMode] = useState<'add' | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Opportunity | null>(null);
  const [form, setForm] = useState(emptyForm);

  const canEdit = user.role === 'owner' || user.role === 'admin';

  // React.StrictMode (main.tsx) double-invokes effects in dev, so this body
  // runs twice on mount — without this guard, the second run's "default to
  // the first active pipeline" would silently override a tab the user had
  // already clicked between the two invocations. The ref (not state) is what
  // makes the guard actually work: state captured in this effect's closure
  // is frozen at its initial (empty) value for both invocations since the
  // deps array is `[]`, so checking `!activeTab` here would never see the
  // update from invocation one by the time invocation two runs.
  const hasSetInitialTab = useRef(false);

  useEffect(() => {
    Promise.all([
      api.listPipelines(token),
      api.listOpportunities(token),
      api.listCompanies(token),
      api.listContacts(token),
      api.listTenantUsers(token),
      api.listFieldCatalogDefinitions(token, 'lossReason'),
      api.getCurrentTenant(token),
    ])
      .then(([pipelinesData, oppsData, companiesData, contactsData, usersData, lossReasonsData, tenant]) => {
        setPipelines(pipelinesData);
        setOpportunities(oppsData);
        setCompanies(companiesData);
        setContacts(contactsData);
        setTenantUsers(usersData);
        setLossReasons(lossReasonsData.filter((d) => d.isActive));
        setForm((f) => ({ ...f, currency: tenant.currency }));
        if (!hasSetInitialTab.current) {
          const firstActive = pipelinesData.find((p) => p.isActive);
          if (firstActive) setActiveTab(firstActive.id);
          hasSetInitialTab.current = true;
        }
      })
      .catch((error) => toast.error('Failed to load: ' + (error as Error).message))
      .finally(() => setLoading(false));
    setLoading(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadOpportunities = () => {
    api.listOpportunities(token).then(setOpportunities).catch(() => {});
  };

  const activePipelines = pipelines.filter((p) => p.isActive);
  const archivedPipelineIds = new Set(pipelines.filter((p) => !p.isActive).map((p) => p.id));
  const currentPipeline = activePipelines.find((p) => p.id === activeTab);
  const archivedOpportunities = opportunities.filter((o) => archivedPipelineIds.has(o.pipelineId));

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setForm((f) => ({ ...emptyForm, currency: f.currency }));
  };

  const handleOpenAdd = () => {
    const firstStage = currentPipeline?.stages.filter((s) => s.isActive).sort((a, b) => a.order - b.order)[0];
    setForm((f) => ({ ...emptyForm, currency: f.currency, stageId: firstStage?.id || '' }));
    setSlideOverMode('add');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = Math.round(Number.parseFloat(form.amountCents || '0') * 100);
    try {
      await api.createOpportunity(token, {
        name: form.name,
        companyId: form.companyId,
        pipelineId: activeTab,
        stageId: form.stageId || undefined,
        amountCents,
        currency: form.currency,
        estimatedCloseDate: form.estimatedCloseDate || undefined,
        ownerId: form.ownerId,
        nextStepDate: form.nextStepDate || undefined,
        nextStepNote: form.nextStepNote || undefined,
      });
      toast.success('Opportunity created.');
      closeSlideOver();
      reloadOpportunities();
    } catch (error) {
      toast.error('Failed to save opportunity: ' + (error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteOpportunity(token, deleting.id);
      toast.success(`${deleting.name} deleted.`);
      setDeleting(null);
      reloadOpportunities();
    } catch (error) {
      toast.error('Failed to delete: ' + (error as Error).message);
      setDeleting(null);
    }
  };

  const handleMove = async (opp: Opportunity, newStageId: string) => {
    try {
      await api.updateOpportunity(token, opp.id, { stageId: newStageId });
      reloadOpportunities();
    } catch (error) {
      toast.error('Failed to move: ' + (error as Error).message);
    }
  };

  const selectedStage = currentPipeline?.stages.find((s) => s.id === form.stageId);

  if (loading) {
    return (
      <div className="page-full">
        <p className="mt-4">Loading...</p>
      </div>
    );
  }

  return (
    <div className="page-full">
      {deleting && (
        <ConfirmDialog
          title="Delete opportunity"
          message={`Are you sure you want to delete "${deleting.name}"? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      <SlideOver
        open={slideOverMode === 'add'}
        title="Add Opportunity"
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              Cancel
            </button>
            <button type="submit" form="opportunity-form" className="btn-primary">
              Create
            </button>
          </>
        }
      >
        {slideOverMode === 'add' && (
          <form id="opportunity-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="opp-name">Deal Name</label>
              <input id="opp-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="opp-companyId">Company</label>
              <select
                id="opp-companyId"
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                required
              >
                <option value="">-- select --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="opp-amount">Amount</label>
              <input
                id="opp-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amountCents}
                onChange={(e) => setForm({ ...form, amountCents: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="opp-currency">Currency</label>
              <input
                id="opp-currency"
                type="text"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                maxLength={3}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="opp-ownerId">Owner</label>
              <select id="opp-ownerId" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} required>
                <option value="">-- select --</option>
                {tenantUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="opp-estimatedCloseDate">Estimated Close Date</label>
              <input
                id="opp-estimatedCloseDate"
                type="date"
                value={form.estimatedCloseDate}
                onChange={(e) => setForm({ ...form, estimatedCloseDate: e.target.value })}
              />
            </div>
            {selectedStage?.outcome === 'lost' && (
              <div className="form-group">
                <label htmlFor="opp-lossReasonId">Loss Reason</label>
                <select
                  id="opp-lossReasonId"
                  value={form.lossReasonId}
                  onChange={(e) => setForm({ ...form, lossReasonId: e.target.value })}
                  required
                >
                  <option value="">-- select --</option>
                  {lossReasons.map((lr) => (
                    <option key={lr.id} value={lr.id}>
                      {lr.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="opp-nextStepDate">Next Step Date</label>
              <input
                id="opp-nextStepDate"
                type="date"
                value={form.nextStepDate}
                onChange={(e) => setForm({ ...form, nextStepDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="opp-nextStepNote">Next Step</label>
              <input
                id="opp-nextStepNote"
                type="text"
                value={form.nextStepNote}
                onChange={(e) => setForm({ ...form, nextStepNote: e.target.value })}
                placeholder="What's the next action?"
              />
            </div>
          </form>
        )}
      </SlideOver>

      {viewingId &&
        (() => {
          const viewingOpportunity = opportunities.find((o) => o.id === viewingId);
          if (!viewingOpportunity) return null;
          return (
            <OpportunityDetailModal
              opportunity={viewingOpportunity}
              token={token}
              companies={companies}
              contacts={contacts}
              pipelines={pipelines}
              tenantUsers={tenantUsers}
              lossReasons={lossReasons}
              currentUserId={user.id}
              onClose={() => setViewingId(null)}
              onChanged={reloadOpportunities}
            />
          );
        })()}

      <div className="page-toolbar">
        <h2>Opportunities</h2>
        {canEdit && currentPipeline && (
          <button className="btn-primary btn-toolbar-size" onClick={handleOpenAdd}>
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="h-4 w-4" />
              Add Opportunity
            </span>
          </button>
        )}
      </div>

      <div className="views-bar">
        {activePipelines.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`view-tab ${activeTab === p.id ? 'active' : ''}`}
            onClick={() => setActiveTab(p.id)}
          >
            {p.name}
          </button>
        ))}
        {archivedOpportunities.length > 0 && (
          <button
            type="button"
            className={`view-tab ${activeTab === 'archived' ? 'active' : ''}`}
            onClick={() => setActiveTab('archived')}
          >
            Archived
          </button>
        )}
      </div>

      {activeTab === 'archived' ? (
        <div className="mt-4 flex flex-col gap-2">
          {archivedOpportunities.map((opp) => (
            <div key={opp.id} className="card">
              <strong>{opp.name}</strong> — {opp.company?.name} — {formatMoney(opp.amountCents, opp.currency)} —{' '}
              {opp.stage?.name} (read-only, pipeline archived)
            </div>
          ))}
        </div>
      ) : currentPipeline ? (
        <KanbanBoard
          columns={currentPipeline.stages
            .filter((s) => s.isActive)
            .sort((a, b) => a.order - b.order)
            .map((s) => ({ key: s.id, label: s.name, color: s.color }))}
          items={opportunities.filter((o) => o.pipelineId === currentPipeline.id)}
          getItemKey={(o) => o.id}
          getItemColumn={(o) => o.stageId}
          onMove={canEdit ? handleMove : () => {}}
          renderCard={(opp) => (
            <div onClick={() => setViewingId(opp.id)} style={{ cursor: 'pointer' }}>
              <div className="kc-name">{opp.name}</div>
              <div className="kc-meta">{opp.company?.name}</div>
              <div className="kc-meta">{formatMoney(opp.amountCents, opp.currency)}</div>
              {opp.nextStepNote && <div className="kc-meta">Next: {opp.nextStepNote}</div>}
            </div>
          )}
          renderColumnFooter={
            canEdit
              ? () => (
                  <div className="kanban-ghost-card" onClick={handleOpenAdd}>
                    <span className="ghost-plus-box">
                      <PlusIcon className="h-3 w-3" />
                    </span>
                    Add
                  </div>
                )
              : undefined
          }
        />
      ) : (
        <p className="mt-4">No active pipelines. Create one in Settings → Pipelines.</p>
      )}
    </div>
  );
}
