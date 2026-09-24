import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Company, type Contact, type Opportunity, type Pipeline } from '../../api';
import { useToast } from '../common/ToastProvider';
import AutoSaveField from '../common/AutoSaveField';
import AutoSaveSelect from '../common/AutoSaveSelect';
import DetailSidebar from '../layout/DetailSidebar';
import Field from '../common/Field';
import OverviewActionsMenu from '../common/OverviewActionsMenu';
import FieldCatalogMenu from '../entity-views/FieldCatalogMenu';
import { PlusIcon, XIcon } from '../common/Icons';
import { useIsMobile } from '../../hooks/useIsMobile';

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
  const { t } = useTranslation('crm');
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

  // Mobile (2026-09-08): see EmployeeOverviewPanel.tsx's longer comment on the same pattern —
  // unifies DetailSidebar's Notes/Tasks/Activity with "Overview" into one tab strip on mobile
  // only; desktop keeps the existing 2-column layout untouched.
  const [mobileSection, setMobileSection] = useState<'overview' | 'notes' | 'tasks' | 'activity'>('overview');
  const [sidebarCounts, setSidebarCounts] = useState({ notes: 0, tasks: 0, activity: 0 });
  const isMobile = useIsMobile();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setMobileSection('overview');
  }, [opportunity.id]);

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
      toast.error(t('opportunityDetail.toasts.pipelineChangeFailed', { error: (error as Error).message }));
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
      toast.success(t('opportunityDetail.toasts.companyConfirmed'));
      setPendingPipelineId(null);
    } catch (error) {
      toast.error(t('opportunityDetail.toasts.companyConfirmFailed', { error: (error as Error).message }));
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
      toast.error((error as Error).message || t('opportunityDetail.toasts.stageUpdateFailed'));
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
      toast.error(t('opportunityDetail.toasts.contactLinkFailed', { error: (error as Error).message }));
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      await api.removeOpportunityContact(token, opportunity.id, contactId);
      onChanged();
    } catch (error) {
      toast.error(t('opportunityDetail.toasts.contactUnlinkFailed', { error: (error as Error).message }));
    }
  };

  const overviewContent = (
    <div className="overview-panel-left">
      <div className="field-group">
        <h4 className="field-group-title">{t('opportunityDetail.groups.deal')}</h4>
        <div className="field-group-body">
          <Field label={t('opportunityDetail.fields.dealName')}>
            <AutoSaveField
              label={t('opportunityDetail.fields.dealName')}
              value={opportunity.name}
              onSave={(v) => save({ name: v })}
            />
          </Field>
          <Field label={t('opportunityDetail.fields.company')}>
            <AutoSaveSelect
              label={t('opportunityDetail.fields.company')}
              value={opportunity.companyId}
              onSave={(v) => save({ companyId: v })}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              emptyLabel={t('common.selectPlaceholder')}
            />
          </Field>
          <Field label={t('opportunityDetail.fields.pipeline')}>
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
            <Field label={t('opportunityDetail.pendingPipelineChange.fieldLabel')} full>
              <div className="mt-1 flex flex-col gap-2 rounded-md border border-line p-2 dark:border-dark-line">
                <p className="text-xs text-ink-muted">
                  {t('opportunityDetail.pendingPipelineChange.note', {
                    companyName: opportunity.company?.name,
                    pipelineName: pipelines.find((p) => p.id === pendingPipelineId)?.name,
                  })}
                </p>
                <label className="text-xs text-ink-muted" htmlFor="pending-company-industry">
                  {t('opportunityDetail.pendingPipelineChange.industry')}
                </label>
                <input
                  id="pending-company-industry"
                  value={companyDraft.industry}
                  onChange={(e) => setCompanyDraft((d) => ({ ...d, industry: e.target.value }))}
                />
                <label className="text-xs text-ink-muted" htmlFor="pending-company-website">
                  {t('opportunityDetail.pendingPipelineChange.website')}
                </label>
                <input
                  id="pending-company-website"
                  value={companyDraft.website}
                  onChange={(e) => setCompanyDraft((d) => ({ ...d, website: e.target.value }))}
                />
                <label className="text-xs text-ink-muted" htmlFor="pending-company-phone">
                  {t('opportunityDetail.pendingPipelineChange.phone')}
                </label>
                <input
                  id="pending-company-phone"
                  value={companyDraft.phone}
                  onChange={(e) => setCompanyDraft((d) => ({ ...d, phone: e.target.value }))}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={handleCancelPipelineChange} disabled={completingCompany}>
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={handleCompleteCompanyAndMove}
                    disabled={completingCompany}
                  >
                    {completingCompany
                      ? t('opportunityDetail.pendingPipelineChange.saving')
                      : t('opportunityDetail.pendingPipelineChange.confirmAndMove')}
                  </button>
                </div>
              </div>
            </Field>
          )}
          <Field label={t('opportunityDetail.fields.amount')}>
            <AutoSaveField
              label={t('opportunityDetail.fields.amount')}
              type="number"
              value={(opportunity.amountCents / 100).toString()}
              onSave={(v) => save({ amountCents: Math.round(Number.parseFloat(v || '0') * 100) })}
            />
          </Field>
          <Field label={t('opportunityDetail.fields.currency')}>
            <AutoSaveField
              label={t('opportunityDetail.fields.currency')}
              value={opportunity.currency}
              onSave={(v) => save({ currency: v.toUpperCase() })}
            />
          </Field>
          <Field label={t('opportunityDetail.fields.owner')}>
            <AutoSaveSelect
              label={t('opportunityDetail.fields.owner')}
              value={opportunity.ownerId ?? ''}
              onSave={(v) => save({ ownerId: v || null })}
              options={tenantUsers.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
              emptyLabel={t('opportunityDetail.fields.ownerUnassigned')}
            />
          </Field>
        </div>
      </div>

      <div className="field-group">
        <h4 className="field-group-title">{t('opportunityDetail.groups.stage')}</h4>
        <div className="field-group-body">
          <Field label={t('opportunityDetail.fields.stage')}>
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
                <span className="overview-field-label">{t('opportunityDetail.fields.lossReason')}</span>
                <FieldCatalogMenu
                  token={token}
                  kind="lossReason"
                  label={t('opportunityDetail.fields.lossReason')}
                  entries={lossReasons}
                  onChanged={onReasonsChanged}
                />
              </div>
              <AutoSaveSelect
                label={t('opportunityDetail.fields.lossReason')}
                value={opportunity.lossReasonId || ''}
                onSave={(v) => save({ lossReasonId: v || null })}
                options={lossReasons.filter((lr) => lr.isActive).map((lr) => ({ value: lr.id, label: lr.name }))}
              />
            </div>
          )}
          {currentStage?.outcome === 'won' && (
            <div className="overview-field">
              <div className="flex items-center justify-between">
                <span className="overview-field-label">{t('opportunityDetail.fields.winReason')}</span>
                <FieldCatalogMenu
                  token={token}
                  kind="winReason"
                  label={t('opportunityDetail.fields.winReason')}
                  entries={winReasons}
                  onChanged={onReasonsChanged}
                />
              </div>
              <AutoSaveSelect
                label={t('opportunityDetail.fields.winReason')}
                value={opportunity.winReasonId || ''}
                onSave={(v) => save({ winReasonId: v || null })}
                options={winReasons.filter((wr) => wr.isActive).map((wr) => ({ value: wr.id, label: wr.name }))}
              />
            </div>
          )}
          {(currentStage?.outcome === 'won' || currentStage?.outcome === 'lost') && (
            <Field label={t('opportunityDetail.fields.closeNote')} full>
              <AutoSaveField
                label={t('opportunityDetail.fields.closeNote')}
                value={opportunity.closeNote || ''}
                onSave={(v) => save({ closeNote: v || null })}
                placeholder={t('opportunityDetail.fields.closeNotePlaceholder')}
              />
            </Field>
          )}
          {wonOfferPipelineId && (
            <Field label={t('opportunityDetail.wonOffer.fieldLabel')} full>
              <div className="mt-1 flex flex-col gap-2 rounded-md border border-line p-2 dark:border-dark-line">
                <p className="text-xs text-ink-muted">{t('opportunityDetail.wonOffer.note')}</p>
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
                    {t('opportunityDetail.wonOffer.notNow')}
                  </button>
                  <button type="button" className="btn-primary btn-sm" onClick={handleAcceptWonOffer}>
                    {t('opportunityDetail.wonOffer.move')}
                  </button>
                </div>
              </div>
            </Field>
          )}
        </div>
      </div>

      <div className="field-group">
        <h4 className="field-group-title">{t('opportunityDetail.groups.nextStep')}</h4>
        <div className="field-group-body">
          <Field label={t('opportunityDetail.fields.estimatedCloseDate')}>
            <AutoSaveField
              label={t('opportunityDetail.fields.estimatedCloseDate')}
              type="date"
              value={opportunity.estimatedCloseDate ? opportunity.estimatedCloseDate.slice(0, 10) : ''}
              onSave={(v) => save({ estimatedCloseDate: v || null })}
            />
          </Field>
          <Field label={t('opportunityDetail.fields.nextStepDate')}>
            <AutoSaveField
              label={t('opportunityDetail.fields.nextStepDate')}
              type="date"
              value={opportunity.nextStepDate ? opportunity.nextStepDate.slice(0, 10) : ''}
              onSave={(v) => save({ nextStepDate: v || null })}
            />
          </Field>
          <Field label={t('opportunityDetail.fields.nextStep')} full>
            <AutoSaveField
              label={t('opportunityDetail.fields.nextStep')}
              value={opportunity.nextStepNote || ''}
              onSave={(v) => save({ nextStepNote: v || null })}
              placeholder={t('opportunityDetail.fields.nextStepPlaceholder')}
            />
          </Field>
        </div>
      </div>

      <div className="overview-field overview-field-full">
        <div className="min-w-0 flex-1">
          <span className="overview-field-label">
            {t('opportunityDetail.contactsSection.heading', { count: opportunity.contactLinks?.length ?? 0 })}
          </span>
          {(opportunity.contactLinks ?? []).map((link) => (
            <div key={link.id} className="flex items-center justify-between gap-2 py-1 text-sm">
              <span>
                {link.contact.firstName} {link.contact.lastName}
                {link.role ? ` (${link.role})` : ''}
              </span>
              <button type="button" className="icon-btn danger" onClick={() => handleRemoveContact(link.contactId)}>
                <span className="tip">{t('opportunityDetail.contactsSection.unlinkTooltip')}</span>
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="mt-2 flex items-center gap-1.5">
            <select className="select-compact flex-1" value={newContactId} onChange={(e) => setNewContactId(e.target.value)}>
              <option value="">{t('opportunityDetail.contactsSection.addContactPlaceholder')}</option>
              {linkableContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
            <input
              className="w-24"
              type="text"
              placeholder={t('opportunityDetail.contactsSection.rolePlaceholder')}
              value={newContactRole}
              onChange={(e) => setNewContactRole(e.target.value)}
            />
            <button type="button" className="icon-btn" onClick={handleAddContact} disabled={!newContactId}>
              <span className="tip">{t('opportunityDetail.contactsSection.addTooltip')}</span>
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

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
            items={[{ label: t('opportunityDetail.deleteMenuItem'), onClick: onRequestDelete, danger: true }]}
          />
          <button type="button" className="slideover-close" onClick={onClose} aria-label={t('detail.closeAria')}>
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
                    isCurrent ? 'text-white' : 'bg-surface-2 text-ink-muted dark:bg-dark-raised dark:text-dark-ink-faint'
                  }`}
                  style={isCurrent ? { backgroundColor: stage.color || '#3c6da1' } : undefined}
                >
                  {stage.name}
                </div>
              );
            })}
            {timeInStage !== null && (
              <span className="ml-auto shrink-0 text-xs text-ink-faint">
                {timeInStage === 0
                  ? t('opportunityDetail.stageStrip.enteredToday')
                  : t('opportunityDetail.stageStrip.daysInStage', { count: timeInStage })}
              </span>
            )}
          </div>
        )}

        {isMobile ? (
          <div className="overview-panel-mobile-body">
            <div className="overview-panel-tabs">
              <button
                type="button"
                className={mobileSection === 'overview' ? 'active' : ''}
                onClick={() => setMobileSection('overview')}
              >
                {t('detail.mobileTabs.overview')}
              </button>
              <button
                type="button"
                className={mobileSection === 'notes' ? 'active' : ''}
                onClick={() => setMobileSection('notes')}
              >
                {sidebarCounts.notes > 0
                  ? t('detail.mobileTabs.notesWithCount', { count: sidebarCounts.notes })
                  : t('detail.mobileTabs.notes')}
              </button>
              <button
                type="button"
                className={mobileSection === 'tasks' ? 'active' : ''}
                onClick={() => setMobileSection('tasks')}
              >
                {sidebarCounts.tasks > 0
                  ? t('detail.mobileTabs.tasksWithCount', { count: sidebarCounts.tasks })
                  : t('detail.mobileTabs.tasks')}
              </button>
              <button
                type="button"
                className={mobileSection === 'activity' ? 'active' : ''}
                onClick={() => setMobileSection('activity')}
              >
                {sidebarCounts.activity > 0
                  ? t('detail.mobileTabs.activityWithCount', { count: sidebarCounts.activity })
                  : t('detail.mobileTabs.activity')}
              </button>
            </div>
            <div style={{ display: mobileSection === 'overview' ? 'contents' : 'none' }}>{overviewContent}</div>
            <DetailSidebar
              token={token}
              entityType="opportunity"
              entityId={opportunity.id}
              tenantUsers={tenantUsers}
              currentUserId={currentUserId}
              onCountsChange={setSidebarCounts}
              mobileActiveSection={mobileSection === 'overview' ? null : mobileSection}
            />
          </div>
        ) : (
          <div className="overview-panel-main">
            {overviewContent}
            <DetailSidebar
              token={token}
              entityType="opportunity"
              entityId={opportunity.id}
              tenantUsers={tenantUsers}
              currentUserId={currentUserId}
              onCountsChange={setSidebarCounts}
            />
          </div>
        )}
      </div>
    </div>
  );
}
