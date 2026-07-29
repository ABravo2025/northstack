import { useEffect, useState } from 'react';
import { api, type Company, type Contact, type Opportunity, type Pipeline } from '../api';
import { useToast } from './ToastProvider';
import AutoSaveField from './AutoSaveField';
import AutoSaveSelect from './AutoSaveSelect';
import { PlusIcon, XIcon } from './Icons';

interface OpportunityDetailModalProps {
  opportunity: Opportunity;
  token: string;
  companies: Company[];
  contacts: Contact[];
  pipelines: Pipeline[];
  tenantUsers: any[];
  lossReasons: any[];
  onClose: () => void;
  onChanged: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overview-field">
      <span className="overview-field-label">{label}</span>
      {children}
    </div>
  );
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
  onClose,
  onChanged,
}: OpportunityDetailModalProps) {
  const toast = useToast();
  const [newContactId, setNewContactId] = useState('');
  const [newContactRole, setNewContactRole] = useState('');

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

  const save = (data: Parameters<typeof api.updateOpportunity>[2]) => api.updateOpportunity(token, opportunity.id, data);

  const handleStageChange = async (stageId: string) => {
    try {
      await save({ stageId });
      onChanged();
    } catch (error) {
      // Backend rejects a move into a `lost` stage with no lossReasonId yet —
      // the field appears right below (now that the stage is 'lost') for the
      // user to fill in as the very next step, no separate Save action needed.
      toast.error((error as Error).message || 'Failed to update stage.');
    }
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
                    isCurrent ? 'text-white' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                  style={isCurrent ? { backgroundColor: stage.color || '#3c6da1' } : undefined}
                >
                  {stage.name}
                </div>
              );
            })}
            {timeInStage !== null && (
              <span className="ml-auto shrink-0 text-xs text-gray-400">
                {timeInStage === 0 ? 'Entered today' : `${timeInStage}d in stage`}
              </span>
            )}
          </div>
        )}

        <div className="overview-panel-body">
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
            <Field label="Loss Reason">
              <AutoSaveSelect
                label="Loss Reason"
                value={opportunity.lossReasonId || ''}
                onSave={(v) => save({ lossReasonId: v || null })}
                options={lossReasons.map((lr) => ({ value: lr.id, label: lr.name }))}
              />
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
              value={opportunity.ownerId}
              onSave={(v) => save({ ownerId: v })}
              options={tenantUsers.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
              emptyLabel="-- select --"
            />
          </Field>
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
          <Field label="Next Step">
            <AutoSaveField
              label="Next Step"
              value={opportunity.nextStepNote || ''}
              onSave={(v) => save({ nextStepNote: v || null })}
              placeholder="What's the next action?"
            />
          </Field>

          <div className="overview-field">
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
    </div>
  );
}
