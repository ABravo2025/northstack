import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PayFrequency, PayrollRun, PayrollRunDetail } from '../api';
import { useToast } from '../components/common/ToastProvider';
import SlideOver from '../components/common/SlideOver';
import StatusChip from '../components/common/StatusChip';
import { ChevronLeftIcon, PencilIcon, PlusIcon } from '../components/common/Icons';
import { formatMoney } from '../lib/currencies';

interface PayrollPageProps {
  token: string;
}

const CADENCE_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};

interface PayFrequencyForm {
  name: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  payAnchor: string;
  isActive: boolean;
}

const EMPTY_FREQUENCY_FORM: PayFrequencyForm = { name: '', cadence: 'monthly', payAnchor: '', isActive: true };

type CatalogTab = 'runs' | 'frequencies';

export default function PayrollPage({ token }: PayrollPageProps) {
  const toast = useToast();
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('runs');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // --- Pay frequencies (Unidad 3) ---
  const [frequencies, setFrequencies] = useState<PayFrequency[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PayFrequencyForm>(EMPTY_FREQUENCY_FORM);
  const [saving, setSaving] = useState(false);

  // --- Runs (Unidad 6/7) ---
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [newRunForm, setNewRunForm] = useState({ payFrequencyId: '', periodLabel: '' });
  const [creatingRun, setCreatingRun] = useState(false);

  useEffect(() => {
    loadFrequencies();
    loadRuns();
  }, []);

  const loadFrequencies = async () => {
    setLoading(true);
    try {
      const data = await api.listPayFrequencies(token);
      setFrequencies(data);
    } catch (error) {
      toast.error('Failed to load pay frequencies: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    setRunsLoading(true);
    try {
      const data = await api.listPayrollRuns(token);
      setRuns(data);
    } catch (error) {
      toast.error('Failed to load payroll runs: ' + (error as Error).message);
    } finally {
      setRunsLoading(false);
    }
  };

  const visibleFrequencies = frequencies.filter((f) => f.isActive === !showInactive);
  const activeFrequencies = frequencies.filter((f) => f.isActive);

  const closeSlideOver = () => {
    setSlideOverOpen(false);
    setEditingId(null);
    setForm(EMPTY_FREQUENCY_FORM);
  };

  const handleOpenAdd = () => {
    setForm(EMPTY_FREQUENCY_FORM);
    setEditingId(null);
    setSlideOverOpen(true);
  };

  const handleOpenEdit = (freq: PayFrequency) => {
    setForm({ name: freq.name, cadence: freq.cadence, payAnchor: freq.payAnchor, isActive: freq.isActive });
    setEditingId(freq.id);
    setSlideOverOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.updatePayFrequency(token, editingId, form);
        toast.success('Pay frequency updated.');
      } else {
        await api.createPayFrequency(token, form);
        toast.success('Pay frequency added.');
      }
      closeSlideOver();
      loadFrequencies();
    } catch (error) {
      toast.error('Failed to save pay frequency: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenNewRun = () => {
    setNewRunForm({ payFrequencyId: activeFrequencies[0]?.id ?? '', periodLabel: '' });
    setNewRunOpen(true);
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRun(true);
    try {
      const run = await api.createPayrollRun(token, newRunForm);
      toast.success('Run created.');
      setNewRunOpen(false);
      loadRuns();
      setSelectedRunId(run.id);
    } catch (error) {
      toast.error('Failed to create run: ' + (error as Error).message);
    } finally {
      setCreatingRun(false);
    }
  };

  if (selectedRunId) {
    return (
      <RunDetailView
        token={token}
        runId={selectedRunId}
        onBack={() => {
          setSelectedRunId(null);
          loadRuns();
        }}
      />
    );
  }

  return (
    <div className="container">
      <SlideOver
        open={slideOverOpen}
        title={editingId ? 'Edit Pay Frequency' : 'New Pay Frequency'}
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="pay-frequency-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        <form id="pay-frequency-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pf-name">Name</label>
            <input
              id="pf-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Mensual, Quincenal"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="pf-cadence">Cadence</label>
            <select
              id="pf-cadence"
              value={form.cadence}
              onChange={(e) => setForm({ ...form, cadence: e.target.value as PayFrequencyForm['cadence'] })}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pf-anchor">Pay day(s)</label>
            <input
              id="pf-anchor"
              type="text"
              value={form.payAnchor}
              onChange={(e) => setForm({ ...form, payAnchor: e.target.value })}
              placeholder="e.g. Último día hábil, Días 15 y 30"
              required
            />
          </div>
          {editingId && (
            <div className="form-group">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="w-auto"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
          )}
        </form>
      </SlideOver>

      <SlideOver
        open={newRunOpen}
        title="New Run"
        onClose={() => setNewRunOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setNewRunOpen(false)} disabled={creatingRun}>
              Cancel
            </button>
            <button type="submit" form="new-run-form" className="btn-primary" disabled={creatingRun}>
              {creatingRun ? 'Creating…' : 'Create run'}
            </button>
          </>
        }
      >
        <form id="new-run-form" onSubmit={handleCreateRun}>
          <div className="form-group">
            <label htmlFor="run-frequency">Pay frequency</label>
            <select
              id="run-frequency"
              value={newRunForm.payFrequencyId}
              onChange={(e) => setNewRunForm({ ...newRunForm, payFrequencyId: e.target.value })}
              required
            >
              <option value="">-- select --</option>
              {activeFrequencies.map((freq) => (
                <option key={freq.id} value={freq.id}>
                  {freq.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="run-period">Period</label>
            <input
              id="run-period"
              type="text"
              value={newRunForm.periodLabel}
              onChange={(e) => setNewRunForm({ ...newRunForm, periodLabel: e.target.value })}
              placeholder="e.g. 2da quincena · agosto 2026"
              required
            />
          </div>
        </form>
      </SlideOver>

      <div className="page-toolbar no-border">
        <h2>Payroll</h2>
      </div>

      <div className="views-bar">
        <button
          type="button"
          className={`view-tab ${catalogTab === 'runs' ? 'active' : ''}`}
          onClick={() => setCatalogTab('runs')}
        >
          Runs
        </button>
        <button
          type="button"
          className={`view-tab ${catalogTab === 'frequencies' ? 'active' : ''}`}
          onClick={() => setCatalogTab('frequencies')}
        >
          Pay Frequencies
        </button>
        {catalogTab === 'runs' ? (
          <button type="button" className="btn-outline gap-1.5 ml-auto" onClick={handleOpenNewRun}>
            <PlusIcon className="h-3.5 w-3.5" />
            New Run
          </button>
        ) : (
          <button type="button" className="btn-outline gap-1.5 ml-auto" onClick={handleOpenAdd}>
            <PlusIcon className="h-3.5 w-3.5" />
            New Pay Frequency
          </button>
        )}
      </div>

      {catalogTab === 'runs' && (
        <div className="mt-4">
          {runsLoading && <p>Loading...</p>}
          {!runsLoading && runs.length === 0 && (
            <p className="text-sm text-gray-500">No runs yet — create one from a pay frequency to pre-load who gets paid.</p>
          )}
          {!runsLoading && runs.length > 0 && (
            <div className="full-table-wrap">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Frequency</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="cursor-pointer" onClick={() => setSelectedRunId(run.id)}>
                      <td>
                        <button type="button" className="table-link">
                          {run.periodLabel}
                        </button>
                      </td>
                      <td>{run.payFrequency?.name ?? '—'}</td>
                      <td>
                        <StatusChip
                          color={run.status === 'confirmed' ? '#047857' : '#9ca3af'}
                          label={run.status === 'confirmed' ? 'Confirmed' : 'Draft'}
                        />
                      </td>
                      <td>{run.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {catalogTab === 'frequencies' && (
        <div className="mt-4">
          <p className="text-sm text-gray-500 mb-3">
            Assigning a pay frequency + rate to a person happens from their employee record, not here.
          </p>

          {loading && <p>Loading...</p>}

          {!loading && (
            <>
              <div className="mini-toggle-row mb-3">
                <button
                  type="button"
                  className={`mini-toggle-opt ${!showInactive ? 'active' : ''}`}
                  onClick={() => setShowInactive(false)}
                >
                  Active ({frequencies.filter((f) => f.isActive).length})
                </button>
                <button
                  type="button"
                  className={`mini-toggle-opt ${showInactive ? 'active' : ''}`}
                  onClick={() => setShowInactive(true)}
                >
                  Deactivated ({frequencies.filter((f) => !f.isActive).length})
                </button>
              </div>

              {visibleFrequencies.length === 0 ? (
                <p className="text-sm text-gray-500">{showInactive ? 'No deactivated pay frequencies.' : 'No active pay frequencies.'}</p>
              ) : (
                <div className="full-table-wrap">
                  <table className="table full-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Cadence</th>
                        <th>Pay day(s)</th>
                        <th>Assigned people</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFrequencies.map((freq) => (
                        <tr key={freq.id} className={!freq.isActive ? 'table-row-inactive' : ''}>
                          <td>{freq.name}</td>
                          <td>{CADENCE_LABELS[freq.cadence] || freq.cadence}</td>
                          <td>{freq.payAnchor}</td>
                          <td>{freq.assignedCount}</td>
                          <td>
                            <div className="icon-actions">
                              <button className="icon-btn" onClick={() => handleOpenEdit(freq)}>
                                <span className="tip">Edit</span>
                                <PencilIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface RunDetailViewProps {
  token: string;
  runId: string;
  onBack: () => void;
}

// Unidades 7-11: creation lives on PayrollPage, this is the standalone detail
// screen (not a modal — a full table, per the mockup) for a single run.
function RunDetailView({ token, runId, onBack }: RunDetailViewProps) {
  const toast = useToast();
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getPayrollRun(token, runId);
      setRun(data);
    } catch (error) {
      toast.error('Failed to load run: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="page-toolbar no-border">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to runs">
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <h2>{run?.periodLabel ?? 'Run'}</h2>
        {run && (
          <StatusChip
            color={run.status === 'confirmed' ? '#047857' : '#9ca3af'}
            label={run.status === 'confirmed' ? 'Confirmed' : 'Draft'}
          />
        )}
      </div>

      {loading && <p>Loading...</p>}

      {!loading && run && (
        <div className="mt-4 full-table-wrap">
          <table className="table full-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Compensation</th>
                <th>Base</th>
                <th>Adjustments</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {run.employeeGroups.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-sm text-gray-500">
                    Nobody has a compensation record under this pay frequency yet.
                  </td>
                </tr>
              )}
              {run.employeeGroups.map((group) => {
                const adjustmentsTotal = group.adjustments.reduce((sum, a) => sum + a.amountCents, 0);
                return (
                  <tr key={group.employee.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {group.employee.firstName} {group.employee.lastName}
                        <StatusChip
                          color={group.employee.statusDefn.color || '#9ca3af'}
                          label={group.employee.statusDefn.name}
                        />
                      </div>
                    </td>
                    <td>{group.compensationType === 'hourly' ? 'Hourly' : group.compensationType === 'fixed' ? 'Fixed' : '—'}</td>
                    <td>
                      {group.base ? formatMoney(group.base.amountCents, group.base.currency) : '—'}
                      {group.base?.hoursQty != null ? ` (${group.base.hoursQty}h)` : ''}
                    </td>
                    <td>
                      {group.adjustments.length === 0
                        ? '—'
                        : `${adjustmentsTotal >= 0 ? '+' : ''}${formatMoney(adjustmentsTotal, group.adjustments[0].currency)} (${group.adjustments.length})`}
                    </td>
                    <td>{group.base ? formatMoney(group.total, group.base.currency) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
