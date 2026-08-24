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
  pipelineId: '',
  companyId: '',
  // `lead`-pipeline path only (docs/tareas/specredisenosalesv2.md §3.4's
  // "generic modal" — same pattern as ContactDetailModal.tsx's inline
  // Opportunity creation, generalized since there's no starting Contact/
  // Company here): link an existing Contact via contactId, or fill the three
  // newContact* fields to create one. leadCompanyName only matters when the
  // resolved Contact has no Company yet — it becomes a placeholder Company.
  contactId: '',
  newContactFirstName: '',
  newContactLastName: '',
  newContactEmail: '',
  leadCompanyName: '',
  stageId: '',
  amountCents: '',
  currency: 'USD',
  estimatedCloseDate: '',
  ownerId: '',
  lossReasonId: '',
  winReasonId: '',
  closeNote: '',
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
  // Unfiltered (active + inactive) — FieldCatalogMenu manages both; anywhere
  // these are offered as select options, filter to isActive at that point
  // (same idiom as CompaniesPage.tsx's companySizes).
  const [lossReasons, setLossReasons] = useState<any[]>([]);
  const [winReasons, setWinReasons] = useState<any[]>([]);
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
      api.listFieldCatalogDefinitions(token, 'winReason'),
      api.getCurrentTenant(token),
    ])
      .then(([pipelinesData, oppsData, companiesData, contactsData, usersData, lossReasonsData, winReasonsData, tenant]) => {
        setPipelines(pipelinesData);
        setOpportunities(oppsData);
        setCompanies(companiesData);
        setContacts(contactsData);
        setTenantUsers(usersData);
        setLossReasons(lossReasonsData);
        setWinReasons(winReasonsData);
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

  const reloadReasonCatalogs = () => {
    Promise.all([api.listFieldCatalogDefinitions(token, 'lossReason'), api.listFieldCatalogDefinitions(token, 'winReason')])
      .then(([lr, wr]) => {
        setLossReasons(lr);
        setWinReasons(wr);
      })
      .catch(() => {});
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

  // Weighted pipeline value (docs/tareas/specredisenosalesv2.md §3.5):
  // Σ (amountCents × stage.probability / 100) over open-outcome Opportunities
  // in the currently viewed pipeline — replaces a plain sum, since a deal
  // sitting in an early low-probability stage shouldn't count toward the
  // forecast the same as one about to close.
  const currentPipelineOpenOpportunities = currentPipeline
    ? opportunities.filter((o) => o.pipelineId === currentPipeline.id && o.stage?.outcome === 'open')
    : [];
  const weightedPipelineTotalCents = currentPipelineOpenOpportunities.reduce(
    (sum, o) => sum + o.amountCents * ((o.stage?.probability ?? 100) / 100),
    0,
  );
  const weightedPipelineCurrency = currentPipelineOpenOpportunities[0]?.currency;

  // Pipeline chosen inside the Add form — starts out equal to the active
  // Kanban tab (handleOpenAdd) but is independently changeable
  // (docs/tareas/specredisenosalesv2.md §3.4's "generic modal": pick a
  // Pipeline first, of any type). Deliberately separate from
  // `currentPipeline` above, which drives the Kanban board itself.
  const formPipeline = activePipelines.find((p) => p.id === form.pipelineId);

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setForm((f) => ({ ...emptyForm, currency: f.currency }));
    autoCreateGuard.reset();
  };

  const handleOpenAdd = () => {
    const firstStage = currentPipeline?.stages.filter((s) => s.isActive).sort((a, b) => a.order - b.order)[0];
    setForm((f) => ({ ...emptyForm, currency: f.currency, pipelineId: currentPipeline?.id || '', stageId: firstStage?.id || '' }));
    autoCreateGuard.reset();
    setSlideOverMode('add');
  };

  // Switching Pipeline resets the type-specific fields (Company vs.
  // Contact/placeholder-Company-name) — carrying over, say, a chosen Company
  // after switching from `account` to `lead` would silently ignore it, since
  // the `lead` branch below never reads `companyId`.
  const handleFormPipelineChange = (pipelineId: string) => {
    const pipeline = activePipelines.find((p) => p.id === pipelineId);
    const firstStage = pipeline?.stages.filter((s) => s.isActive).sort((a, b) => a.order - b.order)[0];
    const next = {
      ...form,
      pipelineId,
      stageId: firstStage?.id || '',
      companyId: '',
      contactId: '',
      newContactFirstName: '',
      newContactLastName: '',
      newContactEmail: '',
      leadCompanyName: '',
    };
    setForm(next);
    attemptAutoCreateOpportunity(next);
  };

  // Ready once Pipeline, Deal Name, Owner, Amount and Currency are all
  // filled/valid, plus whatever the pipeline's `type` requires (an
  // already-identified Company for `account`; a Contact — existing or new —
  // for `lead`, with a Company name too unless that Contact already has one)
  // and Loss Reason if the selected stage is already a "lost" stage. Takes an
  // explicit candidate so the <select>s can check readiness against the value
  // from the change event directly, instead of racing React's async setState
  // the way reading `form` here would.
  const isOpportunityAddReady = (candidate: typeof form = form) => {
    if (!candidate.pipelineId || !candidate.name.trim() || !candidate.ownerId) return false;
    if (!isLikelyValidAmount(candidate.amountCents)) return false;
    if (!candidate.currency.trim()) return false;

    const pipeline = activePipelines.find((p) => p.id === candidate.pipelineId);
    if (pipeline?.type === 'lead') {
      const existingContact = candidate.contactId ? contacts.find((c: any) => c.id === candidate.contactId) : null;
      const hasNewContact =
        candidate.newContactFirstName.trim() && candidate.newContactLastName.trim() && candidate.newContactEmail.trim();
      if (!existingContact && !hasNewContact) return false;
      const needsCompanyName = !existingContact?.companyId;
      if (needsCompanyName && !candidate.leadCompanyName.trim()) return false;
    } else if (!candidate.companyId) {
      return false;
    }

    const stage = pipeline?.stages.find((s) => s.id === candidate.stageId);
    if (stage?.outcome === 'lost' && !candidate.lossReasonId) return false;
    if (stage?.outcome === 'won' && !candidate.winReasonId) return false;
    return true;
  };

  // Shared by the manual "Create" button and the auto-create-on-commit path
  // below (both go through autoCreateGuard). On success, the Add form is
  // replaced by the real OpportunityDetailModal for the new deal.
  const performCreateOpportunity = async (candidate: typeof form = form) => {
    const amountCents = Math.round(Number.parseFloat(candidate.amountCents || '0') * 100);
    const pipeline = activePipelines.find((p) => p.id === candidate.pipelineId);

    let companyId = candidate.companyId;
    let contactIdToLink: string | null = null;

    if (pipeline?.type === 'lead') {
      let contact = candidate.contactId ? contacts.find((c: any) => c.id === candidate.contactId) : null;
      if (!contact) {
        contact = await api.createContact(token, {
          firstName: candidate.newContactFirstName.trim(),
          lastName: candidate.newContactLastName.trim(),
          email: candidate.newContactEmail.trim(),
        });
      }
      contactIdToLink = contact.id;
      if (contact.companyId) {
        companyId = contact.companyId;
      } else {
        const createdCompany = await api.createCompany(token, {
          name: candidate.leadCompanyName.trim(),
          contact: { contactId: contact.id },
          isPlaceholder: true,
        });
        companyId = createdCompany.id;
      }
    }

    const opportunity = await api.createOpportunity(token, {
      name: candidate.name.trim(),
      companyId,
      pipelineId: candidate.pipelineId,
      stageId: candidate.stageId || undefined,
      amountCents,
      currency: candidate.currency,
      estimatedCloseDate: candidate.estimatedCloseDate || undefined,
      ownerId: candidate.ownerId,
      // Not previously sent even though isOpportunityAddReady already
      // required it for a stage landing directly on Lost — the backend would
      // have rejected the create over its own missing-lossReasonId check,
      // same rule now applying symmetrically to winReasonId.
      lossReasonId: candidate.lossReasonId || undefined,
      winReasonId: candidate.winReasonId || undefined,
      closeNote: candidate.closeNote || undefined,
      nextStepDate: candidate.nextStepDate || undefined,
      nextStepNote: candidate.nextStepNote || undefined,
    });
    if (contactIdToLink) {
      await api.addOpportunityContact(token, opportunity.id, { contactId: contactIdToLink });
    }
    if (pipeline?.type === 'lead') {
      // A new Contact/placeholder Company may have just been created —
      // refresh both so the detail modal that opens next (and the Kanban
      // card behind it) reflect them immediately.
      const [freshCompanies, freshContacts] = await Promise.all([api.listCompanies(token), api.listContacts(token)]);
      setCompanies(freshCompanies);
      setContacts(freshContacts);
    }
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
      // Dropping a card onto a `won` stage inside a `lead` pipeline opens the
      // detail modal so the "move to account pipeline?" offer
      // (OpportunityDetailModal.tsx, docs/tareas/specredisenosalesv2.md §3.3)
      // surfaces right away instead of silently waiting for the next manual
      // open of this deal.
      const oppPipeline = pipelines.find((p) => p.id === opp.pipelineId);
      const targetStage = oppPipeline?.stages.find((s) => s.id === newStageId);
      if (oppPipeline?.type === 'lead' && targetStage?.outcome === 'won') {
        setViewingId(opp.id);
      }
    } catch (error) {
      toast.error('Failed to move: ' + (error as Error).message);
    }
  };

  const selectedStage = formPipeline?.stages.find((s) => s.id === form.stageId);

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
                <Field label="Pipeline" required>
                  <select
                    id="opp-pipelineId"
                    className="overview-field-input"
                    value={form.pipelineId}
                    onChange={(e) => handleFormPipelineChange(e.target.value)}
                    required
                  >
                    <option value="">-- select --</option>
                    {activePipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
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
                {formPipeline?.type === 'lead' ? (
                  <>
                    <Field label="Contact" required>
                      <select
                        id="opp-contactId"
                        className="overview-field-input"
                        value={form.contactId}
                        onChange={(e) => {
                          const next = { ...form, contactId: e.target.value };
                          setForm(next);
                          attemptAutoCreateOpportunity(next);
                        }}
                      >
                        <option value="">-- select an existing contact --</option>
                        {contacts.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.firstName} {c.lastName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {!form.contactId && (
                      <>
                        <Field label="New contact — first name" required>
                          <input
                            className="overview-field-input"
                            value={form.newContactFirstName}
                            onChange={(e) => setForm({ ...form, newContactFirstName: e.target.value })}
                            onBlur={() => attemptAutoCreateOpportunity()}
                            required
                          />
                        </Field>
                        <Field label="New contact — last name" required>
                          <input
                            className="overview-field-input"
                            value={form.newContactLastName}
                            onChange={(e) => setForm({ ...form, newContactLastName: e.target.value })}
                            onBlur={() => attemptAutoCreateOpportunity()}
                            required
                          />
                        </Field>
                        <Field label="New contact — email" required>
                          <input
                            className="overview-field-input"
                            type="email"
                            value={form.newContactEmail}
                            onChange={(e) => setForm({ ...form, newContactEmail: e.target.value })}
                            onBlur={() => attemptAutoCreateOpportunity()}
                            required
                          />
                        </Field>
                      </>
                    )}
                    {!contacts.find((c: any) => c.id === form.contactId)?.companyId && (
                      <Field label="Company name" required>
                        <input
                          id="opp-leadCompanyName"
                          className="overview-field-input"
                          value={form.leadCompanyName}
                          onChange={(e) => setForm({ ...form, leadCompanyName: e.target.value })}
                          onBlur={() => attemptAutoCreateOpportunity()}
                          placeholder="Company name (not yet a confirmed account)"
                          required
                        />
                      </Field>
                    )}
                  </>
                ) : (
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
                      {companies
                        .filter((c: any) => !c.isPlaceholder)
                        .map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
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

            {(selectedStage?.outcome === 'lost' || selectedStage?.outcome === 'won') && (
              <div className="field-group">
                <h4 className="field-group-title">Stage</h4>
                <div className="field-group-body">
                  {selectedStage?.outcome === 'lost' && (
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
                        {lossReasons
                          .filter((lr: any) => lr.isActive)
                          .map((lr: any) => (
                            <option key={lr.id} value={lr.id}>
                              {lr.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                  {selectedStage?.outcome === 'won' && (
                    <Field label="Win Reason" required>
                      <select
                        id="opp-winReasonId"
                        className="overview-field-input"
                        value={form.winReasonId}
                        onChange={(e) => {
                          const next = { ...form, winReasonId: e.target.value };
                          setForm(next);
                          attemptAutoCreateOpportunity(next);
                        }}
                        required
                      >
                        <option value="">-- select --</option>
                        {winReasons
                          .filter((wr: any) => wr.isActive)
                          .map((wr: any) => (
                            <option key={wr.id} value={wr.id}>
                              {wr.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Close Note" full>
                    <input
                      id="opp-closeNote"
                      className="overview-field-input"
                      type="text"
                      value={form.closeNote}
                      onChange={(e) => setForm({ ...form, closeNote: e.target.value })}
                      placeholder="Optional details about how this deal closed"
                    />
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
              winReasons={winReasons}
              onReasonsChanged={reloadReasonCatalogs}
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
        {currentPipeline && weightedPipelineCurrency && (
          <span className="text-sm text-ink-muted" title="Σ (amount × stage probability) across open deals in this pipeline">
            Weighted value: {formatMoney(Math.round(weightedPipelineTotalCents), weightedPipelineCurrency)}
          </span>
        )}
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
          renderColumnTotal={(colItems) => {
            if (colItems.length === 0) return null;
            // Weighted for `open` stages (§3.5); won/lost columns show the
            // plain actual total — probability there is a forced 100/0
            // forecast artifact, not meant to zero out an already-lost
            // column's real dollar total.
            const isOpen = colItems[0].stage?.outcome === 'open';
            const total = colItems.reduce(
              (sum, o) => sum + (isOpen ? o.amountCents * ((o.stage?.probability ?? 100) / 100) : o.amountCents),
              0,
            );
            return formatMoney(Math.round(total), colItems[0].currency);
          }}
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
