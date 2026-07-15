import { useState, useEffect } from 'react';
import { api } from '../api';
import ColorPicker from '../components/ColorPicker';
import { useToast } from '../components/ToastProvider';

interface PtoPoliciesSettingsPageProps {
  token: string;
}

export default function PtoPoliciesSettingsPage({ token }: PtoPoliciesSettingsPageProps) {
  const toast = useToast();
  const [policies, setPolicies] = useState<any[]>([]);
  const [newPolicy, setNewPolicy] = useState({
    name: '',
    color: '#3c6da1',
    accrualMethod: 'fixed_annual',
    daysPerYear: '15',
    isPaid: true,
    requiresApproval: true,
  });

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      const defs = await api.listPtoPolicies(token);
      setPolicies(defs);
    } catch (error) {
      toast.error('Failed to load PTO policies: ' + (error as Error).message);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createPtoPolicy(token, {
        name: newPolicy.name,
        color: newPolicy.color,
        accrualMethod: newPolicy.accrualMethod as 'fixed_annual' | 'monthly',
        daysPerYear: Number(newPolicy.daysPerYear),
        isPaid: newPolicy.isPaid,
        requiresApproval: newPolicy.requiresApproval,
      });
      setNewPolicy({
        name: '',
        color: '#3c6da1',
        accrualMethod: 'fixed_annual',
        daysPerYear: '15',
        isPaid: true,
        requiresApproval: true,
      });
      toast.success('PTO policy added.');
      loadPolicies();
    } catch (error) {
      toast.error('Failed to create PTO policy: ' + (error as Error).message);
    }
  };

  const handleToggleActive = async (policy: any) => {
    try {
      await api.updatePtoPolicy(token, policy.id, { isActive: !policy.isActive });
      loadPolicies();
    } catch (error) {
      toast.error('Failed to update PTO policy: ' + (error as Error).message);
    }
  };

  return (
    <div className="card">
      <h3>PTO Policies</h3>
      <p className="text-sm text-gray-500 mb-3">
        Define the types of leave your company offers (e.g. PTO, Sick Leave, Leave Emergency),
        how many days each grants per year, and how those days accrue.
      </p>

      {policies.length === 0 ? (
        <p>No PTO policies defined yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Days/Year</th>
              <th>Accrual</th>
              <th>Paid</th>
              <th>Requires Approval</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id}>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: policy.color || '#9ca3af',
                      marginRight: 8,
                    }}
                  ></span>
                  {policy.name}
                </td>
                <td>{policy.daysPerYear}</td>
                <td>{policy.accrualMethod === 'monthly' ? 'Monthly' : 'Fixed annual'}</td>
                <td>{policy.isPaid ? 'Yes' : 'No'}</td>
                <td>{policy.requiresApproval ? 'Yes' : 'No'}</td>
                <td>{policy.isActive ? 'Active' : 'Inactive'}</td>
                <td>
                  <button
                    className="btn-secondary px-2 py-1 text-xs"
                    onClick={() => handleToggleActive(policy)}
                  >
                    {policy.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="mt-5">Add PTO Policy</h3>
      <form onSubmit={handleCreatePolicy}>
        <div className="form-group">
          <label htmlFor="policy-name">Name</label>
          <input
            id="policy-name"
            type="text"
            value={newPolicy.name}
            onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
            placeholder="e.g. PTO, Sick Leave, Leave Emergency"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="policy-days">Days per year</label>
          <input
            id="policy-days"
            type="number"
            min="0"
            step="0.5"
            value={newPolicy.daysPerYear}
            onChange={(e) => setNewPolicy({ ...newPolicy, daysPerYear: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="policy-accrual">Accrual method</label>
          <select
            id="policy-accrual"
            value={newPolicy.accrualMethod}
            onChange={(e) => setNewPolicy({ ...newPolicy, accrualMethod: e.target.value })}
          >
            <option value="fixed_annual">Fixed annual — all days available at once</option>
            <option value="monthly">Monthly — days accrue progressively</option>
          </select>
        </div>
        <div className="form-group">
          <label>Color</label>
          <ColorPicker
            value={newPolicy.color}
            onChange={(color) => setNewPolicy({ ...newPolicy, color })}
          />
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={newPolicy.isPaid}
              onChange={(e) => setNewPolicy({ ...newPolicy, isPaid: e.target.checked })}
            />{' '}
            Paid
          </label>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={newPolicy.requiresApproval}
              onChange={(e) => setNewPolicy({ ...newPolicy, requiresApproval: e.target.checked })}
            />{' '}
            Requires approval
          </label>
        </div>
        <button type="submit" className="btn-primary">
          Add PTO Policy
        </button>
      </form>
    </div>
  );
}
