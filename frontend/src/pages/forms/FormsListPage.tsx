import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, type FormDefinition, type FormKind, type FormModule } from '../../api';
import TableBody from '../../components/common/TableBody';
import { useToast } from '../../components/common/ToastProvider';
import { FormsFrame, Loading } from './formsShared';

// Formularios y encuestas → Todos (B5): every form and survey with what each response does,
// filterable by type and module, as in the prototype.
const MODULES: FormModule[] = ['leads', 'clients', 'employees', 'support', 'projects', 'none'];

export default function FormsListPage({ token }: { token: string }) {
  const { t } = useTranslation('forms');
  const toast = useToast();
  const navigate = useNavigate();
  const [forms, setForms] = useState<FormDefinition[] | null>(null);
  const [kind, setKind] = useState<'' | FormKind>('');
  const [module, setModule] = useState<'' | FormModule>('');

  useEffect(() => {
    api
      .listForms(token)
      .then(setForms)
      .catch((e) => toast.error(t('state.loadFailed', { error: (e as Error).message })));
  }, [token, toast, t]);

  const visible = (forms ?? []).filter((f) => (!kind || f.kind === kind) && (!module || f.module === module));
  const filtered = Boolean(kind || module);

  return (
    <FormsFrame
      title={t('titles.list')}
      subtitle={t('subtitles.list')}
      actions={
        <>
          <button type="button" className="btn-secondary" onClick={() => navigate('/forms/new?kind=survey')}>
            {t('list.newSurvey')}
          </button>
          <button type="button" className="btn-primary" onClick={() => navigate('/forms/new')}>
            {t('list.newForm')}
          </button>
        </>
      }
    >
      <div className="ex-filters">
        <div className="mini-toggle-row" role="group" aria-label={t('list.columns.kind')}>
          {(['', 'form', 'survey'] as const).map((k) => (
            <button key={k || 'all'} type="button" className={`mini-toggle-opt ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
              {t(`kindFilter.${k || 'all'}`)}
            </button>
          ))}
        </div>
        <select value={module} onChange={(e) => setModule(e.target.value as '' | FormModule)} aria-label={t('list.columns.module')} className="max-w-56">
          <option value="">{t('module.all')}</option>
          {MODULES.map((m) => (
            <option key={m} value={m}>
              {t(`module.${m}`)}
            </option>
          ))}
        </select>
      </div>

      {forms === null ? (
        <Loading />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table to-table">
            <thead>
              <tr>
                <th>{t('list.columns.name')}</th>
                <th>{t('list.columns.kind')}</th>
                <th>{t('list.columns.module')}</th>
                <th>{t('list.columns.action')}</th>
                <th>{t('list.columns.status')}</th>
                <th className="text-right">{t('list.columns.responses')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <TableBody
              colSpan={7}
              isEmpty={visible.length === 0}
              empty={{ title: filtered ? t('list.emptyFiltered') : t('list.empty') }}
              onAdd={() => navigate('/forms/new')}
              addLabel={t('list.newForm')}
            >
              {visible.map((f) => (
                <tr key={f.id} className="cursor-pointer" onClick={() => navigate(`/forms/${f.id}`)}>
                  <td className="!whitespace-normal">
                    <span className="flex flex-col">
                      <strong>{f.name}</strong>
                      <span className="ex-muted text-xs">
                        {f.legacy ? `/${f.slug}` : t('list.questions', { count: f.fields.length })}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className={`to-chip ${f.kind === 'survey' ? 'ex-chip-auto' : 'to-chip-cancelled'}`}>{t(`kind.${f.kind}`)}</span>
                  </td>
                  <td>
                    <span className="role-chip chip-neutral">{t(`module.${f.module}`)}</span>
                  </td>
                  <td className="!whitespace-normal text-sm">{f.action ? t(`action.${f.action}`) : '—'}</td>
                  <td>
                    {f.legacy ? (
                      <span className="to-chip to-chip-pending">{t('status.legacy')}</span>
                    ) : (
                      <span className={`to-chip ${f.status === 'published' ? 'to-chip-approved' : 'to-chip-cancelled'}`}>{t(`status.${f.status}`)}</span>
                    )}
                  </td>
                  <td className="num text-right">{f.responseCount}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/forms/responses?form=${f.id}`);
                      }}
                    >
                      {t('list.viewResponses')}
                    </button>
                  </td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      )}

      <section className="card ex-info">
        <div>
          <strong>{t('list.infoModuleTitle')}</strong>
          <span>{t('list.infoModuleBody')}</span>
        </div>
        <div>
          <strong>{t('list.infoMapTitle')}</strong>
          <span>{t('list.infoMapBody')}</span>
        </div>
        <div>
          <strong>{t('list.infoLinkTitle')}</strong>
          <span>{t('list.infoLinkBody')}</span>
        </div>
      </section>
    </FormsFrame>
  );
}
