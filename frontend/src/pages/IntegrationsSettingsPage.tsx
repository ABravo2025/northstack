import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import { api, type ApiKeySummary, type GoogleCalendarStatus, type StripeConnectionStatus, type Tenant } from '../api';
import { useToast } from '../components/common/ToastProvider';
import { usePermissions } from '../contexts/PermissionsContext';
import EmptyState from '../components/common/EmptyState';
import TableSkeleton from '../components/common/TableSkeleton';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import { CopyIcon, LockIcon, TrashIcon } from '../components/common/Icons';
import i18n from '../lib/i18n';

interface IntegrationsSettingsPageProps {
  token: string;
  tenant: Tenant | null;
}

// Google's official 4-color "G" mark — standard on any "Connect/Sign in with
// Google" button per Google's own brand guidelines.
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12
        c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24
        c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039
        l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36
        c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571
        c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24
        C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}

// Payments v1 (spec-payments-v1.md, Unit 1) — connecting the tenant's OWN Stripe account
// (Restricted Key pasted by hand, no OAuth) so refunds/failed payments/subscriptions across its
// Companies become visible (a later unit, the "Payments" sidebar section). Gated to owner-only
// here, per this page's own established rule of gating an individual card rather than splitting
// the page — see the comment on IntegrationsSettingsPage below.
// Custom Roles Fase J — prop renamed from `isOwner` to canManagePayments: it's owner-only by
// default (Stripe connection is gated by manage_payments on the backend), but a real toggleable
// permission, not structurally tied to being the fixed Owner.
function StripeCard({ token, canManagePayments }: { token: string; canManagePayments: boolean }) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [status, setStatus] = useState<StripeConnectionStatus | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = () => {
    if (!canManagePayments) return;
    api
      .getStripeStatus(token)
      .then(setStatus)
      .catch((error) => toast.error(t('integrations.stripe.loadError', { message: (error as Error).message })));
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManagePayments]);

  if (!canManagePayments) {
    return null;
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    try {
      const next = await api.connectStripe(token, apiKeyInput);
      setStatus(next);
      setApiKeyInput('');
      toast.success(t('integrations.stripe.connected'));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.disconnectStripe(token);
      toast.success(t('integrations.stripe.disconnected'));
      loadStatus();
    } catch (error) {
      toast.error(t('integrations.stripe.disconnectError', { message: (error as Error).message }));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="card">
      <div className="integration-header">
        <div>
          <h3 className="card-title" style={{ margin: 0 }}>
            Stripe
          </h3>
          <p className="text-xs text-ink-muted dark:text-dark-ink-muted">
            {t('integrations.stripe.description')}
          </p>
        </div>
      </div>

      {status?.needsAttention && (
        <div className="field-error" style={{ marginBottom: '0.75rem' }}>
          {t('integrations.stripe.needsAttention')}
        </div>
      )}

      {status?.connected ? (
        <div className="flex flex-col gap-3">
          <div className="integration-status-row">
            <div className="flex items-center gap-2">
              <span
                className={`integration-status-dot ${status.needsAttention ? 'integration-status-dot-warn' : 'integration-status-dot-ok'}`}
              />
              <div>
                <div className="text-sm font-medium">
                  {t('integrations.stripe.connectedLabel')}{' '}
                  <span className={`role-chip ${status.apiKeyMode === 'live' ? 'chip-good' : 'chip-neutral'}`}>
                    {status.apiKeyMode}
                  </span>
                </div>
                <div className="text-xs text-ink-muted dark:text-dark-ink-muted">
                  {t('integrations.stripe.since', {
                    date: status.connectedAt ? new Date(status.connectedAt).toLocaleDateString() : '—',
                  })}
                </div>
              </div>
            </div>
            <button type="button" className="btn-danger btn-md" onClick={handleDisconnect} disabled={disconnecting}>
              {t('integrations.disconnect')}
            </button>
          </div>
          <p className="text-xs text-ink-muted dark:text-dark-ink-muted">
            {t('integrations.stripe.checkFrequency')}
          </p>
        </div>
      ) : (
        <form onSubmit={handleConnect} className="flex flex-col gap-3">
          <div className="text-xs text-ink-muted dark:text-dark-ink-muted">
            <p style={{ marginBottom: '0.5rem' }}>
              {t('integrations.stripe.useRestrictedKeyPrefix')}{' '}
              <a href="https://docs.stripe.com/keys" target="_blank" rel="noreferrer">
                {t('integrations.stripe.restrictedKey')}
              </a>{' '}
              {t('integrations.stripe.useRestrictedKeySuffix')}
            </p>
            <ul style={{ listStyle: 'disc', paddingLeft: '1.25rem', marginBottom: '0.5rem' }}>
              <li>{t('integrations.stripe.scopes.customers')}</li>
              <li>{t('integrations.stripe.scopes.charges')}</li>
              <li>{t('integrations.stripe.scopes.refunds')}</li>
              <li>{t('integrations.stripe.scopes.invoices')}</li>
              <li>{t('integrations.stripe.scopes.subscriptions')}</li>
              <li>{t('integrations.stripe.scopes.paymentMethods')}</li>
              <li>{t('integrations.stripe.scopes.events')}</li>
            </ul>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="stripe-api-key">{t('integrations.stripe.apiKey')}</label>
            <input
              id="stripe-api-key"
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="rk_live_... or sk_test_..."
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn-primary btn-md" disabled={connecting || !apiKeyInput.trim()} style={{ alignSelf: 'flex-start' }}>
            {connecting ? t('integrations.stripe.connecting') : t('integrations.stripe.testConnection')}
          </button>
        </form>
      )}
    </div>
  );
}

// Private API (spec-private-api-webhooks.md §3) — mirrors the backend's API_SCOPES catalog
// (src/lib/externalApiAuth.ts) grouped for the checklist below. hr.payroll has no `write` entry
// on purpose — hr.payroll:write is excluded from v1 entirely (Alejandro, 2026-09-07, spec §10 risk
// #1), so there's no checkbox for it to show in the first place. crm.pipelines is read-only by
// design (spec §3: pipelines are configuration, not a "movimiento").
const API_SCOPE_GROUPS: { groupKey: string; resources: { key: string; labelKey: string; write: boolean }[] }[] = [
  {
    groupKey: 'tasksNotes',
    resources: [
      { key: 'tasks', labelKey: 'tasks', write: true },
      { key: 'notes', labelKey: 'notes', write: true },
    ],
  },
  {
    groupKey: 'crm',
    resources: [
      { key: 'crm.companies', labelKey: 'companies', write: true },
      { key: 'crm.contacts', labelKey: 'contacts', write: true },
      { key: 'crm.opportunities', labelKey: 'opportunities', write: true },
      { key: 'crm.pipelines', labelKey: 'pipelines', write: false },
    ],
  },
  {
    groupKey: 'hr',
    resources: [
      { key: 'hr.employees', labelKey: 'employees', write: true },
      { key: 'hr.timeoff', labelKey: 'timeOff', write: true },
      { key: 'hr.payroll', labelKey: 'payroll', write: false },
    ],
  },
];

function formatRelativeOrDate(iso: string | null): string {
  if (!iso) return i18n.t('integrations.apiKeys.never', { ns: 'settingsPages' });
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Settings → Integrations → API & Webhooks (spec-private-api-webhooks.md §8) — self-service API
// key management. Only the API Keys half of that section ships here; outbound webhooks (Unit 4)
// are built and verified backend-only, paused before a UI (Alejandro, 2026-09-07/08 — see
// docs/general/Tareas-QA.md QA-80), so no webhook UI exists yet.
function ApiKeysCard({ token, canManageApiAccess }: { token: string; canManageApiAccess: boolean }) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revokingKey, setRevokingKey] = useState<ApiKeySummary | null>(null);
  const [revoking, setRevoking] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const loadKeys = () => {
    if (!canManageApiAccess) return;
    api
      .listApiKeys(token)
      .then(setKeys)
      .catch((error) => toast.error(t('integrations.apiKeys.loadError', { message: (error as Error).message })));
  };

  useEffect(() => {
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageApiAccess]);

  if (!canManageApiAccess) {
    return null;
  }

  const resetCreateForm = () => {
    setNewKeyName('');
    setSelectedScopes(new Set());
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await api.createApiKey(token, { name: newKeyName.trim(), scopes: Array.from(selectedScopes) });
      setRevealedKey(created.fullKey);
      resetCreateForm();
      loadKeys();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      toast.success(t('integrations.apiKeys.copied'));
    } catch (error) {
      toast.error(t('integrations.apiKeys.copyError', { message: (error as Error).message }));
    }
  };

  const handleRevoke = async () => {
    if (!revokingKey) return;
    setRevoking(true);
    try {
      await api.revokeApiKey(token, revokingKey.id);
      toast.success(t('integrations.apiKeys.revokedToast', { name: revokingKey.name }));
      setRevokingKey(null);
      loadKeys();
    } catch (error) {
      toast.error(t('integrations.apiKeys.revokeError', { message: (error as Error).message }));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="card">
      <div className="integration-header">
        <div>
          <h3 className="card-title" style={{ margin: 0 }}>
            {t('integrations.apiKeys.title')}
          </h3>
          <p className="text-xs text-ink-muted dark:text-dark-ink-muted">
            {t('integrations.apiKeys.description')}{' '}
            <a
              href="/developers"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-brand-blue hover:underline dark:text-brand-blue-light"
            >
              {t('integrations.apiKeys.viewDocs')}
            </a>
            .
          </p>
        </div>
      </div>

      {keys && keys.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button type="button" className="btn-primary btn-md" onClick={() => setShowCreateModal(true)}>
            {t('integrations.apiKeys.createKey')}
          </button>
        </div>
      )}

      {keys === null ? (
        <TableSkeleton rows={2} columns={4} />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={<LockIcon />}
          title={t('integrations.apiKeys.emptyTitle')}
          body={t('integrations.apiKeys.emptyBody')}
          primaryLabel={t('integrations.apiKeys.createKey')}
          onPrimary={() => setShowCreateModal(true)}
        />
      ) : (
        <>
        <div className="full-table-wrap" ref={tableWrapRef}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('integrations.apiKeys.columns.name')}</th>
                <th>{t('integrations.apiKeys.columns.key')}</th>
                <th>{t('integrations.apiKeys.columns.scopes')}</th>
                <th>{t('integrations.apiKeys.columns.status')}</th>
                <th>{t('integrations.apiKeys.columns.lastUsed')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>
                    <span className="block max-w-[160px] truncate" title={key.name}>
                      {key.name}
                    </span>
                  </td>
                  <td>
                    <code className="text-xs">{key.keyPrefix}…</code>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <span key={scope} className="role-chip chip-neutral">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {key.revokedAt ? (
                      <span
                        className="role-chip chip-neutral"
                        title={t('integrations.apiKeys.revokedTitle', { date: formatRelativeOrDate(key.revokedAt) })}
                      >
                        {t('integrations.apiKeys.revoked')}
                      </span>
                    ) : (
                      <span className="role-chip chip-good">{t('integrations.apiKeys.active')}</span>
                    )}
                  </td>
                  <td>{formatRelativeOrDate(key.lastUsedAt)}</td>
                  <td>
                    {!key.revokedAt && (
                      <div className="icon-actions">
                        <button className="icon-btn danger" onClick={() => setRevokingKey(key)}>
                          <span className="tip">{t('integrations.apiKeys.revoke')}</span>
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <HorizontalScrollbar targetRef={tableWrapRef} />
        </>
      )}

      <Modal
        open={showCreateModal}
        title={revealedKey ? t('integrations.apiKeys.keyCreatedTitle') : t('integrations.apiKeys.createKeyTitle')}
        wide
        onClose={() => {
          setShowCreateModal(false);
          setRevealedKey(null);
          resetCreateForm();
        }}
      >
        {revealedKey ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {t('integrations.apiKeys.copyNowWarning')}
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs" style={{ wordBreak: 'break-all', flex: 1 }}>
                {revealedKey}
              </code>
              <button type="button" className="icon-btn" onClick={handleCopyKey}>
                <span className="tip">{t('integrations.apiKeys.copy')}</span>
                <CopyIcon />
              </button>
            </div>
            <button
              type="button"
              className="btn-primary w-full text-center"
              onClick={() => {
                setShowCreateModal(false);
                setRevealedKey(null);
              }}
            >
              {t('integrations.apiKeys.doneCopiedIt')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div className="nv-field">
              <label htmlFor="new-api-key-name">{t('integrations.apiKeys.name')}</label>
              <input
                id="new-api-key-name"
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder={t('integrations.apiKeys.namePlaceholder')}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('integrations.apiKeys.columns.scopes')}</label>
              <p className="mb-2 text-xs text-ink-muted dark:text-dark-ink-muted">
                {t('integrations.apiKeys.scopesHelp')}
              </p>
              <div className="flex flex-col gap-3">
                {API_SCOPE_GROUPS.map((group) => (
                  <div key={group.groupKey}>
                    <div className="mb-1 text-xs font-medium text-ink-muted dark:text-dark-ink-muted">
                      {t(`integrations.apiKeys.scopeGroups.${group.groupKey}`)}
                    </div>
                    <div className="flex flex-col gap-1">
                      {group.resources.map((resource) => (
                        <div key={resource.key} className="flex items-center gap-4">
                          <span className="text-sm" style={{ minWidth: '9rem' }}>
                            {t(`integrations.apiKeys.scopeResources.${resource.labelKey}`)}
                          </span>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={selectedScopes.has(`${resource.key}:read`)}
                              onChange={() => toggleScope(`${resource.key}:read`)}
                            />
                            {t('integrations.apiKeys.read')}
                          </label>
                          {resource.write && (
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={selectedScopes.has(`${resource.key}:write`)}
                                onChange={() => toggleScope(`${resource.key}:write`)}
                              />
                              {t('integrations.apiKeys.write')}
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-primary w-full text-center" disabled={creating || !newKeyName.trim() || selectedScopes.size === 0}>
              {creating ? t('integrations.apiKeys.creating') : t('integrations.apiKeys.createKey')}
            </button>
          </form>
        )}
      </Modal>

      {revokingKey && (
        <ConfirmDialog
          title={t('integrations.apiKeys.revokeConfirmTitle', { name: revokingKey.name })}
          message={t('integrations.apiKeys.revokeConfirmMessage')}
          confirmLabel={revoking ? t('integrations.apiKeys.revoking') : t('integrations.apiKeys.revoke')}
          confirmDisabled={revoking}
          onConfirm={handleRevoke}
          onCancel={() => setRevokingKey(null)}
        />
      )}
    </div>
  );
}

// The one home for every integration (2026-08-24) — reachable by every
// role, not just admin/owner, since the first one (Google Calendar) is a
// personal per-user connection: each person only ever sees and controls
// their own. Future tenant-wide integrations (Slack, outbound webhooks,
// etc. — previously a separate disabled "Coming soon" tile under Company)
// belong here too rather than a second entry point; gate an individual card
// by role if one ends up admin-only, don't split the page — Stripe below
// (Payments v1, owner-only) is the first case of that carve-out.
export default function IntegrationsSettingsPage({ token }: IntegrationsSettingsPageProps) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const permissions = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [googleStatus, setGoogleStatus] = useState<GoogleCalendarStatus | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const loadGoogleStatus = () => {
    api
      .getGoogleCalendarStatus(token)
      .then(setGoogleStatus)
      .catch((error) => toast.error(t('integrations.google.loadError', { message: (error as Error).message })));
  };

  useEffect(() => {
    loadGoogleStatus();

    if (searchParams.get('googleCalendarConnected')) {
      toast.success(t('integrations.google.connected'));
      setSearchParams({}, { replace: true });
    } else if (searchParams.get('googleCalendarError')) {
      toast.error(t('integrations.google.connectError'));
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google blocks OAuth sign-in inside an embedded WebView as a matter of policy, so on native
  // handleGoogleConnect below opens the system browser instead of navigating the app's own
  // WebView — which means there's no same-tab redirect back into the app once the user finishes
  // in Google's consent screen. This listens for the user manually switching back to the app
  // (home button / app switcher) and just re-checks the connection status then, closing the
  // browser tab behind them — simpler than wiring up real Android App Links for a first version.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('resume', () => {
      void Browser.close().catch(() => {});
      loadGoogleStatus();
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleConnect = async () => {
    setGoogleBusy(true);
    try {
      const { url } = await api.getGoogleCalendarConnectUrl(token);
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url });
        setGoogleBusy(false);
      } else {
        window.location.href = url;
      }
    } catch (error) {
      toast.error(t('integrations.google.connectStartError', { message: (error as Error).message }));
      setGoogleBusy(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    setGoogleBusy(true);
    try {
      await api.disconnectGoogleCalendar(token);
      toast.success(t('integrations.google.disconnected'));
      loadGoogleStatus();
    } catch (error) {
      toast.error(t('integrations.google.disconnectError', { message: (error as Error).message }));
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="card">
        <div className="integration-header">
          <GoogleLogo className="integration-logo" />
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>
              Google Calendar
            </h3>
            <p className="text-xs text-ink-faint dark:text-dark-ink-faint">
              {t('integrations.google.description')}
            </p>
          </div>
        </div>

        {googleStatus?.connected ? (
          <div className="integration-status-row">
            <div className="flex items-center gap-2">
              <span
                className={`integration-status-dot ${googleStatus.needsReconnect ? 'integration-status-dot-warn' : 'integration-status-dot-ok'}`}
              />
              <div>
                <div className="text-sm font-medium">{googleStatus.googleAccountEmail}</div>
                {googleStatus.needsReconnect ? (
                  <div className="field-error">{t('integrations.google.accessRevoked')}</div>
                ) : (
                  <div className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('integrations.stripe.connectedLabel')}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {googleStatus.needsReconnect && (
                <button type="button" className="btn-primary btn-md" onClick={handleGoogleConnect} disabled={googleBusy}>
                  {t('integrations.google.reconnect')}
                </button>
              )}
              <button type="button" className="btn-danger btn-md" onClick={handleGoogleDisconnect} disabled={googleBusy}>
                {t('integrations.disconnect')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-google btn-md" onClick={handleGoogleConnect} disabled={googleBusy}>
            <GoogleLogo className="h-4 w-4" />
            {googleBusy ? t('integrations.google.connecting') : t('integrations.google.connectButton')}
          </button>
        )}
      </div>

      <StripeCard token={token} canManagePayments={permissions.has('manage_payments')} />
      <ApiKeysCard token={token} canManageApiAccess={permissions.has('manage_api_access')} />
    </div>
  );
}
