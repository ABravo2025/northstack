import { useEffect, useState } from 'react';
import { api, type Company, type Contact, type Opportunity, type Pipeline } from '../api';
import { useToast } from './ToastProvider';
import Avatar from './Avatar';
import StatusChip from './StatusChip';
import AutoSaveField from './AutoSaveField';
import AutoSaveSelect from './AutoSaveSelect';
import { PlusIcon, TrashIcon, XIcon } from './Icons';
import { formatMoney } from '../lib/currencies';

interface CompanyDetailModalProps {
  company: Company;
  token: string;
  tenantUsers: any[];
  contacts: Contact[];
  opportunities: Opportunity[];
  pipelines: Pipeline[];
  customFields: any[];
  tenantCurrency: string;
  currentUserId: string;
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

export default function CompanyDetailModal({
  company,
  token,
  tenantUsers,
  contacts,
  opportunities,
  pipelines,
  customFields,
  tenantCurrency,
  currentUserId,
  onClose,
  onChanged,
}: CompanyDetailModalProps) {
  const toast = useToast();
  const [addingContact, setAddingContact] = useState(false);
  const [linkContactId, setLinkContactId] = useState('');
  const [newContact, setNewContact] = useState({ firstName: '', lastName: '', email: '' });
  const [addingOpportunity, setAddingOpportunity] = useState(false);
  const [newOppPipelineId, setNewOppPipelineId] = useState('');
  const [newOppName, setNewOppName] = useState(company.name);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const companyContacts = contacts.filter((c) => c.companyId === company.id);
  const companyOpportunities = opportunities.filter((o) => o.companyId === company.id);
  const unlinkedContacts = contacts.filter((c) => !c.companyId);
  const activePipelines = pipelines.filter((p) => p.isActive);

  const save = (data: Parameters<typeof api.updateCompany>[2]) => api.updateCompany(token, company.id, data);

  const saveCustomField = async (fieldId: string, value: string) => {
    const existing = company.customFieldVals?.find((v) => v.customFieldDefinitionId === fieldId);
    if (!value.trim() && existing) {
      await api.deleteCompanyCustomFieldValue(token, company.id, existing.id);
    } else if (value.trim() && existing) {
      await api.updateCompanyCustomFieldValue(token, company.id, existing.id, value.trim());
    } else if (value.trim() && !existing) {
      await api.createCompanyCustomFieldValue(token, company.id, { customFieldDefinitionId: fieldId, value: value.trim() });
    }
    onChanged();
  };

  const handleLinkContact = async () => {
    if (!linkContactId) return;
    try {
      await api.updateContact(token, linkContactId, { companyId: company.id });
      toast.success('Contact linked.');
      setLinkContactId('');
      setAddingContact(false);
      onChanged();
    } catch (error) {
      toast.error('Failed to link contact: ' + (error as Error).message);
    }
  };

  const handleCreateContact = async () => {
    if (!newContact.firstName.trim() || !newContact.lastName.trim() || !newContact.email.trim()) return;
    try {
      await api.createContact(token, {
        firstName: newContact.firstName.trim(),
        lastName: newContact.lastName.trim(),
        email: newContact.email.trim(),
        companyId: company.id,
      });
      toast.success('Contact created.');
      setNewContact({ firstName: '', lastName: '', email: '' });
      setAddingContact(false);
      onChanged();
    } catch (error) {
      toast.error('Failed to create contact: ' + (error as Error).message);
    }
  };

  const handleUnlinkContact = async (contact: Contact) => {
    try {
      await api.updateContact(token, contact.id, { companyId: null });
      toast.success('Contact unlinked.');
      onChanged();
    } catch (error) {
      toast.error('Failed to unlink contact: ' + (error as Error).message);
    }
  };

  const openAddOpportunity = () => {
    setNewOppName(company.name);
    setNewOppPipelineId(activePipelines[0]?.id ?? '');
    setAddingOpportunity(true);
  };

  const handleCreateOpportunity = async () => {
    if (!newOppPipelineId || !newOppName.trim()) return;
    try {
      await api.createOpportunity(token, {
        name: newOppName.trim(),
        companyId: company.id,
        pipelineId: newOppPipelineId,
        amountCents: 0,
        currency: tenantCurrency,
        ownerId: company.accountOwnerId || currentUserId,
      });
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
        aria-labelledby="company-detail-name"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overview-panel-head">
          <button type="button" className="slideover-close" onClick={onClose} aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
          <Avatar firstName={company.name} lastName="" />
          <div className="overview-panel-heading">
            <h3 id="company-detail-name">{company.name}</h3>
            <p>{company.industry || 'Company'}</p>
          </div>
          {company.statusDefn && (
            <StatusChip color={company.statusDefn.color || '#6b7280'} label={company.statusDefn.name} />
          )}
        </div>

        <div className="overview-panel-body">
          <Field label="Industry">
            <AutoSaveField label="Industry" value={company.industry || ''} onSave={(v) => save({ industry: v || null })} />
          </Field>
          <Field label="Website">
            <AutoSaveField
              label="Website"
              type="url"
              value={company.website || ''}
              onSave={(v) => save({ website: v || null })}
              placeholder="https://example.com"
            />
          </Field>
          <Field label="Phone">
            <AutoSaveField label="Phone" value={company.phone || ''} onSave={(v) => save({ phone: v || null })} />
          </Field>
          <Field label="Billing Address">
            <AutoSaveField
              label="Billing Address"
              value={company.billingAddress || ''}
              onSave={(v) => save({ billingAddress: v || null })}
            />
          </Field>
          <Field label="Size">
            <AutoSaveField
              label="Size"
              value={company.size || ''}
              onSave={(v) => save({ size: v || null })}
              placeholder="e.g. 11-50 employees"
            />
          </Field>
          <Field label="Account Owner">
            <AutoSaveSelect
              label="Account Owner"
              value={company.accountOwnerId || ''}
              onSave={(v) => save({ accountOwnerId: v || null })}
              options={tenantUsers.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
            />
          </Field>

          {customFields.map((field) => {
            const existing = company.customFieldVals?.find((v) => v.customFieldDefinitionId === field.id);
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

          <div className="overview-field">
            <div className="flex items-center justify-between">
              <span className="overview-field-label">Contacts ({companyContacts.length})</span>
              <button type="button" className="icon-btn" onClick={() => setAddingContact((v) => !v)}>
                <span className="tip">Add contact</span>
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {companyContacts.length === 0 && !addingContact && (
              <p className="text-xs text-gray-400">No contacts linked yet.</p>
            )}
            {companyContacts.map((contact) => (
              <div key={contact.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                <span>
                  {contact.firstName} {contact.lastName}
                  {contact.isPrimary ? ' ★' : ''}
                </span>
                <button type="button" className="icon-btn danger" onClick={() => handleUnlinkContact(contact)}>
                  <span className="tip">Unlink</span>
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {addingContact && (
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-800">
                <div className="flex items-center gap-1.5">
                  <select
                    className="select-compact flex-1"
                    value={linkContactId}
                    onChange={(e) => setLinkContactId(e.target.value)}
                  >
                    <option value="">Link existing contact…</option>
                    {unlinkedContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.firstName} {c.lastName} ({c.email})
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary" onClick={handleLinkContact} disabled={!linkContactId}>
                    Link
                  </button>
                </div>
                <p className="text-xs text-gray-400">or create a new one:</p>
                <div className="flex items-center gap-1.5">
                  <input
                    className="min-w-0 flex-1"
                    placeholder="First name"
                    value={newContact.firstName}
                    onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                  />
                  <input
                    className="min-w-0 flex-1"
                    placeholder="Last name"
                    value={newContact.lastName}
                    onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                  />
                </div>
                <input
                  type="email"
                  placeholder="Email"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary" onClick={() => setAddingContact(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary" onClick={handleCreateContact}>
                    Create contact
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="overview-field">
            <div className="flex items-center justify-between">
              <span className="overview-field-label">Opportunities ({companyOpportunities.length})</span>
              <button type="button" className="icon-btn" onClick={openAddOpportunity}>
                <span className="tip">Add opportunity</span>
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {companyOpportunities.length === 0 && !addingOpportunity && (
              <p className="text-xs text-gray-400">No opportunities yet.</p>
            )}
            {companyOpportunities.map((opp) => (
              <div key={opp.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                <span>{opp.name}</span>
                <span className="text-xs text-gray-400">
                  {opp.stage?.name} · {formatMoney(opp.amountCents, opp.currency)}
                </span>
              </div>
            ))}
            {addingOpportunity && (
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-800">
                <label className="text-xs text-gray-500" htmlFor="new-opp-pipeline">
                  Pipeline
                </label>
                <select
                  id="new-opp-pipeline"
                  value={newOppPipelineId}
                  onChange={(e) => setNewOppPipelineId(e.target.value)}
                >
                  {activePipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label className="text-xs text-gray-500" htmlFor="new-opp-name">
                  Deal name
                </label>
                <input id="new-opp-name" value={newOppName} onChange={(e) => setNewOppName(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary" onClick={() => setAddingOpportunity(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleCreateOpportunity}
                    disabled={!newOppPipelineId}
                  >
                    Create opportunity
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
