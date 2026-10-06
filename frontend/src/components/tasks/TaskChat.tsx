import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type TaskComment } from '../../api';
import Avatar from '../common/Avatar';
import { TrashIcon } from '../common/Icons';
import { useToast } from '../common/ToastProvider';

interface TenantUserLite {
  id: string;
  firstName: string;
  lastName: string;
}

interface TaskChatProps {
  token: string;
  taskId: string;
  currentUserId: string;
}

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The "@partial name" being typed right before the caret (letters and spaces, up to 30 chars).
const MENTION_QUERY = /(^|\s)@([\p{L}\p{M}' ]{0,30})$/u;

// Task chat (2026-10-06, Alejandro) — a short conversation inside any task, where "@" mentions
// anyone in the company with a login (on the project or not); each mention sends them an in-app
// notification. Replaces the project page's side Notes: the talk lives where the work is.
export default function TaskChat({ token, taskId, currentUserId }: TaskChatProps) {
  const { t, i18n } = useTranslation('tasks');
  const toast = useToast();
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  // Its own list (not the admin-only tenant users): anyone signed in can mention anyone.
  const [tenantUsers, setTenantUsers] = useState<TenantUserLite[]>([]);
  const [body, setBody] = useState('');
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map()); // userId -> "@Name"
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const locale = i18n.language === 'es' ? 'es-AR' : 'en-US';

  useEffect(() => {
    setComments(null);
    api
      .listTaskComments(token, taskId)
      .then(setComments)
      .catch((e) => {
        setComments([]);
        toast.error(t('myTasks.chat.loadError', { message: (e as Error).message }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, taskId]);

  useEffect(() => {
    api.listMentionableUsers(token).then(setTenantUsers).catch(() => {});
  }, [token]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comments]);

  const usersById = useMemo(() => new Map(tenantUsers.map((u) => [u.id, u])), [tenantUsers]);
  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.trim().toLocaleLowerCase();
    return tenantUsers.filter((u) => fullName(u).toLocaleLowerCase().includes(q)).slice(0, 6);
  }, [query, tenantUsers]);

  const updateQuery = (value: string, caret: number) => {
    const m = MENTION_QUERY.exec(value.slice(0, caret));
    setQuery(m ? m[2] : null);
    setHighlight(0);
  };

  const pick = (user: TenantUserLite) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(MENTION_QUERY, (_m, lead) => `${lead}@${fullName(user)} `);
    const next = before + body.slice(caret);
    setBody(next);
    setMentioned((prev) => new Map(prev).set(user.id, `@${fullName(user)}`));
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    // Only people whose "@Name" is still in the text count — deleting a mention drops it.
    const mentionedUserIds = [...mentioned.entries()].filter(([, tag]) => text.includes(tag)).map(([id]) => id);
    setSending(true);
    try {
      const comment = await api.createTaskComment(token, taskId, { body: text, mentionedUserIds });
      setComments((list) => [...(list ?? []), comment]);
      setBody('');
      setMentioned(new Map());
    } catch (e) {
      toast.error(t('myTasks.chat.sendError', { message: (e as Error).message }));
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment: TaskComment) => {
    try {
      await api.deleteTaskComment(token, taskId, comment.id);
      setComments((list) => (list ?? []).filter((c) => c.id !== comment.id));
    } catch (e) {
      toast.error(t('myTasks.chat.sendError', { message: (e as Error).message }));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query !== null && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[highlight]);
        return;
      }
    }
    if (e.key === 'Escape' && query !== null) {
      e.stopPropagation();
      setQuery(null);
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  };

  // Highlights each "@Name" the message actually mentioned.
  const renderBody = (comment: TaskComment) => {
    const tags = comment.mentionedUserIds
      .map((id) => usersById.get(id))
      .filter((u): u is TenantUserLite => !!u)
      .map((u) => `@${fullName(u)}`);
    if (tags.length === 0) return comment.body;
    const parts = comment.body.split(new RegExp(`(${tags.map(escapeRe).join('|')})`, 'g'));
    return parts.map((part, i) =>
      tags.includes(part) ? (
        <span key={i} className="font-semibold text-accent dark:text-brand-blue-light">
          {part}
        </span>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
  };

  return (
    <section className="flex flex-col gap-2 border-t border-line pt-3 dark:border-dark-line">
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-dark-ink-faint">
        {t('myTasks.chat.title')}
        {comments && comments.length > 0 ? ` (${comments.length})` : ''}
      </h3>
      <div ref={listRef} className="flex max-h-64 flex-col gap-3 overflow-y-auto">
        {comments === null ? null : comments.length === 0 ? (
          <p className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('myTasks.chat.empty')}</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="group flex gap-2">
              <Avatar firstName={c.author.firstName} lastName={c.author.lastName} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-semibold text-ink dark:text-dark-ink">{fullName(c.author)}</span>
                  <span className="text-ink-faint dark:text-dark-ink-faint">
                    {new Date(c.createdAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {c.authorId === currentUserId && (
                    <button
                      type="button"
                      className="icon-btn ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label={t('myTasks.chat.deleteAria')}
                      onClick={() => remove(c)}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="m-0 whitespace-pre-wrap break-words text-sm text-ink-muted dark:text-dark-ink-muted">{renderBody(c)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="relative">
        <textarea
          ref={inputRef}
          id={`task-chat-${taskId}`}
          rows={2}
          maxLength={2000}
          value={body}
          placeholder={t('myTasks.chat.placeholder')}
          aria-label={t('myTasks.chat.placeholder')}
          onChange={(e) => {
            setBody(e.target.value);
            updateQuery(e.target.value, e.target.selectionStart);
          }}
          onClick={(e) => updateQuery(body, e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          className="w-full"
        />
        {query !== null && (
          <div
            role="listbox"
            className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-lg border border-line bg-surface-1 shadow-lg dark:border-dark-line dark:bg-dark-surface"
          >
            {matches.length === 0 ? (
              <div className="px-3 py-2 text-xs text-ink-faint dark:text-dark-ink-faint">{t('myTasks.chat.noMatches')}</div>
            ) : (
              matches.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    i === highlight ? 'bg-accent-tint text-accent dark:bg-brand-blue-light/15 dark:text-brand-blue-light' : 'hover:bg-surface-2 dark:hover:bg-dark-raised'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(u);
                  }}
                >
                  <Avatar firstName={u.firstName} lastName={u.lastName} />
                  {fullName(u)}
                </button>
              ))
            )}
          </div>
        )}
        <div className="mt-1 flex justify-end">
          <button type="button" className="btn-primary btn-sm" disabled={!body.trim() || sending} onClick={send}>
            {t('myTasks.chat.send')}
          </button>
        </div>
      </div>
    </section>
  );
}
