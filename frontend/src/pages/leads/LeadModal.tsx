import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  api,
  type Company,
  type FieldCatalogDefinition,
  type Lead,
  type LeadInput,
  type Pipeline,
  type QualificationKey,
  type TouchChannel,
  type TouchOutcome,
} from '../../api';
import Modal from '../../components/common/Modal';
import RequiredMark from '../../components/common/RequiredMark';
import { useToast } from '../../components/common/ToastProvider';
import { parseAmountInput } from './leadMoney';

// Clientes C2: one lead — its data, the 4 qualification questions, the 5-touch cadence, and
// Convert / Disqualify. Also the "new lead" form (leadId = null).
const QUESTIONS: QualificationKey[] = ['need', 'budget', 'authority', 'timing'];
const CHANNELS: TouchChannel[] = ['call', 'email', 'whatsapp', 'linkedin', 'meeting', 'other'];
const OUTCOMES: TouchOutcome[] = ['no_answer', 'replied', 'meeting_booked', 'not_interested'];
const CADENCE_DAYS = [0, 2, 5, 9, 14];

interface Catalogs {
  users: { id: string; firstName: string; lastName: string }[];
  sources: FieldCatalogDefinition[];
}

export default function LeadModal({
  token,
  leadId,
  canManage,
  onClose,
  onChanged,
  onCreated,
}: {
  token: string;
  leadId: string | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  onCreated: (id: string) => void;
}) {
  const { t, i18n } = useTranslation('crm');
  const toast = useToast();
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadInput & { amount: string }>({ firstName: '', lastName: '', email: '', amount: '' });
  const [catalogs, setCatalogs] = useState<Catalogs>({ users: [], sources: [] });
  const [saving, setSaving] = useState(false);
  const [touch, setTouch] = useState<{ channel: TouchChannel; outcome: TouchOutcome; note: string }>({ channel: 'call', outcome: 'no_answer', note: '' });
  const [converting, setConverting] = useState(false);
  const [disqualifying, setDisqualifying] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    Promise.all([api.listUserDirectory(token).catch(() => []), api.listFieldCatalogDefinitions(token, 'leadSource').catch(() => [])]).then(([users, sources]) =>
      setCatalogs({ users, sources: sources.filter((s) => s.isActive) }),
    );
  }, [token]);

  const fill = (l: Lead) => {
    setLead(l);
    setForm({
      firstName: l.firstName,
      lastName: l.lastName,
      email: l.email,
      phone: l.phone,
      companyName: l.companyName,
      title: l.title,
      dealName: l.dealName,
      notes: l.notes,
      leadSourceId: l.leadSourceId,
      ownerId: l.ownerId,
      amount: l.estimatedAmountCents ? String(l.estimatedAmountCents / 100) : '',
    });
  };

  useEffect(() => {
    if (!leadId) return;
    api
      .getLead(token, leadId)
      .then(fill)
      .catch((e) => {
        toast.error((e as Error).message);
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, leadId]);

  const closed = lead?.status === 'converted' || lead?.status === 'disqualified';
  const editable = canManage && !closed;
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short' });

  const applied = (l: Lead) => {
    fill(l);
    onChanged();
  };

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    const { amount, ...rest } = form;
    const body: LeadInput = { ...rest, estimatedAmountCents: amount.trim() ? parseAmountInput(amount) : null };
    try {
      if (lead) {
        applied(await api.updateLead(token, lead.id, body));
        toast.success(t('leadsInbox.saved'));
      } else {
        const created = await api.createLead(token, body);
        toast.success(t('leadsInbox.created'));
        onCreated(created.id);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const answer = async (key: QualificationKey, value: boolean | null) => {
    if (!lead) return;
    try {
      applied(await api.updateLead(token, lead.id, { qualification: { ...lead.qualification, [key]: value } }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const logTouch = async () => {
    if (!lead) return;
    try {
      applied(await api.addLeadTouch(token, lead.id, { channel: touch.channel, outcome: touch.outcome, note: touch.note.trim() || undefined }));
      setTouch({ ...touch, note: '' });
      toast.success(t('leadsInbox.touchLogged'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const disqualify = async () => {
    if (!lead) return;
    try {
      applied(await api.disqualifyLead(token, lead.id, reason));
      setDisqualifying(false);
      toast.success(t('leadsInbox.disqualified'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const reopen = async () => {
    if (!lead) return;
    try {
      applied(await api.reopenLead(token, lead.id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const field = (key: keyof LeadInput, label: string, opts: { type?: string; required?: boolean; max?: number } = {}) => (
    <label className="ex-field">
      <span>
        {label}
        {opts.required && <RequiredMark />}
      </span>
      <input
        type={opts.type ?? 'text'}
        required={opts.required}
        maxLength={opts.max ?? 200}
        disabled={!editable && !!lead}
        value={(form[key] as string | null | undefined) ?? ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  if (leadId && !lead) return null;
  const qualifiedCount = lead ? QUESTIONS.filter((k) => lead.qualification[k] === true).length : 0;

  return (
    <Modal
      open
      xwide={!!lead}
      title={lead ? `${lead.firstName} ${lead.lastName}`.trim() : t('leadsInbox.new')}
      onClose={onClose}
      footer={
        lead ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="ex-muted text-sm">
              {t(`leadsInbox.status.${lead.status}`)} · {t('leadsInbox.scoreLabel', { score: lead.score })}
            </span>
            <div className="flex flex-wrap gap-2">
              {lead.status === 'converted' && lead.convertedOpportunityId && (
                <button type="button" className="btn-secondary" onClick={() => navigate('/opportunities')}>
                  {t('leadsInbox.goOpportunity')}
                </button>
              )}
              {canManage && lead.status === 'disqualified' && (
                <button type="button" className="btn-secondary" onClick={reopen}>
                  {t('leadsInbox.reopen')}
                </button>
              )}
              {editable && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setDisqualifying(true)}>
                    {t('leadsInbox.disqualify')}
                  </button>
                  <button type="button" className="btn-secondary" disabled={saving} onClick={() => save()}>
                    {t('leadsInbox.save')}
                  </button>
                  <button type="button" className="btn-primary" disabled={!lead.canConvert} title={lead.canConvert ? '' : t('leadsInbox.convertHint')} onClick={() => setConverting(true)}>
                    {t('leadsInbox.convert')}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('leadsInbox.cancel')}
            </button>
            <button type="submit" form="lead-form" className="btn-primary" disabled={saving}>
              {t('leadsInbox.create')}
            </button>
          </>
        )
      }
    >
      <div className={lead ? 'fm-layout' : ''}>
        <form id="lead-form" className="flex flex-col gap-3" onSubmit={save}>
          {lead?.status === 'disqualified' && lead.disqualifyReason && (
            <div className="card sh-note-warn text-sm">{t('leadsInbox.disqualifiedBecause', { reason: lead.disqualifyReason })}</div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field('firstName', t('leadsInbox.fields.firstName'), { required: true, max: 100 })}
            {field('lastName', t('leadsInbox.fields.lastName'), { max: 100 })}
            {field('email', t('leadsInbox.fields.email'), { type: 'email', required: true })}
            {field('phone', t('leadsInbox.fields.phone'), { type: 'tel', max: 50 })}
            {field('companyName', t('leadsInbox.fields.company'))}
            {field('title', t('leadsInbox.fields.title'), { max: 120 })}
            {field('dealName', t('leadsInbox.fields.dealName'))}
            <label className="ex-field">
              {t('leadsInbox.fields.amount')}
              <input inputMode="decimal" disabled={!editable && !!lead} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label className="ex-field">
              {t('leadsInbox.fields.source')}
              <select disabled={!editable && !!lead} value={form.leadSourceId ?? ''} onChange={(e) => setForm({ ...form, leadSourceId: e.target.value || null })}>
                <option value="">—</option>
                {catalogs.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ex-field">
              {t('leadsInbox.columns.owner')}
              <select disabled={!editable && !!lead} value={form.ownerId ?? ''} onChange={(e) => setForm({ ...form, ownerId: e.target.value || null })}>
                <option value="">{t('leadsInbox.owner.none')}</option>
                {catalogs.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="ex-field">
            {t('leadsInbox.fields.notes')}
            <textarea rows={3} maxLength={5000} disabled={!editable && !!lead} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          {lead && (lead.utmSource || lead.formId) && (
            <p className="ex-muted m-0 text-xs">
              {t('leadsInbox.cameFrom', { source: [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ') || t('leadsInbox.sourceForm') })}
            </p>
          )}
        </form>

        {lead && (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <strong>{t('leadsInbox.qualifyTitle')}</strong>
                <span className={`text-sm ${lead.canConvert ? 'text-emerald-700 dark:text-emerald-300' : 'ex-muted'}`}>{qualifiedCount}/4</span>
              </div>
              {QUESTIONS.map((key) => (
                <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{t(`leadsInbox.questions.${key}`)}</span>
                  <div className="mini-toggle-row">
                    {([true, false, null] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        disabled={!editable}
                        className={`mini-toggle-opt ${lead.qualification[key] === v || (v === null && lead.qualification[key] === undefined) ? 'active' : ''}`}
                        onClick={() => answer(key, v)}
                      >
                        {v === true ? t('leadsInbox.yes') : v === false ? t('leadsInbox.no') : '?'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <span className="ex-hint">{t('leadsInbox.qualifyHint')}</span>
            </section>

            <section className="flex flex-col gap-2">
              <strong>{t('leadsInbox.cadenceTitle')}</strong>
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                {CADENCE_DAYS.map((day, i) => {
                  const done = lead.touches[i];
                  return (
                    <li key={day} className={`flex flex-wrap items-baseline gap-2 text-sm ${done ? '' : 'ex-muted'}`}>
                      <span className="to-chip to-chip-cancelled">{i + 1}</span>
                      {done ? (
                        <span>
                          {t(`leadsInbox.channel.${done.channel}`)} · {t(`leadsInbox.outcome.${done.outcome}`)} · {dateFmt(done.at)}
                          {done.note && <span className="ex-muted"> — {done.note}</span>}
                        </span>
                      ) : (
                        <span>{t('leadsInbox.dayN', { day })}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {lead.touches.length > 5 && <span className="ex-muted text-xs">{t('leadsInbox.extraTouches', { count: lead.touches.length - 5 })}</span>}
              {editable && (
                <div className="flex flex-col gap-2 rounded-lg border border-line p-2.5 dark:border-dark-line">
                  <div className="flex flex-wrap gap-2">
                    <select value={touch.channel} onChange={(e) => setTouch({ ...touch, channel: e.target.value as TouchChannel })} aria-label={t('leadsInbox.channelLabel')}>
                      {CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {t(`leadsInbox.channel.${c}`)}
                        </option>
                      ))}
                    </select>
                    <select value={touch.outcome} onChange={(e) => setTouch({ ...touch, outcome: e.target.value as TouchOutcome })} aria-label={t('leadsInbox.outcomeLabel')}>
                      {OUTCOMES.map((o) => (
                        <option key={o} value={o}>
                          {t(`leadsInbox.outcome.${o}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input value={touch.note} maxLength={2000} placeholder={t('leadsInbox.touchNote')} aria-label={t('leadsInbox.touchNote')} onChange={(e) => setTouch({ ...touch, note: e.target.value })} />
                  <button type="button" className="btn-secondary btn-sm self-start" onClick={logTouch}>
                    {t('leadsInbox.logTouch')}
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {disqualifying && lead && (
        <Modal
          open
          title={t('leadsInbox.disqualifyTitle')}
          onClose={() => setDisqualifying(false)}
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => setDisqualifying(false)}>
                {t('leadsInbox.cancel')}
              </button>
              <button type="button" className="btn-primary" onClick={disqualify}>
                {t('leadsInbox.disqualify')}
              </button>
            </>
          }
        >
          <label className="ex-field">
            {t('leadsInbox.reason')}
            <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={t('leadsInbox.reasonPlaceholder')} />
          </label>
        </Modal>
      )}

      {converting && lead && (
        <ConvertModal
          token={token}
          lead={lead}
          onClose={() => setConverting(false)}
          onDone={(l) => {
            setConverting(false);
            applied(l);
          }}
        />
      )}
    </Modal>
  );
}

function ConvertModal({ token, lead, onClose, onDone }: { token: string; lead: Lead; onClose: () => void; onDone: (l: Lead) => void }) {
  const { t } = useTranslation('crm');
  const toast = useToast();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyMode, setCompanyMode] = useState<'new' | 'existing'>('new');
  const [state, setState] = useState({
    companyId: '',
    companyName: lead.companyName ?? '',
    pipelineId: '',
    stageId: '',
    opportunityName: lead.dealName ?? (lead.companyName ? `${lead.companyName}` : `${lead.firstName} ${lead.lastName}`.trim()),
    amount: lead.estimatedAmountCents ? String(lead.estimatedAmountCents / 100) : '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listPipelines(token).then((ps) => {
      const active = ps.filter((p) => p.isActive);
      setPipelines(active);
      const preferred = active.find((p) => p.purpose === 'new_business') ?? active[0];
      if (preferred) setState((s) => ({ ...s, pipelineId: preferred.id }));
    });
    api.listCompanies(token).then((cs) => {
      setCompanies(cs);
      const match = cs.find((c) => c.name.toLowerCase() === (lead.companyName ?? '').trim().toLowerCase());
      if (match) {
        setCompanyMode('existing');
        setState((s) => ({ ...s, companyId: match.id }));
      }
    });
  }, [token, lead.companyName]);

  const pipeline = pipelines.find((p) => p.id === state.pipelineId);
  const stages = (pipeline?.stages ?? []).filter((s) => s.isActive && s.outcome === 'open').sort((a, b) => a.order - b.order);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.convertLead(token, lead.id, {
        companyId: companyMode === 'existing' ? state.companyId : null,
        companyName: companyMode === 'new' ? state.companyName : null,
        pipelineId: state.pipelineId,
        stageId: state.stageId || null,
        opportunityName: state.opportunityName,
        amountCents: state.amount.trim() ? parseAmountInput(state.amount) : null,
      });
      toast.success(t('leadsInbox.converted'));
      onDone(r.lead);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={t('leadsInbox.convertTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('leadsInbox.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !state.pipelineId || (companyMode === 'new' ? !state.companyName.trim() : !state.companyId)}
            onClick={submit}
          >
            {t('leadsInbox.convert')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="ex-muted m-0 text-sm">{t('leadsInbox.convertBody')}</p>
        <div className="mini-toggle-row">
          {(['new', 'existing'] as const).map((m) => (
            <button key={m} type="button" className={`mini-toggle-opt ${companyMode === m ? 'active' : ''}`} onClick={() => setCompanyMode(m)}>
              {t(`leadsInbox.company.${m}`)}
            </button>
          ))}
        </div>
        {companyMode === 'new' ? (
          <label className="ex-field">
            {t('leadsInbox.fields.company')}
            <input value={state.companyName} maxLength={200} onChange={(e) => setState({ ...state, companyName: e.target.value })} />
          </label>
        ) : (
          <label className="ex-field">
            {t('leadsInbox.fields.company')}
            <select value={state.companyId} onChange={(e) => setState({ ...state, companyId: e.target.value })}>
              <option value="">—</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="ex-field">
            {t('leadsInbox.pipeline')}
            <select value={state.pipelineId} onChange={(e) => setState({ ...state, pipelineId: e.target.value, stageId: '' })}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ex-field">
            {t('leadsInbox.stage')}
            <select value={state.stageId} onChange={(e) => setState({ ...state, stageId: e.target.value })}>
              <option value="">{t('leadsInbox.firstStage')}</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ex-field">
            {t('leadsInbox.fields.dealName')}
            <input value={state.opportunityName} maxLength={200} onChange={(e) => setState({ ...state, opportunityName: e.target.value })} />
          </label>
          <label className="ex-field">
            {t('leadsInbox.fields.amount')}
            <input inputMode="decimal" value={state.amount} onChange={(e) => setState({ ...state, amount: e.target.value })} />
          </label>
        </div>
      </div>
    </Modal>
  );
}
