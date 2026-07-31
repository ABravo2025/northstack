import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PayFrequency } from '../api';
import { useToast } from '../components/common/ToastProvider';
import SlideOver from '../components/common/SlideOver';
import { PencilIcon, PlusIcon } from '../components/common/Icons';

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

export default function PayrollPage({ token }: PayrollPageProps) {
  const toast = useToast();
  const [frequencies, setFrequencies] = useState<PayFrequency[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PayFrequencyForm>(EMPTY_FREQUENCY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFrequencies();
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

  const visibleFrequencies = frequencies.filter((f) => f.isActive === !showInactive);

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

      <div className="page-toolbar no-border">
        <h2>Payroll</h2>
      </div>

      <div className="views-bar">
        <button type="button" className="view-tab active">
          Pay Frequencies
        </button>
        <button type="button" className="btn-outline gap-1.5 ml-auto" onClick={handleOpenAdd}>
          <PlusIcon className="h-3.5 w-3.5" />
          New Pay Frequency
        </button>
      </div>

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
    </div>
  );
}
