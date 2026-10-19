import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/http';
import { storeDeviceToken, twoStepApi, type TwoStepSecret } from '../../api/twoStep';
import type { TwoStepPending } from '../../api/types';
import QrCode from '../common/QrCode';
import RecoveryCodes from './RecoveryCodes';

interface TwoStepLoginProps {
  email: string;
  pending: TwoStepPending;
  // The session, once the code (or the setup) is done.
  onDone: (sessionToken: string) => void;
  // Back to the email + password form (expired step, or "use another account").
  onCancel: (message?: string) => void;
}

// The step between password and session (spec-2fa.md §1). `verify`: the 6-digit code from the
// authenticator app, or a recovery code, with "remember this device for 30 days". `enroll`:
// someone who must have it (owner, billing/payments, Northstack staff) sets it up right here.
// Used by the app's login and by the Admin Center's; styled for the always-navy auth panel.
export default function TwoStepLogin({ email, pending, onDone, onCancel }: TwoStepLoginProps) {
  const { t } = useTranslation('auth');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [remember, setRemember] = useState(false);
  const [secret, setSecret] = useState<TwoStepSecret | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [codes, setCodes] = useState<{ list: string[]; session: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const expired = (e: unknown) => e instanceof ApiError && e.status === 401;

  useEffect(() => {
    if (pending.step !== 'enroll') return;
    let alive = true;
    twoStepApi
      .startLoginSetup(pending.token)
      .then((s) => alive && setSecret(s))
      .catch((e) => alive && onCancel(expired(e) ? t('twoStep.expired') : (e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.token, pending.step]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (pending.step === 'verify') {
        const r = await twoStepApi.verifyLogin(pending.token, code.trim(), remember);
        if (r.deviceToken) storeDeviceToken(email, r.deviceToken);
        onDone(r.session.token);
      } else {
        const r = await twoStepApi.confirmLoginSetup(pending.token, code.trim());
        setCodes({ list: r.recoveryCodes ?? [], session: r.session.token });
      }
    } catch (err) {
      if (expired(err)) onCancel(t('twoStep.expired'));
      else setError(t('twoStep.badCode'));
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="auth-title">{t('twoStep.codesTitle')}</h2>
        <p className="m-0 text-sm text-brand-blue-light/80">{t('twoStep.codesBody')}</p>
        <RecoveryCodes codes={codes.list} />
        <button type="button" className="auth-submit" onClick={() => onDone(codes.session)}>
          {t('twoStep.codesDone')}
        </button>
      </div>
    );
  }

  const codeField = (
    <div className="form-group">
      <label htmlFor="two-step-code">{useRecovery ? t('twoStep.recoveryLabel') : t('twoStep.codeLabel')}</label>
      <input
        id="two-step-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode={useRecovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        placeholder={useRecovery ? 'xxxx-xxxx' : '123456'}
        maxLength={useRecovery ? 12 : 7}
        autoFocus
        required
        disabled={busy}
        className="tracking-widest"
      />
      {error && <p className="m-0 mt-1 text-sm text-red-300">{error}</p>}
    </div>
  );

  if (pending.step === 'verify') {
    return (
      <form onSubmit={submit} className="flex flex-col">
        <h2 className="auth-title">{t('twoStep.verifyTitle')}</h2>
        <p className="mt-0 mb-4 text-sm text-brand-blue-light/80">{useRecovery ? t('twoStep.recoveryBody') : t('twoStep.verifyBody')}</p>
        {codeField}
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t('twoStep.remember')}
        </label>
        <button type="submit" className="auth-submit" disabled={busy || !code.trim()}>
          {busy ? t('twoStep.checking') : t('twoStep.verify')}
        </button>
        <div className="auth-foot">
          <button
            type="button"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setCode('');
              setError(null);
            }}
          >
            {useRecovery ? t('twoStep.useApp') : t('twoStep.useRecovery')}
          </button>
          <button type="button" onClick={() => onCancel()}>
            {t('twoStep.back')}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <h2 className="auth-title">{t('twoStep.enrollTitle')}</h2>
      <p className="mt-0 mb-3 text-sm text-brand-blue-light/80">{t('twoStep.enrollBody')}</p>
      <ol className="mt-0 mb-3 flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>{t('twoStep.stepApp')}</li>
        <li>{t('twoStep.stepScan')}</li>
      </ol>
      <div className="mb-2 flex flex-col items-center gap-2">
        {secret ? <QrCode value={secret.otpauthUrl} size={180} label={t('twoStep.qrLabel')} /> : <div className="h-[180px] w-[180px] rounded-lg bg-white/10" />}
        {secret && (
          <button type="button" className="auth-forgot-link !text-center" onClick={() => setShowKey(!showKey)}>
            {showKey ? t('twoStep.hideKey') : t('twoStep.cantScan')}
          </button>
        )}
        {secret && showKey && <code className="rounded bg-white/10 px-2 py-1 text-xs break-all text-brand-cream">{secret.secret.replace(/(.{4})/g, '$1 ').trim()}</code>}
      </div>
      <ol start={3} className="mt-0 mb-2 list-decimal pl-5 text-sm">
        <li>{t('twoStep.stepCode')}</li>
      </ol>
      {codeField}
      <button type="submit" className="auth-submit" disabled={busy || !secret || !code.trim()}>
        {busy ? t('twoStep.checking') : t('twoStep.turnOn')}
      </button>
      <div className="auth-foot">
        <button type="button" onClick={() => onCancel()}>
          {t('twoStep.back')}
        </button>
      </div>
    </form>
  );
}
