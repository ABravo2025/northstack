import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ShiftLocation, type ShiftsSettings } from '../api';
import type { ShiftLocationInput } from '../api/shifts';
import { useToast } from '../components/common/ToastProvider';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import TableBody from '../components/common/TableBody';
import TableSkeleton from '../components/common/TableSkeleton';
import RequiredMark from '../components/common/RequiredMark';
import { BuildingIcon, PencilIcon, TrashIcon } from '../components/common/Icons';

interface ShiftsSettingsPageProps {
  token: string;
}

type EmployeeOption = { id: string; firstName: string; lastName: string };
type LocationForm = { name: string; address: string; timezone: string; managerEmployeeId: string };

// The viewer's own zone is the most likely answer for a new location.
const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Every IANA zone the browser knows. Older engines without supportedValuesOf get a short list
// that still always contains the browser's own zone.
function timeZoneOptions(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : ['UTC', 'America/Argentina/Buenos_Aires', 'America/New_York'];
  return zones.includes(BROWSER_TIME_ZONE) ? zones : [BROWSER_TIME_ZONE, ...zones];
}

// Monday-first, the way people read a work week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const REST_PRESETS = [8, 10, 11, 12];

// Settings → Shifts (spec-shifts.md, Unidad 2): locations, confirmations and scheduling rules.
// Toggles save on the spot, like Settings → Time Off; locations go through a modal.
export default function ShiftsSettingsPage({ token }: ShiftsSettingsPageProps) {
  const { t } = useTranslation('shifts');
  const toast = useToast();
  const [settings, setSettings] = useState<ShiftsSettings | null>(null);
  const [locations, setLocations] = useState<ShiftLocation[] | null>(null);
  const [maxActive, setMaxActive] = useState<number | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [editing, setEditing] = useState<ShiftLocation | 'new' | null>(null);
  const [form, setForm] = useState<LocationForm>({ name: '', address: '', timezone: BROWSER_TIME_ZONE, managerEmployeeId: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ShiftLocation | null>(null);
  const zones = useMemo(timeZoneOptions, []);
  const weekdays = t('settings.weekdays', { returnObjects: true }) as string[];

  const fail = (error: unknown) => toast.error(t('settings.saveFailed', { message: (error as Error).message }));

  const loadLocations = () =>
    api
      .listShiftLocations(token, { includeInactive: true })
      .then((r) => {
        setLocations(r.locations);
        setMaxActive(r.maxActiveLocations);
      })
      .catch(fail);

  useEffect(() => {
    api.getShiftsSettings(token).then(setSettings).catch(fail);
    loadLocations();
    api
      .listEmployees(token)
      .then((emps) => setEmployees(emps.map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName }))))
      .catch(() => setEmployees([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const save = async (patch: Partial<ShiftsSettings>) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...patch });
    try {
      setSettings(await api.updateShiftsSettings(token, patch));
    } catch (error) {
      setSettings(previous);
      fail(error);
    }
  };

  const activeCount = (locations ?? []).filter((l) => l.isActive).length;
  const atLimit = maxActive !== null && activeCount >= maxActive;

  const openNew = () => {
    setForm({ name: '', address: '', timezone: BROWSER_TIME_ZONE, managerEmployeeId: '' });
    setEditing('new');
  };

  const openEdit = (location: ShiftLocation) => {
    setForm({
      name: location.name,
      address: location.address ?? '',
      timezone: location.timezone,
      managerEmployeeId: location.managerEmployeeId ?? '',
    });
    setEditing(location);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !form.name.trim()) return;
    const data: ShiftLocationInput = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      timezone: form.timezone,
      managerEmployeeId: form.managerEmployeeId || null,
    };
    setSaving(true);
    try {
      if (editing === 'new') await api.createShiftLocation(token, data);
      else await api.updateShiftLocation(token, editing.id, data);
      setEditing(null);
      loadLocations();
    } catch (error) {
      fail(error);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (location: ShiftLocation) => {
    try {
      await api.updateShiftLocation(token, location.id, { isActive: !location.isActive });
      loadLocations();
    } catch (error) {
      fail(error);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      await api.deleteShiftLocation(token, target.id);
      toast.success(t('settings.locations.deleted'));
      loadLocations();
    } catch (error) {
      fail(error);
    }
  };

  if (!settings || !locations) return <TableSkeleton />;

  const editingHasShifts = editing !== null && editing !== 'new' && (editing._count?.shifts ?? 0) > 0;

  return (
    <div className="rules-page">
      <div>
        <h2 className="to-title">{t('settings.title')}</h2>
        <p className="to-subtitle">{t('settings.subtitle')}</p>
      </div>

      <section className="card rules-card">
        <h3 className="card-title">{t('settings.locations.title')}</h3>
        <p className="rules-lead">{t('settings.locations.lead')}</p>
        {maxActive !== null && (
          <p className="rules-hint">{atLimit ? t('settings.locations.planLimitReached') : t('settings.locations.planLimit', { count: maxActive })}</p>
        )}
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('settings.locations.name')}</th>
                <th>{t('settings.locations.timezone')}</th>
                <th>{t('settings.locations.manager')}</th>
                <th>{t('settings.locations.status')}</th>
                <th aria-label={t('settings.locations.actionsAria', { name: '' })} />
              </tr>
            </thead>
            <TableBody
              colSpan={5}
              isEmpty={locations.length === 0}
              empty={{ icon: <BuildingIcon />, title: t('settings.locations.emptyTitle'), body: t('settings.locations.emptyBody') }}
              onAdd={atLimit ? undefined : openNew}
              addLabel={t('settings.locations.add')}
            >
              {locations.map((l) => (
                <tr key={l.id} className={l.isActive ? '' : 'opacity-60'}>
                  <td>
                    <div className="font-medium">{l.name}</div>
                    {l.address && <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{l.address}</div>}
                  </td>
                  <td>{l.timezone.replace(/_/g, ' ')}</td>
                  <td>{l.managerEmployee ? `${l.managerEmployee.firstName} ${l.managerEmployee.lastName}` : <span className="text-ink-faint dark:text-dark-ink-faint">{t('settings.locations.noManager')}</span>}</td>
                  <td>
                    <label className="rules-switch">
                      <input
                        type="checkbox"
                        checked={l.isActive}
                        disabled={!l.isActive && atLimit}
                        onChange={() => toggleActive(l)}
                        aria-label={l.isActive ? t('settings.locations.deactivate') : t('settings.locations.activate')}
                      />
                      {l.isActive ? t('settings.locations.active') : t('settings.locations.inactive')}
                    </label>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" className="icon-btn" onClick={() => openEdit(l)} aria-label={`${t('settings.locations.edit')} · ${l.name}`}>
                        <PencilIcon />
                      </button>
                      {(l._count?.shifts ?? 0) === 0 && (
                        <button type="button" className="icon-btn" onClick={() => setDeleting(l)} aria-label={`${t('settings.locations.delete')} · ${l.name}`}>
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      </section>

      <div className="rules-grid">
        <section className="card rules-card">
          <h3 className="card-title">{t('settings.confirm.title')}</h3>
          <p className="rules-lead">{t('settings.confirm.lead')}</p>
          <label className="rules-switch">
            <input type="checkbox" checked={settings.requireConfirmation} onChange={() => save({ requireConfirmation: !settings.requireConfirmation })} />
            {t('settings.confirm.require')}
          </label>
          {!settings.requireConfirmation && <p className="rules-hint">{t('settings.confirm.requireHint')}</p>}
          {settings.requireConfirmation && (
            <label className="rules-switch">
              <input type="checkbox" checked={settings.remindUnanswered} onChange={() => save({ remindUnanswered: !settings.remindUnanswered })} />
              {t('settings.confirm.remindUnanswered')}
            </label>
          )}
          <label className="rules-switch">
            <input type="checkbox" checked={settings.remindDayBefore} onChange={() => save({ remindDayBefore: !settings.remindDayBefore })} />
            {t('settings.confirm.remindDayBefore')}
          </label>
          <p className="rules-hint">{t('settings.confirm.dailyHint')}</p>
        </section>

        <section className="card rules-card">
          <h3 className="card-title">{t('settings.rules.title')}</h3>
          <p className="rules-lead">{t('settings.rules.lead')}</p>
          <div className="form-group !mb-0">
            <span className="rules-label">{t('settings.rules.minRest')}</span>
            <div className="mini-toggle-row">
              <button type="button" className={`mini-toggle-opt ${settings.minRestHours === null ? 'active' : ''}`} onClick={() => save({ minRestHours: null })}>
                {t('settings.rules.minRestOff')}
              </button>
              {REST_PRESETS.map((h) => (
                <button key={h} type="button" className={`mini-toggle-opt ${settings.minRestHours === h ? 'active' : ''}`} onClick={() => save({ minRestHours: h })}>
                  {h} {t('settings.rules.hours')}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group !mb-0">
            <label htmlFor="shifts-week-start">{t('settings.rules.weekStart')}</label>
            <select id="shifts-week-start" className="max-w-xs" value={settings.weekStartsOn} onChange={(e) => save({ weekStartsOn: Number(e.target.value) })}>
              {WEEK_ORDER.map((d) => (
                <option key={d} value={d}>
                  {weekdays[d]}
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>

      <Modal
        open={editing !== null}
        title={editing === 'new' ? t('settings.locations.add') : t('settings.locations.edit')}
        onClose={() => setEditing(null)}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              {t('settings.locations.cancel')}
            </button>
            <button type="submit" form="shift-location-form" className="btn-primary" disabled={saving || !form.name.trim()}>
              {editing === 'new' ? t('settings.locations.add') : t('settings.locations.save')}
            </button>
          </>
        }
      >
        <form id="shift-location-form" onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="shift-location-name">
              {t('settings.locations.name')}
              <RequiredMark />
            </label>
            <input id="shift-location-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="shift-location-address">{t('settings.locations.address')}</label>
            <input id="shift-location-address" value={form.address} maxLength={300} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="shift-location-timezone">
              {t('settings.locations.timezone')}
              <RequiredMark />
            </label>
            <select
              id="shift-location-timezone"
              value={form.timezone}
              disabled={editingHasShifts}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            {editingHasShifts && <p className="rules-hint mt-1">{t('settings.locations.timezoneLocked')}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="shift-location-manager">{t('settings.locations.manager')}</label>
            <select id="shift-location-manager" value={form.managerEmployeeId} onChange={(e) => setForm({ ...form, managerEmployeeId: e.target.value })}>
              <option value="">{t('settings.locations.noManager')}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
            <p className="rules-hint mt-1">{t('settings.locations.managerHint')}</p>
          </div>
        </form>
      </Modal>

      {deleting && (
        <ConfirmDialog
          title={t('settings.locations.deleteTitle', { name: deleting.name })}
          message={t('settings.locations.deleteBody')}
          confirmLabel={t('settings.locations.delete')}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
