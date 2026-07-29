import { useEffect, useState } from 'react';
import Avatar from './Avatar';
import StatusChip from './StatusChip';
import { XIcon } from './Icons';
import { formatMoney } from '../lib/currencies';

type Tab = 'overview' | 'notes' | 'activity';

interface EmployeeOverviewPanelProps {
  employee: any;
  tenantCurrency: string;
  isOwner: boolean;
  onClose: () => void;
  onEdit: () => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="overview-field">
      <span className="overview-field-label">{label}</span>
      <span className="overview-field-value">{value ?? '—'}</span>
    </div>
  );
}

export default function EmployeeOverviewPanel({ employee, tenantCurrency, isOwner, onClose, onEdit }: EmployeeOverviewPanelProps) {
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div
        className="overview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-overview-name"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="overview-panel-head">
        <button type="button" className="slideover-close" onClick={onClose} aria-label="Close">
          <XIcon className="h-4 w-4" />
        </button>
        <Avatar firstName={employee.firstName} lastName={employee.lastName} />
        <div className="overview-panel-heading">
          <h3 id="employee-overview-name">
            {employee.firstName} {employee.lastName}
          </h3>
          <p>{employee.email}</p>
        </div>
        {employee.statusDefn && (
          <StatusChip color={employee.statusDefn.color || '#6b7280'} label={employee.statusDefn.name} />
        )}
      </div>

      <div className="overview-panel-tabs">
        <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button type="button" className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
          Notes
        </button>
        <button type="button" className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>
          Activity
        </button>
      </div>

      <div className="overview-panel-body">
        {tab === 'overview' && (
          <>
            <Field label="Personal Email" value={employee.personalEmail} />
            <Field label="Department" value={employee.departmentDefn?.name} />
            <Field label="Job Title" value={employee.jobTitleDefn?.name} />
            <Field label="Reports To" value={employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : undefined} />
            <Field
              label="Contract Type"
              value={
                employee.contractType === 'part_time' ? 'Part Time' : employee.contractType === 'full_time' ? 'Full Time' : undefined
              }
            />
            <Field
              label="Compensation Type"
              value={
                employee.compensationType === 'hourly' ? 'Hourly' : employee.compensationType === 'monthly' ? 'Monthly' : undefined
              }
            />
            {isOwner && (
              <Field
                label="Hourly Rate"
                value={employee.hourlyRateCents != null ? formatMoney(employee.hourlyRateCents, tenantCurrency) : undefined}
              />
            )}
            {isOwner && (
              <Field
                label="Monthly Rate"
                value={employee.monthlyRateCents != null ? formatMoney(employee.monthlyRateCents, tenantCurrency) : undefined}
              />
            )}
            <Field label="Start Date" value={employee.startDate ? new Date(employee.startDate).toLocaleDateString() : undefined} />
            <Field label="End Date" value={employee.endDate ? new Date(employee.endDate).toLocaleDateString() : undefined} />
            <Field
              label="Contract URL"
              value={
                employee.contractUrl ? (
                  <a href={employee.contractUrl} target="_blank" rel="noopener noreferrer" className="table-link">
                    View
                  </a>
                ) : undefined
              }
            />
            <button type="button" className="btn-secondary w-full text-center" style={{ marginTop: 8 }} onClick={onEdit}>
              Edit employee
            </button>
          </>
        )}
        {tab === 'notes' && <p className="overview-panel-placeholder">Nothing here yet.</p>}
        {tab === 'activity' && <p className="overview-panel-placeholder">Nothing here yet.</p>}
      </div>
      </div>
    </div>
  );
}
