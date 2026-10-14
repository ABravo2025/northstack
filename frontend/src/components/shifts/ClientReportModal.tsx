import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import Modal from '../common/Modal';
import { useToast } from '../common/ToastProvider';

interface ClientReportModalProps {
  token: string;
  company: { id: string; name: string } | null;
  from: string;
  to: string;
  monthLabel: string;
  onClose: () => void;
}

// Reports → by company → "Client report" (spec-shifts-fase2.md §D, Growth): the approved hours of
// the month for that company (optionally one project), as a PDF download, a private link (30 days)
// or an email to the client with both. The email starts as the company's primary contact.
export default function ClientReportModal({ token, company, from, to, monthLabel, onClose }: ClientReportModalProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [showPeople, setShowPeople] = useState(true);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!company) return;
    setProjects([]);
    setProjectId('');
    setShowPeople(true);
    setEmail('');
    setLink(null);
    api
      .getClientReportDefaults(token, company.id)
      .then((d) => {
        setProjects(d.projects);
        setEmail(d.email ?? '');
      })
      .catch((e) => toast.error(t('clientReport.failed', { message: (e as Error).message })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, company?.id]);

  if (!company) return null;
  const input = { companyId: company.id, projectId: projectId || null, from, to, showPeople, lang: i18n.language.startsWith('es') ? 'es' : 'en' };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(t('clientReport.failed', { message: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const download = () =>
    run(async () => {
      const blob = await api.downloadClientReportPdf(token, input);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hours-${company.name.replace(/[^\w-]+/g, '-')}-${from.slice(0, 7)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const createLink = (send: boolean) =>
    run(async () => {
      const r = await api.createClientReport(token, { ...input, email: send ? email.trim() : null });
      setLink(r.url);
      if (r.emailedTo) toast.success(t('clientReport.sent', { email: r.emailedTo }));
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('clientReport.copied'));
    } catch {
      // the link stays visible to copy by hand
    }
  };

  return (
    <Modal
      open
      title={t('clientReport.title', { name: company.name })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={busy} onClick={download}>
            {t('clientReport.pdf')}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => createLink(false)}>
            {t('clientReport.link')}
          </button>
          <button type="button" className="btn-primary" disabled={busy || !email.trim()} onClick={() => createLink(true)}>
            {t('clientReport.send')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0">{t('clientReport.body', { month: monthLabel })}</p>
        {projects.length > 0 && (
          <div className="form-group !mb-0">
            <label htmlFor="client-report-project">{t('clientReport.project')}</label>
            <select id="client-report-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{t('clientReport.allProjects')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showPeople} onChange={(e) => setShowPeople(e.target.checked)} />
          {t('clientReport.showPeople')}
        </label>
        <div className="form-group !mb-0">
          <label htmlFor="client-report-email">{t('clientReport.email')}</label>
          <input id="client-report-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
        </div>
        {link && (
          <div className="flex items-center gap-2">
            <input readOnly value={link} className="flex-1" onFocus={(e) => e.target.select()} aria-label={t('clientReport.link')} />
            <button type="button" className="btn-secondary" onClick={copy}>
              {t('clientReport.copy')}
            </button>
          </div>
        )}
        <p className="rules-hint m-0">{t('clientReport.hint')}</p>
      </div>
    </Modal>
  );
}
