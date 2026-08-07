import { useEffect, useState } from 'react';
import { api } from '../api';
import type { DueDateOffset, PayFrequency, PayFrequencyCadence, PaymentMethod } from '../api';
import { useToast } from '../components/common/ToastProvider';
import Modal from '../components/common/Modal';
import RequiredMark from '../components/common/RequiredMark';
import EmptyState from '../components/common/EmptyState';
import TableSkeleton from '../components/common/TableSkeleton';
import { CalendarIcon, PencilIcon, PlusIcon } from '../components/common/Icons';

interface PayrollPageProps {
  user: any;
  token: string;
}

// Only one tab exists yet (Unidad 3) — the tab bar itself is deliberate this
// early because docs/spec-payroll.md's later units (Asignaciones, Runs,
// Timeline) add siblings here, not a rebuild of this page's shell.
type Tab = 'policies';

const CADENCE_LABELS: Record<PayFrequencyCadence, string> = {
  weekly: 'Weekly',
  semimonthly: 'Semi-monthly',
  monthly: 'Monthly',
};

const DUE_DATE_LABELS: Record<DueDateOffset, string> = {
  same_day: 'Same day',
  plus_2: '+2 days',
  plus_5: '+5 days',
  custom: 'Custom',
};

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_OF_WEEK_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function parseAnchorConfig(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Renders anchorConfig's cadence-dependent shape (docs/spec-payroll.md
// Unidad 1) as the single readable "pay day(s)" column value.
function describeAnchorConfig(freq: PayFrequency): string {
  const config = parseAnchorConfig(freq.anchorConfig);
  if (freq.cadence === 'weekly') {
    return DAY_OF_WEEK_LABELS[config.dayOfWeek] || '—';
  }
  if (freq.cadence === 'semimonthly') {
    if (config.preset === 'first_15') return '1st and 15th';
    if (config.preset === 'fifteen_last') return '15th and last day';
    if (config.preset === 'custom' && Array.isArray(config.days)) return `${config.days[0]} and ${config.days[1]}`;
    return '—';
  }
  if (config.preset === 'first_business_day') return 'First business day';
  if (config.preset === 'last_business_day') return 'Last business day';
  if (config.preset === 'custom' && config.day) return `Day ${config.day}`;
  return '—';
}

function describeDueDate(freq: PayFrequency): string {
  if (freq.dueDateOffset === 'custom') {
    return freq.dueDateCustomDays != null ? `+${freq.dueDateCustomDays} days` : 'Custom';
  }
  return DUE_DATE_LABELS[freq.dueDateOffset];
}

interface FrequencyFormState {
  name: string;
  cadence: PayFrequencyCadence;
  dayOfWeek: string;
  semimonthlyPreset: 'first_15' | 'fifteen_last' | 'custom';
  semimonthlyCustomDay1: string;
  semimonthlyCustomDay2: string;
  monthlyPreset: 'first_business_day' | 'last_business_day' | 'custom';
  monthlyCustomDay: string;
  dueDateOffset: DueDateOffset;
  dueDateCustomDays: string;
  isActive: boolean;
}

const EMPTY_FREQUENCY_FORM: FrequencyFormState = {
  name: '',
  cadence: 'weekly',
  dayOfWeek: 'friday',
  semimonthlyPreset: 'first_15',
  semimonthlyCustomDay1: '1',
  semimonthlyCustomDay2: '15',
  monthlyPreset: 'first_business_day',
  monthlyCustomDay: '1',
  dueDateOffset: 'same_day',
  dueDateCustomDays: '2',
  isActive: true,
};

function formStateFromFrequency(freq: PayFrequency): FrequencyFormState {
  const config = parseAnchorConfig(freq.anchorConfig);
  const base: FrequencyFormState = {
    ...EMPTY_FREQUENCY_FORM,
    name: freq.name,
    cadence: freq.cadence,
    dueDateOffset: freq.dueDateOffset,
    dueDateCustomDays: String(freq.dueDateCustomDays ?? 2),
    isActive: freq.isActive,
  };
  if (freq.cadence === 'weekly') {
    return { ...base, dayOfWeek: config.dayOfWeek || 'friday' };
  }
  if (freq.cadence === 'semimonthly') {
    if (config.preset === 'custom' && Array.isArray(config.days)) {
      return {
        ...base,
        semimonthlyPreset: 'custom',
        semimonthlyCustomDay1: String(config.days[0] ?? 1),
        semimonthlyCustomDay2: String(config.days[1] ?? 15),
      };
    }
    return { ...base, semimonthlyPreset: config.preset || 'first_15' };
  }
  if (config.preset === 'custom' && config.day) {
    return { ...base, monthlyPreset: 'custom', monthlyCustomDay: String(config.day) };
  }
  return { ...base, monthlyPreset: config.preset || 'first_business_day' };
}

function buildAnchorConfig(form: FrequencyFormState): Record<string, unknown> {
  if (form.cadence === 'weekly') {
    return { dayOfWeek: form.dayOfWeek };
  }
  if (form.cadence === 'semimonthly') {
    if (form.semimonthlyPreset === 'custom') {
      return { preset: 'custom', days: [Number(form.semimonthlyCustomDay1), Number(form.semimonthlyCustomDay2)] };
    }
    return { preset: form.semimonthlyPreset };
  }
  if (form.monthlyPreset === 'custom') {
    return { preset: 'custom', day: Number(form.monthlyCustomDay) };
  }
  return { preset: form.monthlyPreset };
}

export default function PayrollPage({ user, token }: PayrollPageProps) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('policies');
  const [frequencies, setFrequencies] = useState<PayFrequency[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [frequencyFilter, setFrequencyFilter] = useState<'active' | 'inactive'>('active');

  const isOwner = user.role === 'owner';

  const [frequencyModalOpen, setFrequencyModalOpen] = useState(false);
  const [editingFrequencyId, setEditingFrequencyId] = useState<string | null>(null);
  const [frequencyForm, setFrequencyForm] = useState<FrequencyFormState>(EMPTY_FREQUENCY_FORM);
  const [savingFrequency, setSavingFrequency] = useState(false);

  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [methodName, setMethodName] = useState('');
  const [savingMethod, setSavingMethod] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [freqData, methodData] = await Promise.all([api.listPayFrequencies(token), api.listPaymentMethods(token)]);
      setFrequencies(freqData);
      setPaymentMethods(methodData);
    } catch (error) {
      toast.error('Failed to load payroll settings: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openAddFrequency = () => {
    setEditingFrequencyId(null);
    setFrequencyForm(EMPTY_FREQUENCY_FORM);
    setFrequencyModalOpen(true);
  };

  const openEditFrequency = (freq: PayFrequency) => {
    setEditingFrequencyId(freq.id);
    setFrequencyForm(formStateFromFrequency(freq));
    setFrequencyModalOpen(true);
  };

  const handleSaveFrequency = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = frequencyForm.name.trim();
    if (!name) return;
    setSavingFrequency(true);
    try {
      const payload = {
        name,
        cadence: frequencyForm.cadence,
        anchorConfig: buildAnchorConfig(frequencyForm),
        dueDateOffset: frequencyForm.dueDateOffset,
        dueDateCustomDays: frequencyForm.dueDateOffset === 'custom' ? Number(frequencyForm.dueDateCustomDays) : null,
      };
      if (editingFrequencyId) {
        await api.updatePayFrequency(token, editingFrequencyId, { ...payload, isActive: frequencyForm.isActive });
        toast.success('Pay frequency updated.');
      } else {
        await api.createPayFrequency(token, payload);
        toast.success('Pay frequency created.');
      }
      setFrequencyModalOpen(false);
      load();
    } catch (error) {
      toast.error('Failed to save pay frequency: ' + (error as Error).message);
    } finally {
      setSavingFrequency(false);
    }
  };

  const openAddMethod = () => {
    setMethodName('');
    setMethodModalOpen(true);
  };

  const handleSaveMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = methodName.trim();
    if (!name) return;
    setSavingMethod(true);
    try {
      await api.createPaymentMethod(token, { name });
      toast.success('Payment method added.');
      setMethodModalOpen(false);
      load();
    } catch (error) {
      toast.error('Failed to add payment method: ' + (error as Error).message);
    } finally {
      setSavingMethod(false);
    }
  };

  const handleToggleMethodActive = async (method: PaymentMethod) => {
    try {
      await api.updatePaymentMethod(token, method.id, { isActive: !method.isActive });
      toast.success(method.isActive ? 'Payment method deactivated.' : 'Payment method activated.');
      load();
    } catch (error) {
      toast.error('Failed to update payment method: ' + (error as Error).message);
    }
  };

  const activeFrequencies = frequencies.filter((f) => f.isActive);
  const inactiveFrequencies = frequencies.filter((f) => !f.isActive);
  const filteredFrequencies = frequencyFilter === 'active' ? activeFrequencies : inactiveFrequencies;

  return (
    <div className="container">
      <div className="page-toolbar">
        <h2 className="page-title">Payroll</h2>
      </div>

      <div className="views-bar">
        <button type="button" className={`view-tab ${tab === 'policies' ? 'active' : ''}`} onClick={() => setTab('policies')}>
          Payment Policies
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <TableSkeleton rows={5} columns={5} />
        ) : (
          tab === 'policies' && (
            <>
              <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                  <h3 className="card-title mb-1">Pay frequencies</h3>
                  <p className="text-sm text-ink-muted">
                    Assigning a policy and an amount to each person happens from their profile, not here.
                  </p>
                </div>
                {isOwner && (
                  <button type="button" className="btn-outline gap-1.5" onClick={openAddFrequency}>
                    <PlusIcon className="h-3.5 w-3.5" />
                    New policy
                  </button>
                )}
              </div>

              {frequencies.length === 0 ? (
                <EmptyState
                  icon={<CalendarIcon />}
                  title="No pay frequencies yet"
                  body="A pay frequency defines how often and on what schedule people get paid."
                  primaryLabel="New policy"
                  onPrimary={openAddFrequency}
                />
              ) : (
                <>
                  <div className="mini-toggle-row mb-3 mt-3">
                    <button
                      type="button"
                      className={`mini-toggle-opt ${frequencyFilter === 'active' ? 'active' : ''}`}
                      onClick={() => setFrequencyFilter('active')}
                    >
                      Active ({activeFrequencies.length})
                    </button>
                    <button
                      type="button"
                      className={`mini-toggle-opt ${frequencyFilter === 'inactive' ? 'active' : ''}`}
                      onClick={() => setFrequencyFilter('inactive')}
                    >
                      Deactivated ({inactiveFrequencies.length})
                    </button>
                  </div>

                  {filteredFrequencies.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      {frequencyFilter === 'active' ? 'No active pay frequencies.' : 'No deactivated pay frequencies.'}
                    </p>
                  ) : (
                    <div className="full-table-wrap">
                      <table className="table full-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Cadence</th>
                            <th>Pay day(s)</th>
                            <th>Due date</th>
                            <th>Assigned</th>
                            {isOwner && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFrequencies.map((freq) => (
                            <tr key={freq.id} className={!freq.isActive ? 'table-row-inactive' : ''}>
                              <td>
                                <span className={!freq.isActive ? 'line-through' : ''}>{freq.name}</span>
                              </td>
                              <td>{CADENCE_LABELS[freq.cadence]}</td>
                              <td>{describeAnchorConfig(freq)}</td>
                              <td>{describeDueDate(freq)}</td>
                              <td>{freq.assignedCount ?? 0}</td>
                              {isOwner && (
                                <td>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => openEditFrequency(freq)}
                                    aria-label={`Edit ${freq.name}`}
                                  >
                                    <span className="tip">Edit</span>
                                    <PencilIcon className="h-4 w-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-start justify-between gap-4 mt-6 mb-3">
                <h3 className="card-title">Payment methods</h3>
                {isOwner && (
                  <button type="button" className="btn-outline gap-1.5" onClick={openAddMethod}>
                    <PlusIcon className="h-3.5 w-3.5" />
                    Add method
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between gap-3 card"
                    style={{ padding: '0.5rem 0.75rem' }}
                  >
                    <span className={!method.isActive ? 'line-through text-ink-muted' : ''}>{method.name}</span>
                    {isOwner && (
                      <button type="button" className="btn-secondary btn-sm" onClick={() => handleToggleMethodActive(method)}>
                        {method.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </div>

      <Modal
        open={frequencyModalOpen}
        title={editingFrequencyId ? 'Edit pay frequency' : 'New pay frequency'}
        onClose={() => setFrequencyModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setFrequencyModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="frequency-form" className="btn-primary" disabled={savingFrequency}>
              {savingFrequency ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="frequency-form" onSubmit={handleSaveFrequency}>
          <div className="form-group">
            <label htmlFor="freq-name">
              Name
              <RequiredMark />
            </label>
            <input
              id="freq-name"
              type="text"
              required
              autoFocus
              value={frequencyForm.name}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, name: e.target.value })}
              placeholder="e.g. Semanal"
            />
          </div>

          <div className="form-group">
            <label htmlFor="freq-cadence">
              Cadence
              <RequiredMark />
            </label>
            <select
              id="freq-cadence"
              value={frequencyForm.cadence}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, cadence: e.target.value as PayFrequencyCadence })}
            >
              <option value="weekly">Weekly</option>
              <option value="semimonthly">Semi-monthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {frequencyForm.cadence === 'weekly' && (
            <div className="form-group">
              <label htmlFor="freq-dow">
                Day of week
                <RequiredMark />
              </label>
              <select
                id="freq-dow"
                value={frequencyForm.dayOfWeek}
                onChange={(e) => setFrequencyForm({ ...frequencyForm, dayOfWeek: e.target.value })}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {DAY_OF_WEEK_LABELS[day]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {frequencyForm.cadence === 'semimonthly' && (
            <div className="form-group">
              <span>
                Pay days
                <RequiredMark />
              </span>
              <div className="flex flex-col gap-1.5 mt-1.5">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="semimonthly-preset"
                    checked={frequencyForm.semimonthlyPreset === 'first_15'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, semimonthlyPreset: 'first_15' })}
                  />
                  1st and 15th
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="semimonthly-preset"
                    checked={frequencyForm.semimonthlyPreset === 'fifteen_last'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, semimonthlyPreset: 'fifteen_last' })}
                  />
                  15th and last day
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="semimonthly-preset"
                    checked={frequencyForm.semimonthlyPreset === 'custom'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, semimonthlyPreset: 'custom' })}
                  />
                  Custom
                </label>
                {frequencyForm.semimonthlyPreset === 'custom' && (
                  <div className="flex items-center gap-2 ml-6">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      style={{ width: 80 }}
                      value={frequencyForm.semimonthlyCustomDay1}
                      onChange={(e) => setFrequencyForm({ ...frequencyForm, semimonthlyCustomDay1: e.target.value })}
                    />
                    <span>and</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      style={{ width: 80 }}
                      value={frequencyForm.semimonthlyCustomDay2}
                      onChange={(e) => setFrequencyForm({ ...frequencyForm, semimonthlyCustomDay2: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {frequencyForm.cadence === 'monthly' && (
            <div className="form-group">
              <span>
                Pay day
                <RequiredMark />
              </span>
              <div className="flex flex-col gap-1.5 mt-1.5">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-preset"
                    checked={frequencyForm.monthlyPreset === 'first_business_day'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, monthlyPreset: 'first_business_day' })}
                  />
                  First business day
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-preset"
                    checked={frequencyForm.monthlyPreset === 'last_business_day'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, monthlyPreset: 'last_business_day' })}
                  />
                  Last business day
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-preset"
                    checked={frequencyForm.monthlyPreset === 'custom'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, monthlyPreset: 'custom' })}
                  />
                  Custom
                </label>
                {frequencyForm.monthlyPreset === 'custom' && (
                  <div className="ml-6">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      style={{ width: 80 }}
                      value={frequencyForm.monthlyCustomDay}
                      onChange={(e) => setFrequencyForm({ ...frequencyForm, monthlyCustomDay: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="freq-due">Due date</label>
            <select
              id="freq-due"
              value={frequencyForm.dueDateOffset}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, dueDateOffset: e.target.value as DueDateOffset })}
            >
              <option value="same_day">Same day</option>
              <option value="plus_2">+2 days</option>
              <option value="plus_5">+5 days</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {frequencyForm.dueDateOffset === 'custom' && (
            <div className="form-group">
              <label htmlFor="freq-due-custom">Days</label>
              <input
                id="freq-due-custom"
                type="number"
                min={0}
                value={frequencyForm.dueDateCustomDays}
                onChange={(e) => setFrequencyForm({ ...frequencyForm, dueDateCustomDays: e.target.value })}
              />
            </div>
          )}

          {editingFrequencyId && (
            <div className="form-group">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={frequencyForm.isActive}
                  onChange={(e) => setFrequencyForm({ ...frequencyForm, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={methodModalOpen}
        title="Add payment method"
        onClose={() => setMethodModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setMethodModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="method-form" className="btn-primary" disabled={savingMethod}>
              {savingMethod ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="method-form" onSubmit={handleSaveMethod}>
          <div className="form-group">
            <label htmlFor="method-name">
              Name
              <RequiredMark />
            </label>
            <input id="method-name" type="text" required autoFocus value={methodName} onChange={(e) => setMethodName(e.target.value)} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
