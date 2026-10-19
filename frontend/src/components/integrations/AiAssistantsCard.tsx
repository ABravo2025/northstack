import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AiConnectionSummary } from '../../api';
import { useToast } from '../common/ToastProvider';
import TableBody from '../common/TableBody';
import TableSkeleton from '../common/TableSkeleton';
import ConfirmDialog from '../common/ConfirmDialog';
import HorizontalScrollbar from '../entity-views/HorizontalScrollbar';
import { CopyIcon, SparklesIcon, TrashIcon } from '../common/Icons';

// Settings → Integrations → AI assistants (spec-mcp-server.md §2b, §7). Connections are OAuth-only
// (Alejandro, 2026-10-16): the person pastes the server URL into their assistant, which sends them to
// Northstack's consent page (/oauth/authorize) — nothing to copy or create here. Each connection acts
// as its user, so there are no scopes to pick: it can do whatever their role allows. Hidden without
// use_ai_assistants, which PermissionsContext also folds the Growth plan into. Whoever manages
// integrations (manage_api_access) can also see and cut everyone's connections.

// The MCP endpoint lives on the same host as the app (vercel.json rewrites /mcp to api/mcp.ts), so
// staging shows the staging URL and production the production one.
function mcpServerUrl(): string {
  return `${window.location.origin}/mcp`;
}

const CLIENT_GUIDES = ['claudeAi', 'chatgpt', 'claudeCode', 'cursor'] as const;

function clientSnippet(key: (typeof CLIENT_GUIDES)[number]): string | null {
  const url = mcpServerUrl();
  if (key === 'claudeCode') return `claude mcp add --transport http northstack ${url}`;
  if (key === 'cursor') return JSON.stringify({ mcpServers: { northstack: { url } } }, null, 2);
  return null;
}

function formatDate(iso: string | null, never: string): string {
  if (!iso) return never;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface AiAssistantsCardProps {
  token: string;
  canUseAiAssistants: boolean;
  canManageApiAccess: boolean;
}

export default function AiAssistantsCard({ token, canUseAiAssistants, canManageApiAccess }: AiAssistantsCardProps) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [connections, setConnections] = useState<AiConnectionSummary[] | null>(null);
  const [showEveryone, setShowEveryone] = useState(false);
  const [revoking, setRevoking] = useState<AiConnectionSummary | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const visible = canUseAiAssistants || canManageApiAccess;

  const load = () => {
    if (!visible) return;
    api
      .listAiConnections(token, showEveryone || !canUseAiAssistants ? 'all' : 'mine')
      .then(setConnections)
      .catch((error) => toast.error(t('integrations.aiAssistants.loadError', { message: (error as Error).message })));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, showEveryone]);

  // A connection is made in another tab (the assistant opens Northstack's consent page there and
  // then goes back to the assistant), so reload when the person comes back to this one.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, showEveryone]);

  if (!visible) return null;

  const allMode = showEveryone || !canUseAiAssistants;

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('integrations.aiAssistants.copied'));
    } catch (error) {
      toast.error(t('integrations.aiAssistants.copyError', { message: (error as Error).message }));
    }
  };

  const handleRevoke = async () => {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      await api.revokeAiConnection(token, revoking.id);
      toast.success(t('integrations.aiAssistants.revokedToast', { name: revoking.clientName }));
      setRevoking(null);
      load();
    } catch (error) {
      toast.error(t('integrations.aiAssistants.revokeError', { message: (error as Error).message }));
    } finally {
      setRevokeBusy(false);
    }
  };

  const never = t('integrations.aiAssistants.never');
  const columns = allMode ? 5 : 4;

  return (
    <div className="card">
      <div className="integration-header">
        <div>
          <h3 className="card-title" style={{ margin: 0 }}>
            {t('integrations.aiAssistants.title')}
          </h3>
          <p className="text-xs text-ink-muted dark:text-dark-ink-muted">{t('integrations.aiAssistants.description')}</p>
        </div>
      </div>

      {canUseAiAssistants && (
        <div className="mb-4 flex flex-col gap-2">
          <span className="text-xs font-medium">{t('integrations.aiAssistants.serverUrl')}</span>
          <div className="flex items-center gap-2">
            <code className="text-xs" style={{ wordBreak: 'break-all' }}>
              {mcpServerUrl()}
            </code>
            <button type="button" className="icon-btn" onClick={() => copyText(mcpServerUrl())}>
              <span className="tip">{t('integrations.aiAssistants.copy')}</span>
              <CopyIcon />
            </button>
          </div>
          <p className="text-xs text-ink-muted dark:text-dark-ink-muted">{t('integrations.aiAssistants.howItWorks')}</p>
          <details className="text-xs">
            <summary className="cursor-pointer font-medium">{t('integrations.aiAssistants.guidesTitle')}</summary>
            <div className="mt-2 flex flex-col gap-3">
              {CLIENT_GUIDES.map((key) => {
                const snippet = clientSnippet(key);
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <span className="font-medium">{t(`integrations.aiAssistants.guides.${key}.name`)}</span>
                    <span className="text-ink-muted dark:text-dark-ink-muted">{t(`integrations.aiAssistants.guides.${key}.steps`)}</span>
                    {snippet && (
                      <div className="flex items-start gap-2">
                        <pre className="text-xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1, margin: 0 }}>
                          {snippet}
                        </pre>
                        <button type="button" className="icon-btn" onClick={() => copyText(snippet)}>
                          <span className="tip">{t('integrations.aiAssistants.copy')}</span>
                          <CopyIcon />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      )}

      {canManageApiAccess && canUseAiAssistants && (
        <label className="mb-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={showEveryone} onChange={(e) => setShowEveryone(e.target.checked)} />
          {t('integrations.aiAssistants.showEveryone')}
        </label>
      )}

      {connections === null ? (
        <TableSkeleton rows={2} columns={columns} />
      ) : (
        <>
          <div className="full-table-wrap" ref={tableWrapRef}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('integrations.aiAssistants.columns.name')}</th>
                  {allMode && <th>{t('integrations.aiAssistants.columns.user')}</th>}
                  <th>{t('integrations.aiAssistants.columns.status')}</th>
                  <th>{t('integrations.aiAssistants.columns.lastUsed')}</th>
                  <th></th>
                </tr>
              </thead>
              <TableBody
                colSpan={columns}
                isEmpty={connections.length === 0}
                empty={{ icon: <SparklesIcon />, title: t('integrations.aiAssistants.emptyTitle'), body: t('integrations.aiAssistants.emptyBody') }}
              >
                {connections.map((connection) => (
                  <tr key={connection.id}>
                    <td>
                      <span className="block max-w-[180px] truncate" title={connection.clientName}>
                        {connection.clientName}
                      </span>
                    </td>
                    {allMode && (
                      <td>
                        {connection.user.firstName} {connection.user.lastName}
                      </td>
                    )}
                    <td>
                      {connection.revokedAt ? (
                        <span className="role-chip chip-neutral">{t('integrations.aiAssistants.revoked')}</span>
                      ) : (
                        <span className="role-chip chip-good">{t('integrations.aiAssistants.active')}</span>
                      )}
                    </td>
                    <td>{formatDate(connection.lastUsedAt ?? connection.createdAt, never)}</td>
                    <td>
                      {!connection.revokedAt && (
                        <div className="icon-actions">
                          <button className="icon-btn danger" onClick={() => setRevoking(connection)}>
                            <span className="tip">{t('integrations.aiAssistants.revoke')}</span>
                            <TrashIcon />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </TableBody>
            </table>
          </div>
          <HorizontalScrollbar targetRef={tableWrapRef} />
        </>
      )}

      {revoking && (
        <ConfirmDialog
          title={t('integrations.aiAssistants.revokeConfirmTitle', { name: revoking.clientName })}
          message={t('integrations.aiAssistants.revokeConfirmMessage')}
          confirmLabel={revokeBusy ? t('integrations.aiAssistants.revoking') : t('integrations.aiAssistants.revoke')}
          confirmDisabled={revokeBusy}
          onConfirm={handleRevoke}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>
  );
}
