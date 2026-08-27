import { useEffect, useState } from 'react';
import { api, type Company, type Contact, type Opportunity, type Pipeline } from '../../api';
import { useToast } from '../common/ToastProvider';
import Avatar from '../common/Avatar';
import AutoSaveField from '../common/AutoSaveField';
import AutoSaveSelect from '../common/AutoSaveSelect';
import DetailSidebar from '../layout/DetailSidebar';
import Field from '../common/Field';
import RequiredMark from '../common/RequiredMark';
import OverviewActionsMenu from '../common/OverviewActionsMenu';
import { PlusIcon, XIcon } from '../common/Icons';
import { formatMoney } from '../../lib/currencies';
import TagInput from '../common/TagInput';
import type { TagAssignmentLite } from '../../api';

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  disqualified: 'Disqualified',
};

interface ContactDetailModalProps {
  contact: Contact;
  token: string;
  companies: Company[];
  contacts: Contact[];
  opportunities: Opportunity[];
  pipelines: Pipeline[];
  leadSources: any[];
  customFields: any[];
  tenantCurrency: string;
  currentUserId: string;
  tenantUsers: { id: string; firstName: string; lastName: string }[];
  onClose: () => void;
  onChanged: () => void;
  onSaved: (updatedContact: Contact) => void;
  onRequestDelete: () => void;
  // Opens the Opportunity detail view for a linked deal — optional since not
  // every context this modal renders in (yet) wires up its own
  // OpportunityDetailModal (2026-08-27, backlog QA).
  onOpenOpportunity?: (opportunityId: string) => void;
}

export default function ContactDetailModal({
  contact,
  token,
  companies,
  contacts,
  opportunities,
  pipelines,
  leadSources,
  customFields,
  tenantCurrency,
  currentUserId,
  tenantUsers,
  onClose,
  onChanged,
  onSaved,
  onRequestDelete,
  onOpenOpportunity,
}: ContactDetailModalProps) {
  const toast = useToast();
  const [addingOpportunity, setAddingOpportunity] = useState(false);
  const [linkOppId, setLinkOppId] = useState('');
  const [newOppPipelineId, setNewOppPipelineId] = useState('');
  const [newOppName, setNewOppName] = useState('');
  const [newOppCompanyName, setNewOppCompanyName] = useState('');
  const [tags, setTags] = useState<TagAssignmentLite[]>([]);

  const loadTags = () => {
    api.listTagsForEntity(token, 'contact', contact.id).then(setTags).catch(() => {});
  };

  useEffect(() => {
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const linkedOpportunities = opportunities.filter((o) => o.contactLinks?.some((l) => l.contactId === contact.id));
  const isFullView = linkedOpportunities.some((o) => o.pipeline?.type === 'account');
  const company = companies.find((c) => c.id === contact.companyId);
  const coContacts = company ? contacts.filter((c) => c.companyId === company.id && c.id !== contact.id) : [];
  // Opportunities of the same company that this contact isn't linked to yet — candidates to "link existing".
  const linkableOpportunities = company
    ? opportunities.filter((o) => o.companyId === company.id && !o.contactLinks?.some((l) => l.contactId === contact.id))
    : [];
  const activePipelines = pipelines.filter((p) => p.isActive);

  // Two-part update: onSaved patches the row instantly (no round-trip wait —
  // found by the user 2026-07-30), then onChanged still runs a silent
  // background re-fetch — updateContact's response doesn't include
  // company/leadSource, so an FK field would show the right id but a stale
  // label until that refresh lands.
  const save = async (data: Parameters<typeof api.updateContact>[2]) => {
    const updated = await api.updateContact(token, contact.id, data);
    onSaved(updated);
    onChanged();
    return updated;
  };

  const saveCustomField = async (fieldId: string, value: string) => {
    const existing = contact.customFieldVals?.find((v) => v.customFieldDefinitionId === fieldId);
    if (!value.trim() && existing) {
      await api.deleteContactCustomFieldValue(token, contact.id, existing.id);
    } else if (value.trim() && existing) {
      await api.updateContactCustomFieldValue(token, contact.id, existing.id, value.trim());
    } else if (value.trim() && !existing) {
      await api.createContactCustomFieldValue(token, contact.id, { customFieldDefinitionId: fieldId, value: value.trim() });
    }
    onChanged();
  };

  const openAddOpportunity = () => {
    setLinkOppId('');
    setNewOppPipelineId(activePipelines[0]?.id ?? '');
    setNewOppName(company ? `${company.name} — ${contact.firstName} ${contact.lastName}` : '');
    setNewOppCompanyName('');
    setAddingOpportunity(true);
  };

  const handleLinkOpportunity = async () => {
    if (!linkOppId) return;
    try {
      await api.addOpportunityContact(token, linkOppId, { contactId: contact.id });
      toast.success('Linked to opportunity.');
      setAddingOpportunity(false);
      onChanged();
    } catch (error) {
      toast.error('Failed to link opportunity: ' + (error as Error).message);
    }
  };

  const handleCreateOpportunity = async () => {
    const pipeline = activePipelines.find((p) => p.id === newOppPipelineId);
    if (!pipeline || !newOppName.trim()) return;

    // Gate (confirmed with the user): an 'account' pipeline manages an
    // already-identified company — it never gets an ad-hoc one. A 'lead'
    // pipeline is fine without a company yet, but Opportunity.companyId is a
    // required FK either way — that case asks for a company name inline
    // instead of silently inventing one from the contact's own name.
    if (!company) {
      if (pipeline.type === 'account') {
        toast.error('This pipeline is account-only — assign this contact to a Company first.');
        return;
      }
      if (!newOppCompanyName.trim()) {
        toast.error('Enter a company name to create this lead opportunity.');
        return;
      }
    }

    try {
      let companyId = contact.companyId;
      if (!companyId) {
        const created = await api.createCompany(token, {
          name: newOppCompanyName.trim(),
          contact: { contactId: contact.id },
          isPlaceholder: true,
        });
        companyId = created.id;
      }

      // A Pipeline with assignment automation resolves its own owner
      // server-side (docs/tareas/specredisenosalesv2.md §3.8); otherwise
      // default to whoever's creating it, same as before.
      const opportunity = await api.createOpportunity(token, {
        name: newOppName.trim(),
        companyId: companyId!,
        pipelineId: pipeline.id,
        amountCents: 0,
        currency: tenantCurrency,
        ownerId: pipeline.assignmentMode ? undefined : currentUserId,
      });
      await api.addOpportunityContact(token, opportunity.id, { contactId: contact.id });
      toast.success('Opportunity created.');
      setAddingOpportunity(false);
      onChanged();
    } catch (error) {
      toast.error('Failed to create opportunity: ' + (error as Error).message);
    }
  };

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div
        className="overview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-detail-name"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overview-panel-head">
          <OverviewActionsMenu
            className="overview-actions-trigger"
            items={[{ label: 'Deactivate', onClick: onRequestDelete, danger: true }]}
          />
          <button type="button" className="slideover-close" onClick={onClose} aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
          <Avatar firstName={contact.firstName} lastName={contact.lastName} />
          <div className="overview-panel-heading">
            <h3 id="contact-detail-name">
              {contact.firstName} {contact.lastName}
            </h3>
            <p>{contact.email}</p>
            <TagInput token={token} entityType="contact" entityId={contact.id} tags={tags} onChanged={loadTags} />
          </div>
        </div>

        <div className="overview-panel-main">
        <div className="overview-panel-left">
          <div className="field-group">
            <h4 className="field-group-title">Identity</h4>
            <div className="field-group-body">
              <Field label="Phone">
                <AutoSaveField label="Phone" value={contact.phone || ''} onSave={(v) => save({ phone: v || null })} />
              </Field>
              <Field label="Company">
                <AutoSaveSelect
                  label="Company"
                  value={contact.companyId || ''}
                  onSave={(v) => save({ companyId: v || null })}
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  emptyLabel="-- none (lead without a confirmed company) --"
                />
              </Field>
            </div>
          </div>

          <div className="field-group">
            <h4 className="field-group-title">Role</h4>
            <div className="field-group-body">
              <Field label="Title">
                <AutoSaveField label="Title" value={contact.title || ''} onSave={(v) => save({ title: v || null })} />
              </Field>
              <Field label="Lead Status">
                <AutoSaveSelect
                  label="Lead Status"
                  value={contact.leadStatus || ''}
                  onSave={(v) => save({ leadStatus: (v || null) as Contact['leadStatus'] })}
                  options={Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </Field>
            </div>
          </div>

          <div className="field-group">
            <h4 className="field-group-title">Source</h4>
            <div className="field-group-body">
              <Field label="Lead Source">
                <AutoSaveSelect
                  label="Lead Source"
                  value={contact.leadSourceId || ''}
                  onSave={(v) => save({ leadSourceId: v || null })}
                  options={leadSources.map((ls) => ({ value: ls.id, label: ls.name }))}
                />
              </Field>
            </div>
          </div>

          {customFields.length > 0 && (
            <div className="field-group">
              <h4 className="field-group-title">Custom fields</h4>
              <div className="field-group-body">
                {customFields.map((field) => {
                  const existing = contact.customFieldVals?.find((v) => v.customFieldDefinitionId === field.id);
                  return (
                    <Field key={field.id} label={field.name}>
                      {field.fieldType === 'select' ? (
                        <AutoSaveSelect
                          label={field.name}
                          value={existing?.value || ''}
                          onSave={(v) => saveCustomField(field.id, v)}
                          options={(JSON.parse(field.options || '[]') as string[]).map((opt) => ({ value: opt, label: opt }))}
                        />
                      ) : (
                        <AutoSaveField
                          label={field.name}
                          type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : field.fieldType === 'email' ? 'email' : 'text'}
                          value={existing?.value || ''}
                          onSave={(v) => saveCustomField(field.id, v)}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            </div>
          )}

          {isFullView && coContacts.length > 0 && (
            <div className="overview-field overview-field-full">
              <div className="min-w-0 flex-1">
                <span className="overview-field-label">Other contacts at {company?.name}</span>
                {coContacts.map((c) => (
                  <div key={c.id} className="py-1 text-sm">
                    {c.firstName} {c.lastName} {c.isPrimary ? '★' : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="field-group">
            <h4 className="field-group-title flex items-center justify-between">
              <span>Opportunities ({linkedOpportunities.length})</span>
              <button type="button" className="icon-btn normal-case tracking-normal" onClick={openAddOpportunity}>
                <span className="tip">Add opportunity</span>
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </h4>
            <div className="px-4 pb-3">
              {linkedOpportunities.length === 0 && !addingOpportunity && (
                <p className="text-xs text-ink-faint">No opportunities linked yet.</p>
              )}
              {linkedOpportunities.map((opp) => (
                <button
                  type="button"
                  key={opp.id}
                  className="flex w-full items-center justify-between gap-2 py-1 text-left text-sm hover:underline"
                  onClick={() => onOpenOpportunity?.(opp.id)}
                >
                  <span>{opp.name}</span>
                  <span className="text-xs text-ink-faint">
                    {opp.stage?.name} · {formatMoney(opp.amountCents, opp.currency)}
                    {opp.pipeline?.isActive === false && ' · Archived'}
                  </span>
                </button>
              ))}
              {addingOpportunity && (
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-line p-2 dark:border-gray-800">
                  {linkableOpportunities.length > 0 && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <select className="select-compact flex-1" value={linkOppId} onChange={(e) => setLinkOppId(e.target.value)}>
                          <option value="">Link existing opportunity…</option>
                          {linkableOpportunities.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} ({o.stage?.name})
                            </option>
                          ))}
                        </select>
                        <button type="button" className="btn-secondary" onClick={handleLinkOpportunity} disabled={!linkOppId}>
                          Link
                        </button>
                      </div>
                      <p className="text-xs text-ink-faint">or create a new one:</p>
                    </>
                  )}
                  <label className="text-xs text-ink-muted" htmlFor="new-contact-opp-pipeline">
                    Pipeline
                    <RequiredMark />
                  </label>
                  <select
                    id="new-contact-opp-pipeline"
                    value={newOppPipelineId}
                    onChange={(e) => setNewOppPipelineId(e.target.value)}
                    required
                  >
                    {activePipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.type === 'account' ? '(needs a Company)' : ''}
                      </option>
                    ))}
                  </select>
                  {!company && activePipelines.find((p) => p.id === newOppPipelineId)?.type === 'lead' && (
                    <>
                      <label className="text-xs text-ink-muted" htmlFor="new-contact-opp-company">
                        Company name (this contact has none yet)
                        <RequiredMark />
                      </label>
                      <input
                        id="new-contact-opp-company"
                        value={newOppCompanyName}
                        onChange={(e) => setNewOppCompanyName(e.target.value)}
                        placeholder="e.g. Acme Inc."
                        required
                      />
                    </>
                  )}
                  <label className="text-xs text-ink-muted" htmlFor="new-contact-opp-name">
                    Deal name
                    <RequiredMark />
                  </label>
                  <input
                    id="new-contact-opp-name"
                    value={newOppName}
                    onChange={(e) => setNewOppName(e.target.value)}
                    required
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn-secondary" onClick={() => setAddingOpportunity(false)}>
                      Cancel
                    </button>
                    <button type="button" className="btn-primary" onClick={handleCreateOpportunity}>
                      Create opportunity
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        <DetailSidebar
          token={token}
          entityType="contact"
          entityId={contact.id}
          tenantUsers={tenantUsers}
          currentUserId={currentUserId}
        />
        </div>
      </div>
    </div>
  );
}
