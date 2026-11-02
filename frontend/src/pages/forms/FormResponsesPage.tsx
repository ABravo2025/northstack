import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, type FormDefinition, type FormResponseDetail, type FormResponseRow } from '../../api';
import Modal from '../../components/common/Modal';
import TableBody from '../../components/common/TableBody';
import { formatNumber } from '../../lib/currencies';
import { FormsFrame, Loading, targetLabel, useFormsMeta } from './formsShared';

// Formularios y encuestas → Respuestas (B5). A click on a response opens the modal with every
// question and answer, where each answer was copied, and a button to the linked record (spec).
export default function FormResponsesPage({ token }: { token: string }) {
  const { t, i18n } = useTranslation('forms');
  const [params, setParams] = useSearchParams();
  const formId = params.get('form') ?? '';
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [rows, setRows] = useState<FormResponseRow[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.listForms(token).then(setForms).catch(() => setForms([]));
  }, [token]);

  useEffect(() => {
    setRows(null);
    api
      .listFormResponses(token, formId || undefined)
      .then(setRows)
      .catch((e) => {
        const code = e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;
        setFailure(code === 'forms_not_configured' ? t('state.notConfigured') : t('state.loadFailed', { error: (e as Error).message }));
      });
  }, [token, formId, t]);

  const form = forms.find((f) => f.id === formId);
  const scored = (rows ?? []).filter((r) => r.score !== null).map((r) => r.score!);
  const metric = form?.surveySettings?.metric;
  // NPS / eNPS: % promoters (9-10) − % detractors (0-6). CSAT: the average.
  const kpi =
    form?.kind === 'survey' && scored.length
      ? metric === 'csat'
        ? { label: t('responses.kpiAvg'), value: formatNumber(scored.reduce((a, b) => a + b, 0) / scored.length, 1) }
        : {
            label: t(`metric.${metric === 'enps' ? 'enps' : 'nps'}`),
            value: String(Math.round(((scored.filter((s) => s >= 9).length - scored.filter((s) => s <= 6).length) / scored.length) * 100)),
            hint: t('responses.npsHint'),
          }
      : null;
  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short' });

  return (
    <FormsFrame title={t('titles.responses')} subtitle={t('subtitles.responses')}>
      <div className="ex-filters">
        <select
          className="max-w-72"
          aria-label={t('responses.columns.form')}
          value={formId}
          onChange={(e) => setParams(e.target.value ? { form: e.target.value } : {})}
        >
          <option value="">{t('responses.allForms')}</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {failure ? (
        <div className="card sh-note-warn text-sm">{failure}</div>
      ) : rows === null ? (
        <Loading />
      ) : (
        <>
          {kpi && (
            <div className="sh-kpis">
              <div className="sh-kpi">
                <span className="sh-kpi-label">{kpi.label}</span>
                <span className="sh-kpi-value num">{kpi.value}</span>
                <span className="sh-kpi-hint">{kpi.hint ?? ' '}</span>
              </div>
              <div className="sh-kpi">
                <span className="sh-kpi-label">{t('responses.kpiCount')}</span>
                <span className="sh-kpi-value num">{rows.length}</span>
                <span className="sh-kpi-hint"> </span>
              </div>
            </div>
          )}
          <p className="ex-muted m-0 text-sm">{t('responses.hint')}</p>
          <div className="full-table-wrap">
            <table className="table full-table to-table">
              <thead>
                <tr>
                  <th>{t('responses.columns.date')}</th>
                  <th>{t('responses.columns.form')}</th>
                  <th>{t('responses.columns.summary')}</th>
                  <th className="text-right">{t('responses.columns.score')}</th>
                  <th>{t('responses.columns.linked')}</th>
                  <th>{t('responses.columns.source')}</th>
                </tr>
              </thead>
              <TableBody colSpan={6} isEmpty={rows.length === 0} empty={{ title: t('responses.empty') }}>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setOpen(r.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)}
                  >
                    <td className="ex-muted whitespace-nowrap">{dateFmt(r.createdAt)}</td>
                    <td>{r.formName}</td>
                    <td className="ex-muted !whitespace-normal text-sm">{r.preview || '—'}</td>
                    <td className="num text-right">{r.score ?? '—'}</td>
                    <td className="text-sm">
                      {r.linked ? r.linked.label : r.kind === 'survey' ? <span className="ex-muted">{t('responses.anonymous')}</span> : '—'}
                    </td>
                    <td>
                      <span className="role-chip chip-neutral">{t(`responses.source.${r.source}`, { defaultValue: r.source })}</span>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </table>
          </div>
        </>
      )}

      {open && <ResponseModal token={token} id={open} onClose={() => setOpen(null)} />}
    </FormsFrame>
  );
}

function ResponseModal({ token, id, onClose }: { token: string; id: string; onClose: () => void }) {
  const { t, i18n } = useTranslation('forms');
  const navigate = useNavigate();
  const { meta } = useFormsMeta(token);
  const [detail, setDetail] = useState<FormResponseDetail | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    api
      .getFormResponse(token, id)
      .then(setDetail)
      .catch((e) => setFailure((e as Error).message));
  }, [token, id]);

  const when = detail
    ? new Date(detail.createdAt).toLocaleString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  const answerText = (a: string | null, type: string) => (a === null ? null : type === 'yes_no' ? (a === 'yes' ? t('editor.yes') : t('editor.no')) : a);

  return (
    <Modal
      open
      wide
      title={detail ? detail.form.name : t('modal.loading')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('modal.close')}
          </button>
          {detail?.linked && (
            <button type="button" className="btn-primary" onClick={() => navigate(detail.linked!.href)}>
              {t('modal.goRecord')}
            </button>
          )}
        </>
      }
    >
      {failure ? (
        <p className="text-sm">{failure}</p>
      ) : !detail ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="ex-muted">{when}</span>
            <span className="role-chip chip-neutral">{t(`module.${detail.form.module}`)}</span>
            <span className="role-chip chip-neutral">{t(`responses.source.${detail.source}`, { defaultValue: detail.source })}</span>
            {detail.score !== null && <span className="to-chip ex-chip-auto">{detail.score}</span>}
          </div>
          <div className="fm-qa-list">
            {detail.items.map((item) => (
              <div key={item.questionId} className="fm-qa">
                <span className="ex-muted text-sm">{item.label}</span>
                <strong className="font-medium">{answerText(item.answer, item.type) ?? <span className="ex-muted">{t('modal.noAnswer')}</span>}</strong>
                {item.copiedTo && <span className="role-chip chip-neutral self-start">{t('modal.copiedTo', { target: targetLabel(t, item.copiedTo, meta) })}</span>}
              </div>
            ))}
          </div>
          <div className="fm-lands">
            <strong>{detail.linked ? t('modal.linkedTitle', { label: detail.linked.label }) : detail.form.kind === 'survey' ? t('modal.anonymousLinked') : t('modal.notLinked')}</strong>
            {detail.form.action && <span>{t(`action.${detail.form.action}`)}</span>}
            {detail.utm.source && <span>{t('modal.utm', { value: [detail.utm.source, detail.utm.medium, detail.utm.campaign].filter(Boolean).join(' / ') })}</span>}
          </div>
        </div>
      )}
    </Modal>
  );
}
