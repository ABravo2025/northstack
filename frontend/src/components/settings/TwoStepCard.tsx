import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { twoStepApi, type TwoStepSecret, type TwoStepStatus } from '../../api/twoStep';
import Modal from '../common/Modal';
import QrCode from '../common/QrCode';
import { useToast } from '../common/ToastProvider';
import RecoveryCodes from '../auth/RecoveryCodes';

interface TwoStepCardProps {
  token: string;
}

// App.tsx listens for this to update the "turn on two-step verification" banner.
export const TWO_STEP_CHANGED = 'northstack:two-step-changed';

type Dialog = { kind: 'setup'; secret: TwoStepSecret | null } | { kind: 'codes'; codes: string[] } | { kind: 'confirm'; action: 'regenerate' | 'disable' };

// Settings → Profile → Two-step verification (spec-2fa.md §1): turn it on with an authenticator app
// (QR + code → recovery codes shown once), new recovery codes, forget remembered devices, and turn
// it off — only when the person's role doesn't require it.
export default function TwoStepCard({ token }: TwoStepCardProps) {
  const { t, i18n } = useTranslation('auth');
  const toast = useToast();
  const [status, setStatus] = useState<TwoStepStatus | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [code, setCode] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    twoStepApi
      .status(token)
      .then(setStatus)
      .catch(() => setStatus(null));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!status) return null;

  const changed = (enabled: boolean) => window.dispatchEvent(new CustomEvent(TWO_STEP_CHANGED, { detail: { enabled } }));
  const close = () => {
    setDialog(null);
    setCode('');
    setError(null);
    setShowKey(false);
  };

  const startSetup = async () => {
    setDialog({ kind: 'setup', secret: null });
    try {
      setDialog({ kind: 'setup', secret: await twoStepApi.startSetup(token) });
    } catch (e) {
      close();
      toast.error((e as Error).message);
    }
  };

  const confirm = async () => {
    if (!dialog) return;
    setBusy(true);
    setError(null);
    try {
      if (dialog.kind === 'setup') {
        const r = await twoStepApi.enable(token, code.trim());
        changed(true);
        // Right away, not after the status reload: the card behind the codes already says "On".
        setStatus((prev) => (prev ? { ...prev, enabled: true, enabledAt: new Date().toISOString(), recoveryCodesLeft: r.recoveryCodes.length } : prev));
        setCode('');
        setDialog({ kind: 'codes', codes: r.recoveryCodes });
      } else if (dialog.kind === 'confirm' && dialog.action === 'regenerate') {
        const r = await twoStepApi.regenerateCodes(token, code.trim());
        setCode('');
        setDialog({ kind: 'codes', codes: r.recoveryCodes });
      } else if (dialog.kind === 'confirm' && dialog.action === 'disable') {
        await twoStepApi.disable(token, code.trim());
        changed(false);
        setStatus((prev) => (prev ? { ...prev, enabled: false, enabledAt: null, recoveryCodesLeft: 0, trustedDevices: 0 } : prev));
        close();
        toast.success(t('twoStep.disabled'));
      }
      await load();
    } catch {
      setError(t('twoStep.badCode'));
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    await twoStepApi.forgetDevices(token);
    toast.success(t('twoStep.devicesForgotten'));
    await load();
  };

  const since = status.enabledAt ? new Date(status.enabledAt).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const codeInput = (
    <div className="form-group !mb-0">
      <label htmlFor="two-step-card-code">{t('twoStep.codeLabel')}</label>
      <input
        id="two-step-card-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        maxLength={12}
        className="max-w-[12rem] tracking-widest"
        autoFocus
      />
      {error && <p className="m-0 mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );

  return (
    <div className="card" id="two-step">
      <h3 className="card-title">{t('twoStep.cardTitle')}</h3>
      <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t('twoStep.cardLead')}</p>
      {status.enabled ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 flex flex-wrap items-center gap-2 text-sm">
            <span className="to-chip to-chip-approved">{t('twoStep.on')}</span>
            {t('twoStep.since', { date: since })} · {t('twoStep.codesLeft', { count: status.recoveryCodesLeft })}
          </p>
          {status.recoveryCodesLeft <= 2 && <p className="m-0 text-sm text-amber-700 dark:text-amber-300">{t('twoStep.codesLow')}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'confirm', action: 'regenerate' })}>
              {t('twoStep.newCodes')}
            </button>
            {status.trustedDevices > 0 && (
              <button type="button" className="btn-secondary" onClick={forget}>
                {t('twoStep.forgetDevices', { count: status.trustedDevices })}
              </button>
            )}
            {!status.required && (
              <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'confirm', action: 'disable' })}>
                {t('twoStep.turnOff')}
              </button>
            )}
          </div>
          {status.required && <p className="m-0 text-xs text-ink-faint dark:text-dark-ink-faint">{t('twoStep.requiredNote')}</p>}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          {status.required && <p className="m-0 text-sm font-semibold text-amber-700 dark:text-amber-300">{t('twoStep.requiredOff')}</p>}
          <button type="button" className="btn-primary" onClick={startSetup}>
            {t('twoStep.turnOn')}
          </button>
        </div>
      )}

      <Modal
        open={dialog !== null}
        title={dialog?.kind === 'codes' ? t('twoStep.codesTitle') : dialog?.kind === 'setup' ? t('twoStep.enrollTitleCard') : dialog?.action === 'disable' ? t('twoStep.turnOff') : t('twoStep.newCodes')}
        onClose={close}
        footer={
          dialog?.kind === 'codes' ? (
            <button type="button" className="btn-primary" onClick={close}>
              {t('twoStep.codesDone')}
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={close}>
                {t('twoStep.cancel')}
              </button>
              <button type="button" className="btn-primary" disabled={busy || !code.trim() || (dialog?.kind === 'setup' && !dialog.secret)} onClick={confirm}>
                {dialog?.kind === 'setup' ? t('twoStep.turnOn') : t('twoStep.confirm')}
              </button>
            </>
          )
        }
      >
        {dialog?.kind === 'setup' && (
          <div className="flex flex-col gap-3">
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm">
              <li>{t('twoStep.stepApp')}</li>
              <li>{t('twoStep.stepScan')}</li>
              <li>{t('twoStep.stepCode')}</li>
            </ol>
            <div className="flex flex-col items-center gap-2">
              {dialog.secret ? <QrCode value={dialog.secret.otpauthUrl} size={180} label={t('twoStep.qrLabel')} /> : <div className="h-[180px] w-[180px] rounded-lg bg-surface-2 dark:bg-dark-raised" />}
              {dialog.secret && (
                <button type="button" className="to-link text-xs" onClick={() => setShowKey(!showKey)}>
                  {showKey ? t('twoStep.hideKey') : t('twoStep.cantScan')}
                </button>
              )}
              {dialog.secret && showKey && <code className="rounded bg-surface-2 px-2 py-1 text-xs break-all dark:bg-dark-raised">{dialog.secret.secret.replace(/(.{4})/g, '$1 ').trim()}</code>}
            </div>
            {codeInput}
          </div>
        )}
        {dialog?.kind === 'confirm' && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm">{dialog.action === 'disable' ? t('twoStep.disableBody') : t('twoStep.regenerateBody')}</p>
            {codeInput}
          </div>
        )}
        {dialog?.kind === 'codes' && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm">{t('twoStep.codesBody')}</p>
            <RecoveryCodes codes={dialog.codes} />
          </div>
        )}
      </Modal>
    </div>
  );
}
