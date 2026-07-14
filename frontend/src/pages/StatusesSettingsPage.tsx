import { useState, useEffect } from 'react';
import { api } from '../api';
import ColorPicker from '../components/ColorPicker';

interface StatusesSettingsPageProps {
  token: string;
}

type Module = 'employee' | 'client';

export default function StatusesSettingsPage({ token }: StatusesSettingsPageProps) {
  const [settingsModule, setSettingsModule] = useState<Module>('employee');
  const [statuses, setStatuses] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState({ name: '', color: '#3c6da1' });

  useEffect(() => {
    loadStatuses();
  }, [settingsModule]);

  const loadStatuses = async () => {
    setError(null);
    try {
      const defs = await api.listStatusDefinitions(token, settingsModule);
      setStatuses(defs.sort((a, b) => a.order - b.order));
    } catch (error) {
      setError('Failed to load statuses: ' + (error as Error).message);
    }
  };

  const handleCreateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createStatusDefinition(token, {
        entityType: settingsModule,
        name: newStatus.name,
        color: newStatus.color,
        order: statuses.length,
      });
      setNewStatus({ name: '', color: '#3c6da1' });
      loadStatuses();
    } catch (error) {
      setError('Failed to create status: ' + (error as Error).message);
    }
  };

  const handleToggleActive = async (status: any) => {
    setError(null);
    try {
      await api.updateStatusDefinition(token, status.id, { isActive: !status.isActive });
      loadStatuses();
    } catch (error) {
      setError('Failed to update status: ' + (error as Error).message);
    }
  };

  const handleSetDefault = async (status: any) => {
    setError(null);
    try {
      await api.updateStatusDefinition(token, status.id, { isDefault: true });
      loadStatuses();
    } catch (error) {
      setError('Failed to update status: ' + (error as Error).message);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= statuses.length) {
      return;
    }
    setError(null);
    try {
      const current = statuses[index];
      const target = statuses[targetIndex];
      await api.updateStatusDefinition(token, current.id, { order: target.order });
      await api.updateStatusDefinition(token, target.id, { order: current.order });
      loadStatuses();
    } catch (error) {
      setError('Failed to reorder statuses: ' + (error as Error).message);
    }
  };

  return (
    <div className="card">
      <h3>Statuses</h3>
      <div className="nav mb-5">
        <button
          className={settingsModule === 'employee' ? 'active' : ''}
          onClick={() => setSettingsModule('employee')}
        >
          Employees
        </button>
        <button
          className={settingsModule === 'client' ? 'active' : ''}
          onClick={() => setSettingsModule('client')}
        >
          Clients
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {statuses.length === 0 ? (
        <p>No statuses defined for this module yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Default</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((status, index) => (
              <tr key={status.id}>
                <td>
                  <button
                    className="btn-secondary px-2 py-1 text-xs mr-1.5"
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="btn-secondary px-2 py-1 text-xs"
                    disabled={index === statuses.length - 1}
                    onClick={() => handleMove(index, 1)}
                  >
                    ↓
                  </button>
                </td>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: status.color || '#9ca3af',
                      marginRight: 8,
                    }}
                  ></span>
                  {status.name}
                </td>
                <td>
                  {status.isDefault ? (
                    'Default'
                  ) : (
                    <button
                      className="btn-secondary px-2 py-1 text-xs"
                      onClick={() => handleSetDefault(status)}
                    >
                      Set default
                    </button>
                  )}
                </td>
                <td>{status.isActive ? 'Active' : 'Inactive'}</td>
                <td>
                  <button
                    className="btn-secondary px-2 py-1 text-xs"
                    onClick={() => handleToggleActive(status)}
                  >
                    {status.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="mt-5">Add Status</h3>
      <form onSubmit={handleCreateStatus}>
        <div className="form-group">
          <label>Name</label>
          <input
            type="text"
            value={newStatus.name}
            onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })}
            placeholder="e.g. On Leave"
            required
          />
        </div>
        <div className="form-group">
          <label>Color</label>
          <ColorPicker
            value={newStatus.color}
            onChange={(color) => setNewStatus({ ...newStatus, color })}
          />
        </div>
        <button type="submit" className="btn-primary">
          Add Status
        </button>
      </form>
    </div>
  );
}
