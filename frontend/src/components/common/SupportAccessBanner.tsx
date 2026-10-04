import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../../api/http';
import { useToast } from './ToastProvider';
import { SUPPORT_TOKEN_KEY, isSupportTab } from '../../lib/supportSession';

// Admin Center v2, stage 5 (2026-10-04): "Entrar como soporte" with consent, customer side.
// - In a normal session: shows a pending request from Northstack support (accept / decline) and,
//   once accepted, a bar while the access is active with "End access".
// - In a support session (Northstack staff seeing this account): a permanent violet bar saying so,
//   with when it ends and "Exit".

interface PendingRequest {
  id: string;
  status: 'pending' | 'approved';
  mode: 'read_only' | 'edit';
  durationMinutes: number;
  reason: string;
  staffName: string;
  requestExpiresAt: string;
  accessEndsAt: string | null;
}

interface SupportInfo {
  readOnly: boolean;
  endsAt: string;
  staffName: string;
}

interface Props {
  token: string;
  user: { firstName?: string; lastName?: string; support?: SupportInfo | null } | null;
  onLogout: () => void;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function SupportAccessBanner({ token, user, onLogout }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const support = user?.support ?? null;

  const load = useCallback(() => {
    if (support || isSupportTab()) return;
    fetch(`${API_BASE_URL}/api/support-access/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PendingRequest[]) => setRequests(Array.isArray(rows) ? rows : []))
      .catch(() => setRequests([]));
  }, [token, support]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const decide = async (id: string, decision: 'approve' | 'reject' | 'end') => {
    setBusy(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/support-access/${encodeURIComponent(id)}/${decision}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Error');
      toast.success(t(`supportAccess.done.${decision}`));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Northstack staff inside this account.
  if (support) {
    const exit = () => {
      try {
        sessionStorage.removeItem(SUPPORT_TOKEN_KEY);
      } catch {
        // storage blocked: the session still ends server-side on logout
      }
      onLogout();
    };
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#5b21e6] px-4 py-2 text-sm text-white" role="status">
        <span>
          <b>{t('supportAccess.session.title', { name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() })}</b>{' '}
          · {support.readOnly ? t('supportAccess.readOnly') : t('supportAccess.edit')} · {t('supportAccess.session.until', { time: time(support.endsAt) })}
        </span>
        <button type="button" onClick={exit} className="rounded-md bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">{t('supportAccess.session.exit')}</button>
      </div>
    );
  }

  if (requests.length === 0) return null;
  return (
    <div className="grid gap-2 px-4 pt-3 sm:px-6">
      {requests.map((r) =>
        r.status === 'pending' ? (
          <div key={r.id} className="rounded-lg border border-accent/40 bg-accent-tint/40 p-4 text-sm dark:bg-dark-surface" role="alert">
            <div className="font-semibold">{t('supportAccess.request.title')}</div>
            <p className="mt-1 text-ink-muted dark:text-dark-ink-muted">
              {t('supportAccess.request.body', { staffName: r.staffName })} <i>“{r.reason}”</i>
            </p>
            <p className="mt-1 text-ink-muted dark:text-dark-ink-muted">
              {r.mode === 'edit' ? t('supportAccess.edit') : t('supportAccess.readOnly')} · {t(`supportAccess.duration.${r.durationMinutes}`)} · {t('supportAccess.request.canEnd')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={busy === r.id} onClick={() => decide(r.id, 'approve')}>{t('supportAccess.request.accept')}</button>
              <button type="button" className="btn-secondary" disabled={busy === r.id} onClick={() => decide(r.id, 'reject')}>{t('supportAccess.request.decline')}</button>
            </div>
          </div>
        ) : (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-tint/50 px-4 py-2 text-sm dark:bg-dark-surface" role="status">
            <span>{t('supportAccess.active', { staffName: r.staffName, time: r.accessEndsAt ? time(r.accessEndsAt) : '' })} · {r.mode === 'edit' ? t('supportAccess.edit') : t('supportAccess.readOnly')}</span>
            <button type="button" className="btn-secondary" disabled={busy === r.id} onClick={() => decide(r.id, 'end')}>{t('supportAccess.endAccess')}</button>
          </div>
        ),
      )}
    </div>
  );
}
