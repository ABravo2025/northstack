import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Shift, type ShiftLocation, type ShiftTemplate } from '../../api';
import Modal from '../common/Modal';
import RequiredMark from '../common/RequiredMark';
import { useToast } from '../common/ToastProvider';
import { formatDuration, formatMinute, parseTimeInput, shiftDurationMinutes } from '../../lib/shiftDates';

interface ShiftFormModalProps {
  token: string;
  open: boolean;
  // null = new shift, prefilled from `defaults`.
  shift: Shift | null;
  defaults: { locationId: string; date: string };
  locations: ShiftLocation[];
  onClose: () => void;
  onSaved: (shift: Shift) => void;
}

interface FormState {
  locationId: string;
  date: string;
  start: string;
  end: string;
  position: string;
  headcount: string;
  notes: string;
}

const MAX_HEADCOUNT = 100;

export default function ShiftFormModal({ token, open, shift, defaults, locations, onClose, onSaved }: ShiftFormModalProps) {
  const { t } = useTranslation('shifts');
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => blankForm());
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState<string | null>(null);

  function blankForm(): FormState {
    return { locationId: defaults.locationId, date: defaults.date, start: '08:00', end: '16:00', position: '', headcount: '1', notes: '' };
  }

  useEffect(() => {
    if (!open) return;
    setTemplateName(null);
    setForm(
      shift
        ? {
            locationId: shift.locationId,
            date: shift.date,
            start: formatMinute(shift.startMinute),
            end: formatMinute(shift.endMinute),
            position: shift.position ?? '',
            headcount: String(shift.headcount),
            notes: shift.notes ?? '',
          }
        : blankForm(),
    );
    api.listShiftTemplates(token).then(setTemplates).catch(() => setTemplates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shift, defaults.locationId, defaults.date, token]);

  const startMinute = parseTimeInput(form.start);
  const endMinute = parseTimeInput(form.end);
  const headcount = Number(form.headcount);
  const valid =
    !!form.locationId && !!form.date && startMinute !== null && endMinute !== null && Number.isInteger(headcount) && headcount >= 1 && headcount <= MAX_HEADCOUNT;
  const overnight = startMinute !== null && endMinute !== null && endMinute <= startMinute;
  const usableTemplates = templates.filter((tpl) => !tpl.locationId || tpl.locationId === form.locationId);
  // Only active locations take new shifts; an existing shift keeps showing its own location.
  const locationOptions = locations.filter((l) => l.isActive || l.id === shift?.locationId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const data = {
      locationId: form.locationId,
      date: form.date,
      startMinute: startMinute!,
      endMinute: endMinute!,
      position: form.position.trim() || null,
      headcount,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      const saved = shift ? await api.updateShift(token, shift.id, data) : await api.createShift(token, data);
      onSaved(saved);
    } catch (error) {
      toast.error(t('form.saveFailed', { message: (error as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const saveTemplate = async () => {
    if (!templateName?.trim() || startMinute === null || endMinute === null) return;
    try {
      const created = await api.createShiftTemplate(token, { name: templateName.trim(), startMinute, endMinute, position: form.position.trim() || null });
      setTemplates((prev) => [...prev, created]);
      setTemplateName(null);
      toast.success(t('form.templateSaved'));
    } catch (error) {
      toast.error(t('form.saveFailed', { message: (error as Error).message }));
    }
  };

  return (
    <Modal
      open={open}
      title={shift ? t('form.editTitle') : t('form.newTitle')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button type="submit" form="shift-form" className="btn-primary" disabled={!valid || saving}>
            {shift ? t('form.save') : t('form.create')}
          </button>
        </>
      }
    >
      <form id="shift-form" onSubmit={submit}>
        {usableTemplates.length > 0 && (
          <div className="form-group">
            <span className="rules-label">{t('form.templates')}</span>
            <div className="sh-templates">
              {usableTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="sh-template-chip"
                  onClick={() =>
                    setForm((f) => ({ ...f, start: formatMinute(tpl.startMinute), end: formatMinute(tpl.endMinute), position: tpl.position ?? f.position }))
                  }
                >
                  {tpl.name} · {formatMinute(tpl.startMinute)}–{formatMinute(tpl.endMinute)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="form-group">
            <label htmlFor="shift-location">
              {t('form.location')}
              <RequiredMark />
            </label>
            <select id="shift-location" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="shift-date">
              {t('form.date')}
              <RequiredMark />
            </label>
            <input id="shift-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="shift-start">
              {t('form.start')}
              <RequiredMark />
            </label>
            <input id="shift-start" type="time" step={300} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="shift-end">
              {t('form.end')}
              <RequiredMark />
            </label>
            <input id="shift-end" type="time" step={300} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
        </div>
        {startMinute !== null && endMinute !== null && (
          <p className="rules-hint -mt-2 mb-3">
            {t('form.duration', { duration: formatDuration(shiftDurationMinutes(startMinute, endMinute)) })}
            {overnight && ` · ${t('form.endsNextDay')}`}
            {templateName === null ? (
              <>
                {' · '}
                <button type="button" className="to-link text-xs" onClick={() => setTemplateName('')}>
                  {t('form.saveTemplate')}
                </button>
              </>
            ) : null}
          </p>
        )}
        {templateName !== null && (
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="form-group !mb-0 flex-1">
              <label htmlFor="shift-template-name">{t('form.templateName')}</label>
              <input id="shift-template-name" value={templateName} maxLength={80} onChange={(e) => setTemplateName(e.target.value)} autoFocus />
            </div>
            <button type="button" className="btn-secondary" disabled={!templateName.trim()} onClick={saveTemplate}>
              {t('form.save')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setTemplateName(null)}>
              {t('form.cancel')}
            </button>
          </div>
        )}
        <div className="grid gap-x-4 sm:grid-cols-[1fr_9rem]">
          <div className="form-group">
            <label htmlFor="shift-position">{t('form.position')}</label>
            <input id="shift-position" value={form.position} maxLength={120} placeholder={t('form.positionPlaceholder')} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="shift-headcount">{t('form.headcount')}</label>
            <input id="shift-headcount" type="number" min={1} max={MAX_HEADCOUNT} value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="shift-notes">{t('form.notes')}</label>
          <textarea id="shift-notes" rows={3} maxLength={1000} value={form.notes} placeholder={t('form.notesPlaceholder')} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {shift?.status === 'published' && shift.assignments.length > 0 && <p className="sh-note-box">{t('form.reconfirmWarning')}</p>}
      </form>
    </Modal>
  );
}
