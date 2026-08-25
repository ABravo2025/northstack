import { useEffect, useState } from 'react';
import { api, type Company, type Contact, type Opportunity, type Pipeline } from '../../api';
import { useToast } from '../common/ToastProvider';
import AutoSaveField from '../common/AutoSaveField';
import AutoSaveSelect from '../common/AutoSaveSelect';
import DetailSidebar from '../layout/DetailSidebar';
import Field from '../common/Field';
import OverviewActionsMenu from '../common/OverviewActionsMenu';
import FieldCatalogMenu from '../entity-views/FieldCatalogMenu';
import { PlusIcon, XIcon } from '../common/Icons';

interface OpportunityDetailModalProps {
  opportunity: Opportunity;
  token: string;
  companies: Company[];
  contacts: Contact[];
  pipelines: Pipeline[];
  tenantUsers: any[];
  lossReasons: any[];
  winReasons: any[];
  // Reloads both lossReasons/winReasons after FieldCatalogMenu adds a new
  // option — separate from onChanged, which only refreshes the Opportunity
  // list itself (docs/tareas/specredisenosalesv2.md §3.7).
  onReasonsChanged: () => void;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
  onSaved: (updatedOpportunity: Opportunity) => void;
  onRequestDelete: () => void;
}

function daysSince(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export default function OpportunityDetailModal({
  opportunity,
  token,
  companies,
  contacts,
  pipelines,
  tenantUsers,
  lossReasons,
  winReasons,
  onReasonsChanged,
  currentUserId,
  onClose,
  onChanged,
  onSaved,
  onRequestDelete,
}: OpportunityDetailModalProps) {
  const toast = useToast();
  const [newContactId, setNewContactId] = useState('');
  const [newContactRole, setNewContactRole] = useState('');
  // Set only when a pipeline change targets an `account` pipeline whose
  // Company is still a placeholder (docs/tareas/specredisenosalesv2.md §3.6)
  // — the pipeline change is held until this inline form completes the
  // Company's real details and clears isPlaceholder, then retries.
  const [pendingPipelineId, setPendingPipelineId] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState({ industry: '', website: '', phone: '' });
  const [completingCompany, setCompletingCompany] = useState(false);
  // Set right after a stage change lands this Opportunity on a `won` stage
  // inside a `lead` pipeline (docs/tareas/specredisenosalesv2.md §3.3) — holds
  // the suggested target `account` pipeline for the "move to account
  // pipeline?" offer banner. Null means no offer showing.
  const [wonOfferPipelineId, setWonOfferPipelineId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const pipeline = pipelines.find((p) => p.id === opportunity.pipelineId);
  const sortedStages = (pipeline?.stages ?? []).filter((s) => s.isActive).sort((a, b) => a.order - b.order);
  const currentStage = sortedStages.find((s) => s.id === opportunity.stageId);
  const mostRecentEntry = opportunity.stageHistory?.[0];
  const timeInStage = mostRecentEntry ? daysSince(mostRecentEntry.enteredAt) : null;
  const linkedContactIds = new Set((opportunity.contactLinks ?? []).map((l) => l.contactId));
  const linkableContacts = contacts.filter((c) => !linkedContactIds.has(c.id));

  // Offers the "move to account pipeline?" banner whenever this Opportunity
  // is sitting on a `won` stage inside a `lead` pipeline — fires both right
  // after an internal stage-change save (opportunity.stageId updates via
  // onSaved) and when the modal is opened already in that state (e.g. right
  // after a Kanban drag-drop win, see OpportunitiesPage.tsx's handleMove).
  // Guard: an Opportunity already in an `account` pipeline has nowhere
  // further to offer moving to, so this is a no-op there
  // (docs/tareas/specredisenosalesv2.md §3.3).
  useEffect(() => {
    if (pipeline?.type !== 'lead' || currentStage?.outcome !== 'won') {
      return;
    }
    const accountPipelines = pipelines.filter((p) => p.type === 'account' && p.isActive);
    if (accountPipelines.length === 0) {
      return;
    }
    setWonOfferPipelineId(accountPipelines[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity.stageId, pipeline?.type]);

  // Two-part update: onSaved patches the row instantly with the PATCH
  // response (found by the user 2026-07-30 — the background-refetch-only fix
  // updated the row eventually but not "on time"), then onChanged still runs
  // a silent background re-fetch (already existed as reloadOpportunities) —
  // updateOpportunity's response has no relations at all (no company/
  // pipeline/stage/owner/contactLinks/stageHistory), so anything relation-
  // dependent (e.g. the Kanban board grouping by stage) needs that refresh
  // to catch up.
  const save = async (data: Parameters<typeof api.updateOpportunity>[2]) => {
    const updated = await api.updateOpportunity(token, opportunity.id, data);
    onSaved(updated);
    onChanged();
    return updated;
  };

  // Proactive check instead of attempt-then-catch: the backend rejects this
  // exact case (routes/opportunities.ts's validateOpportunityRefs), but
  // deciding client-side first means an inline form instead of a failed
  // request + a re-try. company is looked up from the *current* company (not
  // whatever the target pipeline might imply) — moving pipelines never
  // changes companyId, see 3.6.
  const handlePipelineChange = async (pipelineId: string) => {
    const targetPipeline = pipelines.find((p) => p.id === pipelineId);
    const currentCompany = companies.find((c) => c.id === opportunity.companyId);
    if (targetPipeline?.type === 'account' && currentCompany?.isPlaceholder) {
      setPendingPipelineId(pipelineId);
      setCompanyDraft({
        industry: currentCompany.industry || '',
        website: currentCompany.website || '',
        phone: currentCompany.phone || '',
      });
      return;
    }
    try {
      await save({ pipelineId });
    } catch (error) {
      toast.error('Failed to change pipeline: ' + (error as Error).message);
    }
  };

  const handleCompleteCompanyAndMove = async () => {
    if (!pendingPipelineId) return;
    setCompletingCompany(true);
    try {
      await api.updateCompany(token, opportunity.companyId, {
        industry: companyDraft.industry || null,
        website: companyDraft.website || null,
        phone: companyDraft.phone || null,
        isPlaceholder: false,
      });
      await save({ pipelineId: pendingPipelineId });
      toast.success('Company confirmed, opportunity moved.');
      setPendingPipelineId(null);
    } catch (error) {
      toast.error('Failed to confirm company: ' + (error as Error).message);
    } finally {
      setCompletingCompany(false);
    }
  };

  const handleCancelPipelineChange = () => {
    setPendingPipelineId(null);
  };

  const handleStageChange = async (stageId: string) => {
    try {
      await save({ stageId });
    } catch (error) {
      // Backend rejects a move into a `lost` stage with no lossReasonId yet —
      // the field appears right below (now that the stage is 'lost') for the
      // user to fill in as the very next step, no separate Save action needed.
      toast.error((error as Error).message || 'Failed to update stage.');
    }
  };

  const handleAcceptWonOffer = () => {
    if (!wonOfferPipelineId) return;
    const targetId = wonOfferPipelineId;
    setWonOfferPipelineId(null);
    handlePipelineChange(targetId).catch(() => {});
  };

  const handleAddContact = async () => {
    if (!newContactId) return;
    try {
      await api.addOpportunityContact(token, opportunity.id, { contactId: newContactId, role: newContactRole || undefined });
      setNewContactId('');
      setNewContactRole('');
      onChanged();
    } catch (error) {
      toast.error('Failed to link contact: ' + (error as Error).message);
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      await api.removeOpportunityContact(token, opportunity.id, contactId);
      onChanged();
    } catch (error) {
      toast.error('Failed to unlink contact: ' + (error as Error).message);
    }
  };

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div
        className="overview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="opportunity-detail-name"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overview-panel-head">
          <OverviewActionsMenu
            className="overview-actions-trigger"
            items={[{ label: 'Delete', onClick: onRequestDelete, danger: true }]}
          />
          <button type="button" className="slideover-close" onClick={onClose} aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
          <div className="overview-panel-heading">
            <h3 id="opportunity-detail-name">{opportunity.name}</h3>
            <p>{opportunity.company?.name}</p>
          </div>
        </div>

        {sortedStages.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto px-4 py-3">
            {sortedStages.map((stage) => {
              const isCurrent = stage.id === opportunity.stageId;
              return (
                <div
                  key={stage.id}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    isCurrent ? 'text-white' : 'bg-surface-2 text-ink-muted dark:bg-gray-800 dark:text-gray-400'
                  }`}
                  style={isCurrent ? { backgroundColor: stage.color || '#3c6da1' } : undefined}
                >
                  {stage.name}
                </div>
              );
            })}
            {timeInStage !== null && (
              <span className="ml-auto shrink-0 text-xs text-ink-faint">
                {timeInStage === 0 ? 'Entered today' : `${timeInStage}d in stage`}
              </span>
            )}
          </div>
        )}

        <div className="overview-panel-main">
        <div className="overview-panel-left">
          <div className="field-group">
            <h4 className="field-group-title">Deal</h4>
            <div className="field-group-body">
              <Field label="Deal Name">
                <AutoSaveField label="Deal Name" value={opportunity.name} onSave={(v) => save({ name: v })} />
              </Field>
              <Field label="Company">
                <AutoSaveSelect
                  label="Company"
                  value={opportunity.companyId}
                  onSave={(v) => save({ companyId: v })}
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  emptyLabel="-- select --"
                />
              </Field>
              <Field label="Pipeline">
                <div className="dropdown-trigger-wrap">
                  <select
                    className="dropdown-trigger dt-status"
                    value={opportunity.pipelineId}
                    onChange={(e) => handlePipelineChange(e.target.value)}
                  >
                    {pipelines
                      .filter((p) => p.isActive)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </Field>
              {pendingPipelineId && (
                <Field label="Confirm company details to move pipeline" full>
                  <div className="mt-1 flex flex-col gap-2 rounded-md border border-line p-2 dark:border-gray-800">
                    <p className="text-xs text-ink-muted">
                      {opportunity.company?.name} is still a placeholder — add its real details to move this deal into{' '}
                      {pipelines.find((p) => p.id === pendingPipelineId)?.name}.
                    </p>
                    <label className="text-xs text-ink-muted" htmlFor="pending-company-industry">
                      Industry
                    </label>
                    <input
                      id="pending-company-industry"
                      value={companyDraft.industry}
                      onChange={(e) => setCompanyDraft((d) => ({ ...d, industry: e.target.value }))}
                    />
                    <label className="text-xs text-ink-muted" htmlFor="pending-company-website">
                      Website
                    </label>
                    <input
                      id="pending-company-website"
                      value={companyDraft.website}
                      onChange={(e) => setCompanyDraft((d) => ({ ...d, website: e.target.value }))}
                    />
                    <label className="text-xs text-ink-muted" htmlFor="pending-company-phone">
                      Phone
                    </label>
                    <input
                      id="pending-company-phone"
                      value={companyDraft.phone}
                      onChange={(e) => setCompanyDraft((d) => ({ ...d, phone: e.target.value }))}
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary btn-sm" onClick={handleCancelPipelineChange} disabled={completingCompany}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={handleCompleteCompanyAndMove}
                        disabled={completingCompany}
                      >
                        {completingCompany ? 'Saving...' : 'Confirm & Move'}
                      </button>
                    </div>
                  </div>
                </Field>
              )}
              <Field label="Amount">
                <AutoSaveField
                  label="Amount"
                  type="number"
                  value={(opportunity.amountCents / 100).toString()}
                  onSave={(v) => save({ amountCents: Math.round(Number.parseFloat(v || '0') * 100) })}
                />
              </Field>
              <Field label="Currency">
                <AutoSaveField
                  label="Currency"
                  value={opportunity.currency}
                  onSave={(v) => save({ currency: v.toUpperCase() })}
                />
              </Field>
              <Field label="Owner">
                <AutoSaveSelect
                  label="Owner"
                  value={opportunity.ownerId ?? ''}
                  onSave={(v) => save({ ownerId: v || null })}
                  options={tenantUsers.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
                  emptyLabel="-- unassigned --"
                />
              </Field>
            </div>
          </div>

          <div className="field-group">
            <h4 className="field-group-title">Stage</h4>
            <div className="field-group-body">
              <Field label="Stage">
                <div className="dropdown-trigger-wrap">
                  <select
                    className="dropdown-trigger dt-status"
                    value={opportunity.stageId}
                    onChange={(e) => handleStageChange(e.target.value).catch(() => {})}
                  >
                    {sortedStages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </Field>
              {currentStage?.outcome === 'lost' && (
                <div className="overview-field">
                  <div className="flex items-center justify-between">
                    <span className="overview-field-label">Loss Reason</span>
                    <FieldCatalogMenu token={token} kind="lossReason" label="Loss Reason" entries={lossReasons} onChanged={onReasonsChanged} />
                  </div>
                  <AutoSaveSelect
                    label="Loss Reason"
                    value={opportunity.lossReasonId || ''}
                    onSave={(v) => save({ lossReasonId: v || null })}
                    options={lossReasons.filter((lr) => lr.isActive).map((lr) => ({ value: lr.id, label: lr.name }))}
                  />
                </div>
              )}
              {currentStage?.outcome === 'won' && (
                <div className="overview-field">
                  <div className="flex items-center justify-between">
                    <span className="overview-field-label">Win Reason</span>
                    <FieldCatalogMenu token={token} kind="winReason" label="Win Reason" entries={winReasons} onChanged={onReasonsChanged} />
                  </div>
                  <AutoSaveSelect
                    label="Win Reason"
                    value={opportunity.winReasonId || ''}
                    onSave={(v) => save({ winReasonId: v || null })}
                    options={winReasons.filter((wr) => wr.isActive).map((wr) => ({ value: wr.id, label: wr.name }))}
                  />
                </div>
              )}
              {(currentStage?.outcome === 'won' || currentStage?.outcome === 'lost') && (
                <Field label="Close Note" full>
                  <AutoSaveField
                    label="Close Note"
                    value={opportunity.closeNote || ''}
                    onSave={(v) => save({ closeNote: v || null })}
                    placeholder="Optional details about how this deal closed"
                  />
                </Field>
              )}
              {wonOfferPipelineId && (
                <Field label="Move to account pipeline?" full>
                  <div className="mt-1 flex flex-col gap-2 rounded-md border border-line p-2 dark:border-gray-800">
                    <p className="text-xs text-ink-muted">
                      Won! Move this deal into an account pipeline to keep tracking it there.
                    </p>
                    <select
                      value={wonOfferPipelineId}
                      onChange={(e) => setWonOfferPipelineId(e.target.value)}
                    >
                      {pipelines
                        .filter((p) => p.type === 'account' && p.isActive)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setWonOfferPipelineId(null)}>
                        Not now
                      </button>
                      <button type="button" className="btn-primary btn-sm" onClick={handleAcceptWonOffer}>
                        Move
                      </button>
                    </div>
                  </div>
                </Field>
              )}
            </div>
          </div>

          <div className="field-group">
            <h4 className="field-group-title">Next step</h4>
            <div className="field-group-body">
              <Field label="Estimated Close Date">
                <AutoSaveField
                  label="Estimated Close Date"
                  type="date"
                  value={opportunity.estimatedCloseDate ? opportunity.estimatedCloseDate.slice(0, 10) : ''}
                  onSave={(v) => save({ estimatedCloseDate: v || null })}
                />
              </Field>
              <Field label="Next Step Date">
                <AutoSaveField
                  label="Next Step Date"
                  type="date"
                  value={opportunity.nextStepDate ? opportunity.nextStepDate.slice(0, 10) : ''}
                  onSave={(v) => save({ nextStepDate: v || null })}
                />
              </Field>
              <Field label="Next Step" full>
                <AutoSaveField
                  label="Next Step"
                  value={opportunity.nextStepNote || ''}
                  onSave={(v) => save({ nextStepNote: v || null })}
                  placeholder="What's the next action?"
                />
              </Field>
            </div>
          </div>

          <div className="overview-field overview-field-full">
            <div className="min-w-0 flex-1">
              <span className="overview-field-label">Contacts ({opportunity.contactLinks?.length ?? 0})</span>
              {(opportunity.contactLinks ?? []).map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span>
                    {link.contact.firstName} {link.contact.lastName}
                    {link.role ? ` (${link.role})` : ''}
                  </span>
                  <button type="button" className="icon-btn danger" onClick={() => handleRemoveContact(link.contactId)}>
                    <span className="tip">Unlink</span>
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="mt-2 flex items-center gap-1.5">
                <select className="select-compact flex-1" value={newContactId} onChange={(e) => setNewContactId(e.target.value)}>
                  <option value="">-- add contact --</option>
                  {linkableContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
                <input
                  className="w-24"
                  type="text"
                  placeholder="Role"
                  value={newContactRole}
                  onChange={(e) => setNewContactRole(e.target.value)}
                />
                <button type="button" className="icon-btn" onClick={handleAddContact} disabled={!newContactId}>
                  <span className="tip">Add</span>
                  <PlusIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

        </div>

        <DetailSidebar
          token={token}
          entityType="opportunity"
          entityId={opportunity.id}
          tenantUsers={tenantUsers}
          currentUserId={currentUserId}
        />
        </div>
      </div>
    </div>
  );
}
