import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AiConnectionSummary } from '../../api';
import { useToast } from '../common/ToastProvider';
import TableBody from '../common/TableBody';
import TableSkeleton from '../common/TableSkeleton';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import HorizontalScrollbar from '../entity-views/HorizontalScrollbar';
import { CopyIcon, SparklesIcon, TrashIcon } from '../common/Icons';

// Settings → Integrations → AI assistants (spec-mcp-server.md §2b, §7). A user's OWN assistants:
// each token acts as them, so there are no scopes to pick (unlike an API key) — what it can do is
// whatever their role allows. Hidden without use_ai_assistants, which PermissionsContext also
// folds the Growth plan into. Personal tokens only for now; OAuth connections (Unit 4) will show
// up in this same list.

// The MCP endpoint lives on the same host as the app (vercel.json rewrites /mcp to api/mcp.ts),
// so staging shows the staging URL and production the production one.
function mcpServerUrl(): string {
  return `${window.location.origin}/mcp`;
}

// Ready-to-paste setup for clients that accept a fixed Authorization header. claude.ai and ChatGPT
// connectors need OAuth (spec-mcp-server.md Unit 4), so they aren't offered here yet.
function setupSnippets(token: string): { key: 'claudeCode' | 'cursor'; text: string }[] {
  const url = mcpServerUrl();
  return [
    { key: 'claudeCode', text: `claude mcp add --transport http northstack ${url} --header "Authorization: Bearer ${token}"` },
    {
      key: 'cursor',
      text: JSON.stringify({ mcpServers: { northstack: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
    },
  ];
}

function formatDate(iso: string | null, never: string): string {
  if (!iso) return never;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AiAssistantsCard({ token, canUseAiAssistants }: { token: string; canUseAiAssistants: boolean }) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [connections, setConnections] = useState<AiConnectionSummary[] | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<AiConnectionSummary | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!canUseAiAssistants) return;
    api
      .listAiConnections(token)
      .then(setConnections)
      .catch((error) => toast.error(t('integrations.aiAssistants.loadError', { message: (error as Error).message })));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseAiAssistants]);

  if (!canUseAiAssistants) return null;

  const closeModal = () => {
    setShowCreateModal(false);
    setRevealedToken(null);
    setName('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await api.createAiToken(token, name.trim());
      setRevealedToken(created.fullToken);
      setName('');
      load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  };

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

      <div className="mb-3 flex flex-col gap-1">
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
        <p className="text-xs text-ink-muted dark:text-dark-ink-muted">{t('integrations.aiAssistants.oauthSoon')}</p>
      </div>

      {connections === null ? (
        <TableSkeleton rows={2} columns={4} />
      ) : (
        <>
          <div className="full-table-wrap" ref={tableWrapRef}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('integrations.aiAssistants.columns.name')}</th>
                  <th>{t('integrations.aiAssistants.columns.token')}</th>
                  <th>{t('integrations.aiAssistants.columns.status')}</th>
                  <th>{t('integrations.aiAssistants.columns.lastUsed')}</th>
                  <th></th>
                </tr>
              </thead>
              <TableBody
                colSpan={5}
                isEmpty={connections.length === 0}
                empty={{ icon: <SparklesIcon />, title: t('integrations.aiAssistants.emptyTitle'), body: t('integrations.aiAssistants.emptyBody') }}
                onAdd={() => setShowCreateModal(true)}
                addLabel={t('integrations.aiAssistants.createToken')}
              >
                {connections.map((connection) => (
                  <tr key={connection.id}>
                    <td>
                      <span className="block max-w-[180px] truncate" title={connection.clientName}>
                        {connection.clientName}
                      </span>
                    </td>
                    <td>{connection.tokenPrefix ? <code className="text-xs">{connection.tokenPrefix}…</code> : '—'}</td>
                    <td>
                      {connection.revokedAt ? (
                        <span className="role-chip chip-neutral">{t('integrations.aiAssistants.revoked')}</span>
                      ) : (
                        <span className="role-chip chip-good">{t('integrations.aiAssistants.active')}</span>
                      )}
                    </td>
                    <td>{formatDate(connection.lastUsedAt, never)}</td>
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

      <Modal
        open={showCreateModal}
        title={revealedToken ? t('integrations.aiAssistants.createdTitle') : t('integrations.aiAssistants.createTitle')}
        wide
        onClose={closeModal}
        footer={
          revealedToken ? (
            <button type="button" className="btn-primary btn-md" onClick={closeModal}>
              {t('integrations.aiAssistants.doneCopiedIt')}
            </button>
          ) : (
            <button type="submit" form="create-ai-token-form" className="btn-primary btn-md" disabled={creating || !name.trim()}>
              {creating ? t('integrations.aiAssistants.creating') : t('integrations.aiAssistants.createToken')}
            </button>
          )
        }
      >
        {revealedToken ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{t('integrations.aiAssistants.copyNowWarning')}</p>
            <div className="flex items-center gap-2">
              <code className="text-xs" style={{ wordBreak: 'break-all', flex: 1 }}>
                {revealedToken}
              </code>
              <button type="button" className="icon-btn" onClick={() => copyText(revealedToken)}>
                <span className="tip">{t('integrations.aiAssistants.copy')}</span>
                <CopyIcon />
              </button>
            </div>
            <p className="text-sm font-medium">{t('integrations.aiAssistants.setupTitle')}</p>
            {setupSnippets(revealedToken).map((snippet) => (
              <div key={snippet.key} className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted dark:text-dark-ink-muted">{t(`integrations.aiAssistants.setup.${snippet.key}`)}</span>
                <div className="flex items-start gap-2">
                  <pre className="text-xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1, margin: 0 }}>
                    {snippet.text}
                  </pre>
                  <button type="button" className="icon-btn" onClick={() => copyText(snippet.text)}>
                    <span className="tip">{t('integrations.aiAssistants.copy')}</span>
                    <CopyIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <form id="create-ai-token-form" onSubmit={handleCreate} className="flex flex-col gap-3">
            <div className="nv-field">
              <label htmlFor="new-ai-token-name">{t('integrations.aiAssistants.name')}</label>
              <input
                id="new-ai-token-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('integrations.aiAssistants.namePlaceholder')}
                maxLength={60}
                autoFocus
                required
              />
            </div>
            <p className="text-xs text-ink-muted dark:text-dark-ink-muted">{t('integrations.aiAssistants.nameHelp')}</p>
          </form>
        )}
      </Modal>

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
