import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, RELIGION_KEYS, type ReligionKey, type TimeOffHoliday, type TimeOffHolidayKind, type TimeOffSettings } from '../api';
import { useToast } from '../components/common/ToastProvider';
import Modal from '../components/common/Modal';
import TableBody from '../components/common/TableBody';
import TableSkeleton from '../components/common/TableSkeleton';
import RequiredMark from '../components/common/RequiredMark';
import { CalendarIcon, TrashIcon } from '../components/common/Icons';
import { useDateRangeFormatter } from '../components/timeOff/timeOffShared';

interface TimeOffSettingsPageProps {
  token: string;
}

// Monday-first, the way people read a work week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type AddDayTarget = { kind: TimeOffHolidayKind; religion?: ReligionKey } | null;

// Settings → Time Off (2026-10): the company's holiday calendar, work week, day counting,
// religious holidays (and who they apply to) and company days off. Every change saves on the spot.
export default function TimeOffSettingsPage({ token }: TimeOffSettingsPageProps) {
  const { t } = useTranslation('tasks');
  const toast = useToast();
  const dates = useDateRangeFormatter();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [settings, setSettings] = useState<TimeOffSettings | null>(null);
  const [countries, setCountries] = useState<{ countryCode: string; name: string }[]>([]);
  const [holidays, setHolidays] = useState<TimeOffHoliday[] | null>(null);
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [assignments, setAssignments] = useState<{ employeeId: string; religion: ReligionKey }[]>([]);
  const [importing, setImporting] = useState(false);
  const [addTarget, setAddTarget] = useState<AddDayTarget>(null);
  const [newDay, setNewDay] = useState({ date: '', name: '' });

  const fail = (error: unknown) => toast.error(t('timeOff.rules.settings.saveFailed', { message: (error as Error).message }));

  useEffect(() => {
    Promise.all([api.getTimeOffSettings(token), api.listEmployees(token), api.listReligionAssignments(token)])
      .then(([s, emps, rel]) => {
        setSettings(s);
        setEmployees(emps.map((e: any) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName })));
        setAssignments(rel);
      })
      .catch(fail);
    api.listHolidayCountries(token).then(setCountries).catch(() => setCountries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadHolidays = () => {
    setHolidays(null);
    api.listTimeOffHolidays(token, year).then(setHolidays).catch(fail);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadHolidays, [token, year]);

  const save = async (patch: Partial<TimeOffSettings>) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...patch });
    try {
      setSettings(await api.updateTimeOffSettings(token, patch));
      // Enabling a religion seeds its dates server-side — refresh the list so they show up.
      if (patch.enabledReligions) loadHolidays();
    } catch (error) {
      setSettings(previous);
      fail(error);
    }
  };

  const importHolidays = async () => {
    setImporting(true);
    try {
      const { imported } = await api.importTimeOffHolidays(token, year);
      toast.success(t('timeOff.rules.settings.imported', { count: imported }));
      loadHolidays();
    } catch (error) {
      fail(error);
    } finally {
      setImporting(false);
    }
  };

  const removeHoliday = async (id: string) => {
    setHolidays((prev) => prev?.filter((h) => h.id !== id) ?? prev);
    try {
      await api.deleteTimeOffHoliday(token, id);
    } catch (error) {
      fail(error);
      loadHolidays();
    }
  };

  const toggleOff = async (h: TimeOffHoliday) => {
    setHolidays((prev) => prev?.map((x) => (x.id === h.id ? { ...x, isOff: !h.isOff } : x)) ?? prev);
    try {
      await api.updateTimeOffHoliday(token, h.id, { isOff: !h.isOff });
    } catch (error) {
      fail(error);
      loadHolidays();
    }
  };

  const openAdd = (target: AddDayTarget) => {
    setNewDay({ date: '', name: '' });
    setAddTarget(target);
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTarget || !newDay.date || !newDay.name.trim()) return;
    try {
      await api.createTimeOffHoliday(token, { date: newDay.date, name: newDay.name.trim(), kind: addTarget.kind, religion: addTarget.religion });
      setAddTarget(null);
      if (Number(newDay.date.slice(0, 4)) !== year) setYear(Number(newDay.date.slice(0, 4)));
      else loadHolidays();
    } catch (error) {
      fail(error);
    }
  };

  const toggleReligionFor = async (employeeId: string, religion: ReligionKey) => {
    const current = assignments.filter((a) => a.employeeId === employeeId).map((a) => a.religion);
    const next = current.includes(religion) ? current.filter((r) => r !== religion) : [...current, religion];
    const previous = assignments;
    setAssignments([...assignments.filter((a) => a.employeeId !== employeeId), ...next.map((r) => ({ employeeId, religion: r }))]);
    try {
      await api.setEmployeeReligions(token, employeeId, next);
    } catch (error) {
      setAssignments(previous);
      fail(error);
    }
  };

  const calendarDays = useMemo(
    () => (holidays ?? []).filter((h) => (h.kind === 'national' || h.kind === 'non_working') && h.countryCode === settings?.holidayCountry),
    [holidays, settings?.holidayCountry],
  );
  const companyDays = (holidays ?? []).filter((h) => h.kind === 'company');
  const religiousDays = (religion: ReligionKey) => (holidays ?? []).filter((h) => h.kind === 'religious' && h.religion === religion);
  const religionName = (r: ReligionKey) => t(`timeOff.rules.religions.${r}`);

  if (!settings) return <TableSkeleton />;

  const enabled = settings.enabledReligions;
  const deleteButton = (h: TimeOffHoliday) => (
    <button type="button" className="icon-btn" onClick={() => removeHoliday(h.id)} aria-label={t('timeOff.rules.settings.removeAria', { name: h.name })}>
      <TrashIcon />
    </button>
  );

  return (
    <div className="rules-page">
      <div>
        <h2 className="to-title">{t('timeOff.rules.settings.title')}</h2>
        <p className="to-subtitle">{t('timeOff.rules.settings.subtitle')}</p>
      </div>

      <section className="card rules-card">
        <h3 className="card-title">{t('timeOff.rules.settings.calendarTitle')}</h3>
        <p className="rules-lead">{t('timeOff.rules.settings.calendarLead')}</p>
        <div className="rules-row">
          <div className="form-group !mb-0">
            <label htmlFor="rules-calendar">{t('timeOff.rules.settings.calendar')}</label>
            <select
              id="rules-calendar"
              value={settings.holidayCountry ?? ''}
              onChange={(e) => save({ holidayCountry: e.target.value || null })}
            >
              <option value="">{t('timeOff.rules.settings.noCalendar')}</option>
              {settings.holidayCountry && !countries.some((c) => c.countryCode === settings.holidayCountry) && (
                <option value={settings.holidayCountry}>{settings.holidayCountry}</option>
              )}
              {countries.map((c) => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group !mb-0">
            <span className="rules-label">{t('timeOff.rules.settings.year')}</span>
            <div className="mini-toggle-row">
              {[thisYear, thisYear + 1].map((y) => (
                <button key={y} type="button" className={`mini-toggle-opt ${year === y ? 'active' : ''}`} onClick={() => setYear(y)}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn-secondary" disabled={!settings.holidayCountry || importing} onClick={importHolidays}>
            {importing ? t('timeOff.rules.settings.importing') : t('timeOff.rules.settings.import')}
          </button>
        </div>
        <p className="rules-hint">{t('timeOff.rules.settings.importHint')}</p>
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('timeOff.rules.settings.holidayDate')}</th>
                <th>{t('timeOff.rules.settings.holidayName')}</th>
                <th>{t('timeOff.rules.settings.holidayState')}</th>
                <th aria-label={t('timeOff.rules.settings.removeAria', { name: '' })} />
              </tr>
            </thead>
            <TableBody
              colSpan={4}
              isEmpty={holidays !== null && calendarDays.length === 0}
              empty={{ icon: <CalendarIcon />, title: t('timeOff.rules.settings.noHolidays', { year }), body: t('timeOff.rules.settings.noHolidaysHint') }}
              onAdd={settings.holidayCountry ? () => openAdd({ kind: 'national' }) : undefined}
              addLabel={t('timeOff.rules.settings.addHoliday')}
            >
              {calendarDays.map((h) => (
                <tr key={h.id}>
                  <td className="num">{dates.long(h.date)}</td>
                  <td>
                    {h.name} {h.kind === 'non_working' && <span className="to-chip to-chip-pending">{t('timeOff.rules.settings.nonWorking')}</span>}
                  </td>
                  <td>
                    {h.kind === 'non_working' ? (
                      <label className="rules-switch">
                        <input type="checkbox" checked={h.isOff} onChange={() => toggleOff(h)} />
                        {h.isOff ? t('timeOff.rules.settings.givenOff') : t('timeOff.rules.settings.worked')}
                      </label>
                    ) : (
                      <span className="rules-chip rules-chip-holiday">{t('timeOff.rules.settings.national')}</span>
                    )}
                  </td>
                  <td>{deleteButton(h)}</td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      </section>

      <div className="rules-grid">
        <section className="card rules-card">
          <h3 className="card-title">{t('timeOff.rules.settings.weekTitle')}</h3>
          <p className="rules-lead">{t('timeOff.rules.settings.weekLead')}</p>
          <div className="rules-days" role="group" aria-label={t('timeOff.rules.settings.weekTitle')}>
            {WEEK_ORDER.map((d) => {
              const on = settings.workWeek.includes(d);
              return (
                <label key={d} className={`rules-day ${on ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = on ? settings.workWeek.filter((x) => x !== d) : [...settings.workWeek, d];
                      if (next.length > 0) save({ workWeek: next });
                    }}
                  />
                  {(t('timeOff.rules.weekdaysShort', { returnObjects: true }) as string[])[d]}
                </label>
              );
            })}
          </div>
        </section>
        <section className="card rules-card">
          <h3 className="card-title">{t('timeOff.rules.settings.countTitle')}</h3>
          <p className="rules-lead">{t('timeOff.rules.settings.countLead')}</p>
          <div className="mini-toggle-row">
            <button type="button" className={`mini-toggle-opt ${settings.defaultDayCount === 'business' ? 'active' : ''}`} onClick={() => save({ defaultDayCount: 'business' })}>
              {t('timeOff.rules.settings.business')}
            </button>
            <button type="button" className={`mini-toggle-opt ${settings.defaultDayCount === 'calendar' ? 'active' : ''}`} onClick={() => save({ defaultDayCount: 'calendar' })}>
              {t('timeOff.rules.settings.calendarDays')}
            </button>
          </div>
          <p className="rules-hint">{settings.defaultDayCount === 'business' ? t('timeOff.rules.settings.businessHint') : t('timeOff.rules.settings.calendarHint')}</p>
        </section>
      </div>

      <section className="card rules-card">
        <h3 className="card-title">{t('timeOff.rules.settings.religiousTitle')}</h3>
        <p className="rules-lead">{t('timeOff.rules.settings.religiousLead')}</p>
        <div className="rules-faiths">
          {RELIGION_KEYS.map((r) => {
            const on = enabled.includes(r);
            return (
              <div key={r} className={`rules-faith ${on ? '' : 'off'}`}>
                <div className="rules-faith-head">
                  <b>{religionName(r)}</b>
                  <label className="rules-switch">
                    <input type="checkbox" checked={on} onChange={() => save({ enabledReligions: on ? enabled.filter((x) => x !== r) : [...enabled, r] })} />
                    {on ? t('timeOff.rules.settings.enabled') : t('timeOff.rules.settings.notEnabled')}
                  </label>
                </div>
                {on && (
                  <>
                    <div className="rules-chips">
                      {religiousDays(r).map((h) => (
                        <span key={h.id} className="rules-chip rules-chip-religious" title={h.name}>
                          {dates.day(h.date)} · {h.name}
                          <button type="button" onClick={() => removeHoliday(h.id)} aria-label={t('timeOff.rules.settings.removeAria', { name: h.name })}>
                            ×
                          </button>
                        </span>
                      ))}
                      <button type="button" className="btn-secondary btn-sm" onClick={() => openAdd({ kind: 'religious', religion: r })}>
                        + {t('timeOff.rules.settings.addDate')}
                      </button>
                    </div>
                    <p className="rules-hint">{t('timeOff.rules.settings.religiousDatesHint', { year })}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <h4 className="rules-subtitle">{t('timeOff.rules.settings.whoTitle')}</h4>
        {enabled.length === 0 ? (
          <p className="rules-hint">{t('timeOff.rules.settings.noneEnabled')}</p>
        ) : (
          <div className="full-table-wrap">
            <table className="table full-table !mt-0 to-table">
              <thead>
                <tr>
                  <th>{t('timeOff.rules.settings.person')}</th>
                  <th>{t('timeOff.rules.settings.appliesTo')}</th>
                </tr>
              </thead>
              <TableBody colSpan={2} isEmpty={employees.length === 0} empty={{ title: t('timeOff.team.noPeople') }}>
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.firstName} {e.lastName}
                    </td>
                    <td>
                      <div className="rules-chips">
                        {enabled.map((r) => {
                          const has = assignments.some((a) => a.employeeId === e.id && a.religion === r);
                          return (
                            <label key={r} className={`rules-pick ${has ? 'on' : ''}`}>
                              <input type="checkbox" checked={has} onChange={() => toggleReligionFor(e.id, r)} />
                              {religionName(r)}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </table>
          </div>
        )}
        <p className="rules-note">{t('timeOff.rules.settings.sensitive')}</p>
      </section>

      <section className="card rules-card">
        <h3 className="card-title">{t('timeOff.rules.settings.companyDaysTitle')}</h3>
        <p className="rules-lead">{t('timeOff.rules.settings.companyDaysLead')}</p>
        <div className="full-table-wrap">
          <table className="table full-table !mt-0 to-table">
            <thead>
              <tr>
                <th>{t('timeOff.rules.settings.holidayDate')}</th>
                <th>{t('timeOff.rules.settings.reason')}</th>
                <th>{t('timeOff.rules.settings.holidayState')}</th>
                <th aria-label={t('timeOff.rules.settings.removeAria', { name: '' })} />
              </tr>
            </thead>
            <TableBody
              colSpan={4}
              isEmpty={holidays !== null && companyDays.length === 0}
              empty={{ icon: <CalendarIcon />, title: t('timeOff.rules.settings.noCompanyDays') }}
              onAdd={() => openAdd({ kind: 'company' })}
              addLabel={t('timeOff.rules.settings.addCompanyDay')}
            >
              {companyDays.map((h) => (
                <tr key={h.id}>
                  <td className="num">{dates.long(h.date)}</td>
                  <td>{h.name}</td>
                  <td>
                    <span className="rules-chip rules-chip-company">{t('timeOff.rules.settings.appliesToAll')}</span>
                  </td>
                  <td>{deleteButton(h)}</td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      </section>

      <Modal
        open={addTarget !== null}
        title={
          addTarget?.kind === 'company'
            ? t('timeOff.rules.settings.addCompanyDay')
            : addTarget?.kind === 'religious' && addTarget.religion
              ? `${t('timeOff.rules.settings.addDate')} · ${religionName(addTarget.religion)}`
              : t('timeOff.rules.settings.addHoliday')
        }
        onClose={() => setAddTarget(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAddTarget(null)}>
              {t('timeOff.rules.settings.cancel')}
            </button>
            <button type="submit" form="rules-add-day" className="btn-primary" disabled={!newDay.date || !newDay.name.trim()}>
              {t('timeOff.rules.settings.add')}
            </button>
          </>
        }
      >
        <form id="rules-add-day" onSubmit={submitAdd}>
          <div className="form-group">
            <label htmlFor="rules-day-date">
              {t('timeOff.rules.settings.holidayDate')}
              <RequiredMark />
            </label>
            <input id="rules-day-date" type="date" value={newDay.date} onChange={(e) => setNewDay({ ...newDay, date: e.target.value })} required />
          </div>
          <div className="form-group !mb-0">
            <label htmlFor="rules-day-name">
              {addTarget?.kind === 'company' ? t('timeOff.rules.settings.reason') : t('timeOff.rules.settings.holidayName')}
              <RequiredMark />
            </label>
            <input
              id="rules-day-name"
              type="text"
              maxLength={120}
              value={newDay.name}
              onChange={(e) => setNewDay({ ...newDay, name: e.target.value })}
              placeholder={t('timeOff.rules.settings.namePlaceholder')}
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
