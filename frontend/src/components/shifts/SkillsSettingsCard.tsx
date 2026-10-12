import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ShiftSkill } from '../../api';
import { usePermissions } from '../../contexts/PermissionsContext';
import Modal from '../common/Modal';
import TableBody from '../common/TableBody';
import { useToast } from '../common/ToastProvider';
import { PencilIcon, TrashIcon, UserCircleIcon } from '../common/Icons';
import { addDays, formatDay, todayString } from '../../lib/shiftDates';

interface SkillsSettingsCardProps {
  token: string;
}

// "Expiring soon" on the list: within this many days.
const EXPIRING_DAYS = 30;

type Employee = { id: string; firstName: string; lastName: string };

// Settings → Shifts → Skills (spec-shifts.md, Unidad 7, Growth): the catalog, and who holds each
// skill until when. Everything saves on the spot.
export default function SkillsSettingsCard({ token }: SkillsSettingsCardProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const { features } = usePermissions();
  const [skills, setSkills] = useState<ShiftSkill[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const [newHolder, setNewHolder] = useState({ employeeId: '', expiresAt: '' });
  const today = todayString();
  const soon = addDays(today, EXPIRING_DAYS);

  const fail = (error: unknown) => toast.error(t('settings.saveFailed', { message: (error as Error).message }));

  useEffect(() => {
    if (!features.shiftSkills) return;
    api
      .listShiftSkills(token, { includeInactive: true })
      .then((r) => setSkills(r.skills))
      .catch(fail);
    api
      .listEmployeeDirectory(token)
      .then((list) => setEmployees(list.map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName }))))
      .catch(() => setEmployees([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, features.shiftSkills]);

  const open = useMemo(() => skills?.find((s) => s.id === openId) ?? null, [skills, openId]);
  const replace = (updated: ShiftSkill) => setSkills((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? prev);

  if (!features.shiftSkills) {
    return (
      <section className="card rules-card">
        <h3 className="card-title">{t('settings.skills.title')}</h3>
        <p className="rules-lead">{t('settings.skills.lead')}</p>
        <p className="rules-note">{t('settings.skills.growthOnly')}</p>
      </section>
    );
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const created = await api.createShiftSkill(token, newName.trim());
      setSkills((prev) => [...(prev ?? []), created]);
      setCreating(false);
      setNewName('');
    } catch (error) {
      fail(error);
    }
  };

  const run = async (action: () => Promise<ShiftSkill>) => {
    try {
      replace(await action());
    } catch (error) {
      fail(error);
    }
  };

  const expiryLabel = (date: string | null) => {
    if (!date) return t('settings.skills.never');
    const text = formatDay(date, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
    return date < today ? `${text} · ${t('settings.skills.expired')}` : text;
  };

  return (
    <section className="card rules-card">
      <h3 className="card-title">{t('settings.skills.title')}</h3>
      <p className="rules-lead">{t('settings.skills.lead')}</p>
      <div className="full-table-wrap">
        <table className="table full-table !mt-0 to-table">
          <thead>
            <tr>
              <th>{t('settings.skills.name')}</th>
              <th>{t('settings.skills.holders')}</th>
              <th>{t('settings.skills.expiring')}</th>
              <th>{t('settings.locations.status')}</th>
              <th aria-label={t('settings.skills.rename')} />
            </tr>
          </thead>
          <TableBody
            colSpan={5}
            isEmpty={skills !== null && skills.length === 0}
            empty={{ icon: <UserCircleIcon />, title: t('settings.skills.emptyTitle'), body: t('settings.skills.emptyBody') }}
            onAdd={() => setCreating(true)}
            addLabel={t('settings.skills.add')}
          >
            {(skills ?? []).map((s) => {
              const expiring = s.holders.filter((h) => h.expiresAt !== null && h.expiresAt <= soon).length;
              return (
                <tr key={s.id} className={`to-row ${s.isActive ? '' : 'opacity-60'}`} onClick={() => { setOpenId(s.id); setRename(s.name); setNewHolder({ employeeId: '', expiresAt: '' }); }}>
                  <td className="font-medium">{s.name}</td>
                  <td>{t('settings.skills.count', { count: s.holders.length })}</td>
                  <td>{expiring > 0 ? <span className="to-chip to-chip-pending">{expiring}</span> : <span className="text-ink-faint dark:text-dark-ink-faint">—</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <label className="rules-switch">
                      <input type="checkbox" checked={s.isActive} onChange={() => run(() => api.updateShiftSkill(token, s.id, { isActive: !s.isActive }))} />
                      {s.isActive ? t('settings.skills.active') : t('settings.skills.inactive')}
                    </label>
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <span className="icon-btn" aria-hidden="true">
                        <PencilIcon />
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </TableBody>
        </table>
      </div>

      <Modal
        open={creating}
        title={t('settings.skills.add')}
        onClose={() => setCreating(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>
              {t('settings.skills.cancel')}
            </button>
            <button type="submit" form="skill-create-form" className="btn-primary" disabled={!newName.trim()}>
              {t('settings.skills.add')}
            </button>
          </>
        }
      >
        <form id="skill-create-form" onSubmit={create}>
          <div className="form-group">
            <label htmlFor="skill-name">{t('settings.skills.name')}</label>
            <input id="skill-name" value={newName} maxLength={80} placeholder={t('settings.skills.namePlaceholder')} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </div>
        </form>
      </Modal>

      <Modal
        open={open !== null}
        title={open ? t('settings.skills.holdersTitle', { name: open.name }) : ''}
        onClose={() => setOpenId(null)}
        wide
        footer={
          <button type="button" className="btn-secondary" onClick={() => setOpenId(null)}>
            {t('settings.skills.close')}
          </button>
        }
      >
        {open && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="form-group !mb-0 min-w-[14rem] flex-1">
                <label htmlFor="skill-rename">{t('settings.skills.name')}</label>
                <input id="skill-rename" value={rename} maxLength={80} onChange={(e) => setRename(e.target.value)} />
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={!rename.trim() || rename.trim() === open.name}
                onClick={() => run(() => api.updateShiftSkill(token, open.id, { name: rename.trim() }))}
              >
                {t('settings.skills.rename')}
              </button>
            </div>

            <div className="full-table-wrap">
              <table className="table full-table !mt-0 to-table">
                <thead>
                  <tr>
                    <th>{t('settings.skills.person')}</th>
                    <th>{t('settings.skills.expires')}</th>
                    <th aria-label={t('settings.skills.removeAria', { name: '' })} />
                  </tr>
                </thead>
                <tbody>
                  {open.holders.map((h) => (
                    <tr key={h.employeeId}>
                      <td>
                        {h.firstName} {h.lastName}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            id={`skill-expiry-${h.employeeId}`}
                            type="date"
                            aria-label={t('settings.skills.expires')}
                            value={h.expiresAt ?? ''}
                            onChange={(e) => run(() => api.setShiftSkillHolder(token, open.id, h.employeeId, e.target.value || null))}
                          />
                          <span className={`text-xs ${h.expiresAt && h.expiresAt < today ? 'text-red-600 dark:text-red-300' : 'text-ink-faint dark:text-dark-ink-faint'}`}>
                            {expiryLabel(h.expiresAt)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={t('settings.skills.removeAria', { name: `${h.firstName} ${h.lastName}` })}
                            onClick={() => run(() => api.removeShiftSkillHolder(token, open.id, h.employeeId))}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3 dark:border-dark-line">
              <div className="form-group !mb-0 min-w-[14rem] flex-1">
                <label htmlFor="skill-new-holder">{t('settings.skills.person')}</label>
                <select id="skill-new-holder" value={newHolder.employeeId} onChange={(e) => setNewHolder({ ...newHolder, employeeId: e.target.value })}>
                  <option value="">{t('settings.skills.pickPerson')}</option>
                  {employees
                    .filter((e) => !open.holders.some((h) => h.employeeId === e.id))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group !mb-0">
                <label htmlFor="skill-new-expiry">{t('settings.skills.expires')}</label>
                <input id="skill-new-expiry" type="date" value={newHolder.expiresAt} onChange={(e) => setNewHolder({ ...newHolder, expiresAt: e.target.value })} />
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={!newHolder.employeeId}
                onClick={async () => {
                  await run(() => api.setShiftSkillHolder(token, open.id, newHolder.employeeId, newHolder.expiresAt || null));
                  setNewHolder({ employeeId: '', expiresAt: '' });
                }}
              >
                {t('settings.skills.addHolder')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
