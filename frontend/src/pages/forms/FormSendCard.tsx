import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type FormCandidate, type FormDefinition, type FormInvitesSummary } from '../../api';
import { useToast } from '../../components/common/ToastProvider';

// Formularios y encuestas → "Cómo llega" (B4): personal links by email. Pick people (contacts for
// Clients/Leads, employees for Employees), send, and see who answered. Someone who got this form
// in the last 60 days can't be picked again. Anonymous surveys never show who answered.
export default function FormSendCard({ token, form }: { token: string; form: FormDefinition }) {
  const { t, i18n } = useTranslation('forms');
  const toast = useToast();
  const [q, setQ] = useState('');
  const [candidates, setCandidates] = useState<FormCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<FormInvitesSummary | null>(null);
  const [sending, setSending] = useState(false);
  const published = form.status === 'published';
  const trigger = form.surveySettings?.trigger;

  const loadSummary = () => api.listFormInvites(token, form.id).then(setSummary).catch(() => setSummary(null));
  useEffect(() => {
    if (published) loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, form.id, published]);

  useEffect(() => {
    if (!published) return;
    const handle = setTimeout(() => {
      api
        .listFormCandidates(token, form.id, q || undefined)
        .then((r) => setCandidates(r.candidates))
        .catch((e) => toast.error((e as Error).message));
    }, 250);
    return () => clearTimeout(handle);
  }, [token, form.id, q, published, toast]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const eligible = (candidates ?? []).filter((c) => c.canSend);
  const allPicked = eligible.length > 0 && eligible.every((c) => picked.has(c.id));
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short' });

  const send = async () => {
    setSending(true);
    try {
      const r = await api.sendFormInvites(token, form.id, [...picked]);
      toast.success(
        r.skipped.length ? t('send.sentWithSkipped', { count: r.sent, skipped: r.skipped.length }) : t('send.sent', { count: r.sent }),
      );
      setPicked(new Set());
      const [c] = await Promise.all([api.listFormCandidates(token, form.id, q || undefined), loadSummary()]);
      setCandidates(c.candidates);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card ex-card">
      <h3 className="card-title m-0">{t('editor.personalTitle')}</h3>
      <p className="ex-muted m-0 text-sm">{t('editor.personalBody')}</p>
      {form.kind === 'survey' && trigger && trigger !== 'manual' && (
        <div className="fm-lands">
          <strong>{t('send.autoTitle', { trigger: t(`trigger.${trigger}`) })}</strong>
          <span>{trigger === 'ticket_closed' ? t('send.autoLater') : t('send.autoBody')}</span>
        </div>
      )}
      {!published ? (
        <p className="ex-muted m-0 text-sm">{t('send.publishFirst')}</p>
      ) : (
        <>
          {summary && summary.total > 0 && (
            <p className="m-0 text-sm">{t('send.summary', { sent: summary.total, responded: summary.responded })}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input className="min-w-0 flex-1" value={q} placeholder={t('send.search')} aria-label={t('send.search')} onChange={(e) => setQ(e.target.value)} />
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={allPicked}
                disabled={!eligible.length}
                onChange={() => setPicked(allPicked ? new Set() : new Set(eligible.map((c) => c.id)))}
              />
              {t('send.selectAll')}
            </label>
          </div>
          <div className="fm-recipients">
            {candidates === null ? (
              <span className="ex-muted text-sm">{t('modal.loading')}</span>
            ) : candidates.length === 0 ? (
              <span className="ex-muted text-sm">{t('send.noCandidates')}</span>
            ) : (
              candidates.map((c) => (
                <label key={c.id} className={`fm-recipient ${c.canSend ? '' : 'opacity-60'}`}>
                  <input type="checkbox" disabled={!c.canSend} checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{c.name}</span>
                    <span className="ex-muted truncate text-xs">
                      {[c.email, c.detail].filter(Boolean).join(' · ')}
                      {c.lastSentAt ? ` · ${t(c.canSend ? 'send.lastSent' : 'send.recent', { date: date(c.lastSentAt) })}` : ''}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <span className="ex-hint">{t('send.rule')}</span>
          <button type="button" className="btn-primary self-start" disabled={!picked.size || sending} onClick={send}>
            {sending ? t('send.sending') : t('send.button', { count: picked.size })}
          </button>
          {summary && summary.invites.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">{t('send.history')}</summary>
              <ul className="ex-due mt-2">
                {summary.invites.slice(0, 50).map((i) => (
                  <li key={i.id}>
                    <span>{i.recipientName}</span>
                    <span className="ex-muted text-xs">
                      {date(i.sentAt)} · {t(`trigger.${i.trigger}`, { defaultValue: i.trigger })} · {t(`send.status.${i.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
