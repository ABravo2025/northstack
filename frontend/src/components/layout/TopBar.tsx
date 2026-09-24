import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, MenuIcon, UserCircleIcon } from '../common/Icons';
import SlideOver from '../common/SlideOver';
import NotificationBell from './NotificationBell';
import { useToast } from '../common/ToastProvider';
import { api } from '../../api';

interface TopBarProps {
  user: any;
  token: string;
  onLogout: () => void;
  onMenuClick: () => void;
  onReplayTour: () => void;
}

export default function TopBar({ user, token, onLogout, onMenuClick, onReplayTour }: TopBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'ticket' | 'idea'>('ticket');
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  const handleSendFeedback = async () => {
    const message = feedbackMessage.trim();
    const subject = feedbackSubject.trim();
    if (!message || !subject) return;
    setSendingFeedback(true);
    try {
      await api.sendFeedback(token, { type: feedbackType, subject, message, pageUrl: window.location.href });
      toast.success(t('topbar.feedback.thanks'));
      setFeedbackSubject('');
      setFeedbackMessage('');
      setFeedbackOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSendingFeedback(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab' || !menuRef.current) return;

      const focusable = menuRef.current.querySelectorAll<HTMLElement>('button');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Move focus into the menu as soon as it opens.
    const firstItem = menuRef.current?.querySelector<HTMLElement>('.user-menu-dropdown button');
    firstItem?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div className="header">
      <div className="flex items-center gap-3">
        <button type="button" className="menu-toggle" onClick={onMenuClick} aria-label={t('topbar.openMenu')}>
          <MenuIcon className="h-5 w-5" />
        </button>
        {/* Below md the horizontal wordmark (~195px) overlaps the bell button that follows it
            in this flex row (header is too narrow for both) — swap to the square icon mark,
            which leaves room. */}
        <img src="/icon-color.svg" alt="Northstack" className="h-8 w-8 md:hidden" />
        <span className="hidden items-center md:flex">
          <img src="/logo-horizontal-light.svg" alt="Northstack" className="dark:hidden" />
          <img src="/logo-horizontal-dark.svg" alt="Northstack" className="hidden dark:block" />
        </span>
      </div>

      <div className="flex items-center gap-2">
      <span data-tour="topbar-bell" className="inline-flex">
        <NotificationBell token={token} />
      </span>
      <div className="user-menu" ref={menuRef}>
        <button
          ref={triggerRef}
          className="user-menu-trigger"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          data-tour="topbar-usermenu"
        >
          <UserCircleIcon className="h-5 w-5" />
          <span className="hidden whitespace-nowrap sm:inline">
            {user.firstName} {user.lastName}
          </span>
          <ChevronDownIcon className="h-4 w-4" />
        </button>

        {open && (
          <div className="user-menu-dropdown" role="menu">
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/guide');
              }}
            >
              {t('topbar.userGuide')}
            </button>
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/help');
              }}
            >
              {t('topbar.helpFaq')}
            </button>
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onReplayTour();
              }}
            >
              {t('topbar.replayTour')}
            </button>
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setFeedbackOpen(true);
              }}
            >
              {t('topbar.sendFeedback')}
            </button>
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              {t('topbar.logout')}
            </button>
          </div>
        )}
      </div>
      </div>

      <SlideOver
        open={feedbackOpen}
        title={t('topbar.feedback.title')}
        onClose={() => setFeedbackOpen(false)}
        footer={
          <button
            type="button"
            className="btn-primary"
            onClick={handleSendFeedback}
            disabled={sendingFeedback || !feedbackMessage.trim() || !feedbackSubject.trim()}
          >
            {sendingFeedback ? t('topbar.feedback.sending') : t('topbar.feedback.send')}
          </button>
        }
      >
        <div className="form-group">
          <label>{t('topbar.feedback.aboutLabel')}</label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                feedbackType === 'ticket' ? 'border-accent bg-accent-tint text-accent' : 'border-line-strong text-ink-muted'
              }`}
              onClick={() => setFeedbackType('ticket')}
              disabled={sendingFeedback}
            >
              {t('topbar.feedback.reportProblem')}
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                feedbackType === 'idea' ? 'border-accent bg-accent-tint text-accent' : 'border-line-strong text-ink-muted'
              }`}
              onClick={() => setFeedbackType('idea')}
              disabled={sendingFeedback}
            >
              {t('topbar.feedback.suggestIdea')}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="feedback-subject">{t('topbar.feedback.subjectLabel')}</label>
          <input
            id="feedback-subject"
            type="text"
            value={feedbackSubject}
            onChange={(e) => setFeedbackSubject(e.target.value)}
            placeholder={
              feedbackType === 'ticket'
                ? t('topbar.feedback.subjectPlaceholderTicket')
                : t('topbar.feedback.subjectPlaceholderIdea')
            }
            disabled={sendingFeedback}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="feedback-message">
            {feedbackType === 'ticket' ? t('topbar.feedback.messageLabelTicket') : t('topbar.feedback.messageLabelIdea')}
          </label>
          <textarea
            id="feedback-message"
            rows={6}
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            placeholder={t('topbar.feedback.messagePlaceholder')}
            disabled={sendingFeedback}
          />
        </div>
      </SlideOver>
    </div>
  );
}
