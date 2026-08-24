import { useEffect, useRef, useState } from 'react';
import { api, type Opportunity, type Pipeline } from '../api';
import { useToast } from '../components/common/ToastProvider';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import KanbanBoard from '../components/entity-views/KanbanBoard';
import OpportunityDetailModal from '../components/crm/OpportunityDetailModal';
import EmptyState from '../components/common/EmptyState';
import TableSkeleton from '../components/common/TableSkeleton';
import Field from '../components/common/Field';
import { formatMoney } from '../lib/currencies';
import { getInitials } from '../components/common/Avatar';
import { PlusIcon, TargetIcon } from '../components/common/Icons';
import { useAutoCreateGuard } from '../hooks/useAutoCreateGuard';

// A deal that hasn't moved stage in this many days shows its age in red (.kc-age.late).
const LATE_STAGE_DAYS_THRESHOLD = 14;

function daysSince(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// Local to this form -- no other "Add" form has a required money field, so
// this isn't pulled into lib/validation.ts alongside isLikelyValidEmail.
function isLikelyValidAmount(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const parsed = Number.parseFloat(trimmed);
  return !Number.isNaN(parsed) && parsed >= 0;
}

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
  const autoCreateGuard = useAutoCreateGuard();

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

  // Instant row update from a PATCH response, no round-trip wait (found
  // 2026-07-30, same fix as Employee/Company/Contact) — paired with
  // reloadOpportunities above, since updateOpportunity's response carries no
  // relations at all (company/pipeline/stage/owner/contactLinks/
  // stageHistory all come from the follow-up background refresh instead).
  const patchOpportunityInList = (updated: Opportunity) => {
    setOpportunities((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
  };

  const activePipelines = pipelines.filter((p) => p.isActive);
  const archivedPipelineIds = new Set(pipelines.filter((p) => !p.isActive).map((p) => p.id));
  const currentPipeline = activePipelines.find((p) => p.id === activeTab);
  const archivedOpportunities = opportunities.filter((o) => archivedPipelineIds.has(o.pipelineId));

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setForm((f) => ({ ...emptyForm, currency: f.currency }));
    autoCreateGuard.reset();
  };

  const handleOpenAdd = () => {
    const firstStage = currentPipeline?.stages.filter((s) => s.isActive).sort((a, b) => a.order - b.order)[0];
    setForm((f) => ({ ...emptyForm, currency: f.currency, stageId: firstStage?.id || '' }));
    autoCreateGuard.reset();
    setSlideOverMode('add');
  };

  // Ready once Deal Name, Company, Owner, Amount and Currency are all
  // filled/valid, plus Loss Reason if the selected stage is already a "lost"
  // stage (matches the form's own required-field logic below). Takes an
  // explicit candidate so the two <select>s (Company/Owner) can check
  // readiness against the value from the change event directly, instead of
  // racing React's async setState the way reading `form` here would.
  const isOpportunityAddReady = (candidate: typeof form = form) => {
    if (!candidate.name.trim()) return false;
    if (!candidate.companyId || !candidate.ownerId) return false;
    if (!isLikelyValidAmount(candidate.amountCents)) return false;
    if (!candidate.currency.trim()) return false;
    const stage = currentPipeline?.stages.find((s) => s.id === candidate.stageId);
    if (stage?.outcome === 'lost' && !candidate.lossReasonId) return false;
    return true;
  };

  // Shared by the manual "Create" button and the auto-create-on-commit path
  // below (both go through autoCreateGuard). On success, the Add form is
  // replaced by the real OpportunityDetailModal for the new deal.
  const performCreateOpportunity = async (candidate: typeof form = form) => {
    const amountCents = Math.round(Number.parseFloat(candidate.amountCents || '0') * 100);
    const opportunity = await api.createOpportunity(token, {
      name: candidate.name.trim(),
      companyId: candidate.companyId,
      pipelineId: activeTab,
      stageId: candidate.stageId || undefined,
      amountCents,
      currency: candidate.currency,
      estimatedCloseDate: candidate.estimatedCloseDate || undefined,
      ownerId: candidate.ownerId,
      nextStepDate: candidate.nextStepDate || undefined,
      nextStepNote: candidate.nextStepNote || undefined,
    });
    toast.success('Opportunity created.');
    const freshList = await api.listOpportunities(token);
    setOpportunities(freshList);
    setSlideOverMode(null);
    setForm((f) => ({ ...emptyForm, currency: f.currency }));
    setViewingId(opportunity.id);
  };

  const attemptAutoCreateOpportunity = (candidate: typeof form = form) => {
    autoCreateGuard.attempt(isOpportunityAddReady(candidate), async () => {
      try {
        await performCreateOpportunity(candidate);
      } catch (error) {
        toast.error('Failed to save opportunity: ' + (error as Error).message);
        throw error;
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    autoCreateGuard.attempt(true, async () => {
      try {
        await performCreateOpportunity();
      } catch (error) {
        toast.error('Failed to save opportunity: ' + (error as Error).message);
        throw error;
      }
    });
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
        <TableSkeleton />
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

      <Modal
        open={slideOverMode === 'add'}
        title="Add Opportunity"
        onClose={closeSlideOver}
        wide
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
            <div className="field-group">
              <h4 className="field-group-title">Deal</h4>
              <div className="field-group-body">
                <Field label="Deal Name" required full>
                  <input
                    id="opp-name"
                    className="overview-field-input"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onBlur={() => attemptAutoCreateOpportunity()}
                    required
                  />
                </Field>
                <Field label="Company" required>
                  <select
                    id="opp-companyId"
                    className="overview-field-input"
                    value={form.companyId}
                    onChange={(e) => {
                      const next = { ...form, companyId: e.target.value };
                      setForm(next);
                      attemptAutoCreateOpportunity(next);
                    }}
                    required
                  >
                    <option value="">-- select --</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Owner" required>
                  <select
                    id="opp-ownerId"
                    className="overview-field-input"
                    value={form.ownerId}
                    onChange={(e) => {
                      const next = { ...form, ownerId: e.target.value };
                      setForm(next);
                      attemptAutoCreateOpportunity(next);
                    }}
                    required
                  >
                    <option value="">-- select --</option>
                    {tenantUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount" required>
                  <input
                    id="opp-amount"
                    className="overview-field-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amountCents}
                    onChange={(e) => setForm({ ...form, amountCents: e.target.value })}
                    onBlur={() => attemptAutoCreateOpportunity()}
                    required
                  />
                </Field>
                <Field label="Currency" required>
                  <input
                    id="opp-currency"
                    className="overview-field-input"
                    type="text"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                    onBlur={() => attemptAutoCreateOpportunity()}
                    maxLength={3}
                    required
                  />
                </Field>
              </div>
            </div>

            {selectedStage?.outcome === 'lost' && (
              <div className="field-group">
                <h4 className="field-group-title">Stage</h4>
                <div className="field-group-body">
                  <Field label="Loss Reason" required>
                    <select
                      id="opp-lossReasonId"
                      className="overview-field-input"
                      value={form.lossReasonId}
                      onChange={(e) => {
                        const next = { ...form, lossReasonId: e.target.value };
                        setForm(next);
                        attemptAutoCreateOpportunity(next);
                      }}
                      required
                    >
                      <option value="">-- select --</option>
                      {lossReasons.map((lr) => (
                        <option key={lr.id} value={lr.id}>
                          {lr.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            <div className="field-group">
              <h4 className="field-group-title">Next step</h4>
              <div className="field-group-body">
                <Field label="Estimated Close Date">
                  <input
                    id="opp-estimatedCloseDate"
                    className="overview-field-input"
                    type="date"
                    value={form.estimatedCloseDate}
                    onChange={(e) => setForm({ ...form, estimatedCloseDate: e.target.value })}
                  />
                </Field>
                <Field label="Next Step Date">
                  <input
                    id="opp-nextStepDate"
                    className="overview-field-input"
                    type="date"
                    value={form.nextStepDate}
                    onChange={(e) => setForm({ ...form, nextStepDate: e.target.value })}
                  />
                </Field>
                <Field label="Next Step" full>
                  <input
                    id="opp-nextStepNote"
                    className="overview-field-input"
                    type="text"
                    value={form.nextStepNote}
                    onChange={(e) => setForm({ ...form, nextStepNote: e.target.value })}
                    placeholder="What's the next action?"
                  />
                </Field>
              </div>
            </div>
          </form>
        )}
      </Modal>

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
              onSaved={patchOpportunityInList}
              onRequestDelete={() => {
                setViewingId(null);
                setDeleting(viewingOpportunity);
              }}
            />
          );
        })()}

      <div className="page-toolbar">
        <h2>Opportunities</h2>
        {canEdit && currentPipeline && (
          <button className="btn-primary" onClick={handleOpenAdd}>
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
      ) : currentPipeline ? opportunities.filter((o) => o.pipelineId === currentPipeline.id).length === 0 ? (
        canEdit ? (
          <EmptyState
            icon={<TargetIcon />}
            title="No opportunities here"
            body="Opportunities move deals through your pipeline stages."
            primaryLabel="Add opportunity"
            onPrimary={handleOpenAdd}
          />
        ) : (
          <p className="mt-4">No opportunities here.</p>
        )
      ) : (
        <KanbanBoard
          columns={currentPipeline.stages
            .filter((s) => s.isActive)
            .sort((a, b) => a.order - b.order)
            .map((s) => ({ key: s.id, label: s.name, color: s.color }))}
          items={opportunities.filter((o) => o.pipelineId === currentPipeline.id)}
          getItemKey={(o) => o.id}
          getItemColumn={(o) => o.stageId}
          onMove={canEdit ? handleMove : () => {}}
          renderCard={(opp) => {
            const mostRecentEntry = opp.stageHistory?.[0];
            const stageDays = mostRecentEntry ? daysSince(mostRecentEntry.enteredAt) : null;
            const isLate = stageDays !== null && stageDays > LATE_STAGE_DAYS_THRESHOLD;
            return (
              <div onClick={() => setViewingId(opp.id)} style={{ cursor: 'pointer' }}>
                <div className="kcard-top">
                  <div className="kc-name">{opp.name}</div>
                  <div className="kc-amount">{formatMoney(opp.amountCents, opp.currency)}</div>
                </div>
                <div className="kc-meta">{opp.company?.name}</div>
                <div className="kcard-foot">
                  <span className="kc-owner">{getInitials(opp.owner?.firstName, opp.owner?.lastName)}</span>
                  {stageDays !== null && (
                    <span className={`kc-age ${isLate ? 'late' : ''}`}>
                      {stageDays === 0 ? 'Entered today' : `${stageDays}d in stage`}
                    </span>
                  )}
                  {(opp.contactLinks?.length ?? 0) === 1 && (
                    <span className="kc-single-thread" title="Only one contact on this deal">
                      1 contact
                    </span>
                  )}
                </div>
              </div>
            );
          }}
          renderColumnTotal={(colItems) =>
            colItems.length === 0
              ? null
              : formatMoney(
                  colItems.reduce((sum, o) => sum + o.amountCents, 0),
                  colItems[0].currency,
                )
          }
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
