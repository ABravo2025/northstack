import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useToast } from './ToastProvider';
import { CheckIcon, XIcon } from './Icons';

interface OnboardingChecklistProps {
  token: string;
}

const DISMISSED_KEY = 'northstack:onboardingDismissed';

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  to: string;
}

export default function OnboardingChecklist({ token }: OnboardingChecklistProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<{
    hasEmployees: boolean;
    hasClients: boolean;
    hasInvitedTeammate: boolean;
    hasTimeOffPolicy: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const data = await api.getOnboardingStatus(token);
      setStatus(data);
    } catch {
      // Silently skip the checklist if this fails — it's a helper, not core functionality.
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  const handleLoadSampleData = async () => {
    setSeeding(true);
    try {
      const result = await api.seedSampleData(token);
      toast.success(`Added ${result.employees} sample employees and ${result.clients} sample clients.`);
      await loadStatus();
    } catch (error) {
      toast.error('Failed to load sample data: ' + (error as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  if (!status || dismissed) return null;

  const items: ChecklistItem[] = [
    { key: 'employees', label: 'Add your first employee', done: status.hasEmployees, to: '/hr/employees' },
    { key: 'clients', label: 'Add your first client', done: status.hasClients, to: '/clients' },
    { key: 'teammate', label: 'Invite a teammate', done: status.hasInvitedTeammate, to: '/settings/users' },
    { key: 'timeoff', label: 'Set up a Time Off policy', done: status.hasTimeOffPolicy, to: '/hr/time-off' },
  ];

  if (items.every((item) => item.done)) return null;

  return (
    <div className="card onboarding-checklist">
      <button type="button" className="onboarding-dismiss" onClick={handleDismiss} aria-label="Dismiss checklist">
        <XIcon className="h-4 w-4" />
      </button>
      <h3 className="card-title">Get started with Northstack</h3>
      <ul className="onboarding-list">
        {items.map((item) => (
          <li key={item.key} className={`onboarding-item ${item.done ? 'done' : ''}`}>
            <span className="onboarding-check">{item.done && <CheckIcon className="h-3 w-3" />}</span>
            {item.done ? (
              <span>{item.label}</span>
            ) : (
              <button type="button" className="onboarding-link" onClick={() => navigate(item.to)}>
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="onboarding-sample-row">
        <span className="onboarding-sample-hint">New here? Explore the app with sample data instead.</span>
        <button type="button" className="btn-secondary" onClick={handleLoadSampleData} disabled={seeding}>
          {seeding ? 'Loading…' : 'Load sample data'}
        </button>
      </div>
    </div>
  );
}
