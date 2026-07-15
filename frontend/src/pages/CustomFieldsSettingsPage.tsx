import { useState, useEffect } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';

interface CustomFieldsSettingsPageProps {
  token: string;
}

type Module = 'employee' | 'client';

export default function CustomFieldsSettingsPage({ token }: CustomFieldsSettingsPageProps) {
  const toast = useToast();
  const [settingsModule, setSettingsModule] = useState<Module>('employee');
  const [settingsCustomFields, setSettingsCustomFields] = useState<any[]>([]);
  const [newCustomField, setNewCustomField] = useState({
    name: '',
    fieldType: 'text',
    options: '',
    required: false,
  });

  useEffect(() => {
    loadSettingsCustomFields();
  }, [settingsModule]);

  const loadSettingsCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, settingsModule);
      setSettingsCustomFields(defs);
    } catch (error) {
      toast.error('Failed to load custom fields: ' + (error as Error).message);
    }
  };

  const handleCreateSettingsCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const options =
        newCustomField.fieldType === 'select'
          ? JSON.stringify(
              newCustomField.options
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean),
            )
          : undefined;

      await api.createCustomFieldDefinition(token, {
        name: newCustomField.name,
        entityType: settingsModule,
        fieldType: newCustomField.fieldType,
        options,
        required: newCustomField.required,
      });
      setNewCustomField({ name: '', fieldType: 'text', options: '', required: false });
      toast.success('Custom field added.');
      loadSettingsCustomFields();
    } catch (error) {
      toast.error('Failed to create custom field: ' + (error as Error).message);
    }
  };

  const handleToggleCustomFieldActive = async (field: any) => {
    try {
      await api.setCustomFieldDefinitionActive(token, field.id, !field.isActive);
      loadSettingsCustomFields();
    } catch (error) {
      toast.error('Failed to update custom field: ' + (error as Error).message);
    }
  };

  return (
    <div className="card">
      <h3>Custom Fields</h3>
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

      {settingsCustomFields.length === 0 ? (
        <p>No custom fields defined for this module yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Required</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {settingsCustomFields.map((field) => (
              <tr key={field.id}>
                <td>{field.name}</td>
                <td>{field.fieldType}</td>
                <td>{field.required ? 'Yes' : 'No'}</td>
                <td>{field.isActive ? 'Active' : 'Inactive'}</td>
                <td>
                  <button
                    className="btn btn-secondary px-2 py-1 text-xs"
                    onClick={() => handleToggleCustomFieldActive(field)}
                  >
                    {field.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="mt-5">Add Custom Field</h3>
      <form onSubmit={handleCreateSettingsCustomField}>
        <div className="form-group">
          <label htmlFor="cf-name">Field Name</label>
          <input
            id="cf-name"
            type="text"
            value={newCustomField.name}
            onChange={(e) => setNewCustomField({ ...newCustomField, name: e.target.value })}
            placeholder="e.g. Emergency Contact"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="cf-type">Field Type</label>
          <select
            id="cf-type"
            value={newCustomField.fieldType}
            onChange={(e) => setNewCustomField({ ...newCustomField, fieldType: e.target.value })}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="email">Email</option>
            <option value="select">Select (dropdown)</option>
          </select>
        </div>
        {newCustomField.fieldType === 'select' && (
          <div className="form-group">
            <label htmlFor="cf-options">Options (comma-separated)</label>
            <input
              id="cf-options"
              type="text"
              value={newCustomField.options}
              onChange={(e) => setNewCustomField({ ...newCustomField, options: e.target.value })}
              placeholder="e.g. Small, Medium, Large"
            />
          </div>
        )}
        <div className="form-group">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={newCustomField.required}
              onChange={(e) => setNewCustomField({ ...newCustomField, required: e.target.checked })}
              className="w-auto"
            />
            Required
          </label>
        </div>
        <button type="submit" className="btn btn-primary">
          Add Field
        </button>
      </form>
    </div>
  );
}
