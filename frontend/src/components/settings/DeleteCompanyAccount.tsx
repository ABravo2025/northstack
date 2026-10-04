import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL, ApiError, apiFetch, throwApiError } from '../../api/http';
import PasswordInput from '../common/PasswordInput';
import Modal from '../common/Modal';
import { usePermissions } from '../../contexts/PermissionsContext';

// Settings → Company, owner only (2026-10-04): delete the company account. Nobody can sign in from
// that moment; everything is erased 10 days later. Asks for the company name and the password.
export default function DeleteCompanyAccount({ token, companyName }: { token: string; companyName: string }) {
  const { t } = useTranslation('settingsPages');
  const { isOwner } = usePermissions();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneOn, setDoneOn] = useState<string | null>(null);

  if (!isOwner) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/tenants/me/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmName: name, password }),
      });
      if (!res.ok) await throwApiError(res);
      const body = await res.json();
      setDoneOn(new Date(body.deleteOn).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }));
    } catch (err) {
      const field = err instanceof ApiError ? err.field : undefined;
      setError(field === 'password' ? t('company.deleteAccount.wrongPassword') : field === 'confirmName' ? t('company.deleteAccount.wrongName') : field === 'subscription' ? t('company.deleteAccount.cancelFirst') : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card border-rose-200 dark:border-rose-900">
      <h3 className="card-title text-rose-700 dark:text-rose-300">{t('company.deleteAccount.title')}</h3>
      <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t('company.deleteAccount.help')}</p>
      <div>
        <button type="button" className="btn-danger" onClick={() => setOpen(true)}>{t('company.deleteAccount.button')}</button>
      </div>
      {open && (
        <Modal
          open
          title={t('company.deleteAccount.title')}
          onClose={() => (doneOn ? window.location.assign('/login') : setOpen(false))}
          footer={
            doneOn ? (
              <button type="button" className="btn-primary" onClick={() => window.location.assign('/login')}>{t('company.deleteAccount.close')}</button>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t('company.deleteAccount.cancel')}</button>
                <button type="submit" form="delete-account-form" className="btn-danger" disabled={busy || name.trim() !== companyName.trim() || !password}>
                  {busy ? t('company.deleteAccount.deleting') : t('company.deleteAccount.confirm')}
                </button>
              </>
            )
          }
        >
          {doneOn ? (
            <p className="text-sm">{t('company.deleteAccount.done', { date: doneOn })}</p>
          ) : (
            <form id="delete-account-form" onSubmit={submit} className="grid gap-3">
              <p className="m-0 text-sm text-ink-muted dark:text-dark-ink-muted">{t('company.deleteAccount.warning')}</p>
              <label className="grid gap-1 text-sm font-medium" htmlFor="delete-account-name">
                {t('company.deleteAccount.typeName', { name: companyName })}
                <input id="delete-account-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm font-medium" htmlFor="delete-account-password">
                {t('company.deleteAccount.password')}
                <PasswordInput id="delete-account-password" autoComplete="current-password" value={password} onChange={setPassword} />
              </label>
              {error && <p className="m-0 text-sm text-rose-600">{error}</p>}
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
