import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, MenuIcon, UserCircleIcon } from '../common/Icons';
import SlideOver from '../common/SlideOver';
import ChangelogMenu from './ChangelogMenu';
import { useToast } from '../common/ToastProvider';
import { api } from '../../api';

interface TopBarProps {
  user: any;
  token: string;
  onLogout: () => void;
  onMenuClick: () => void;
}

export default function TopBar({ user, token, onLogout, onMenuClick }: TopBarProps) {
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
      toast.success('Thanks! Your feedback was sent.');
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
        <button type="button" className="menu-toggle" onClick={onMenuClick} aria-label="Open menu">
          <MenuIcon className="h-5 w-5" />
        </button>
        <img src="/logo-horizontal-light.svg" alt="Northstack" className="dark:hidden" />
        <img src="/logo-horizontal-dark.svg" alt="Northstack" className="hidden dark:block" />
      </div>

      <div className="flex items-center gap-2">
      <ChangelogMenu />
      <div className="user-menu" ref={menuRef}>
        <button
          ref={triggerRef}
          className="user-menu-trigger"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
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
                navigate('/help');
              }}
            >
              Help &amp; FAQ
            </button>
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setFeedbackOpen(true);
              }}
            >
              Send feedback
            </button>
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Logout
            </button>
          </div>
        )}
      </div>
      </div>

      <SlideOver
        open={feedbackOpen}
        title="Send feedback"
        onClose={() => setFeedbackOpen(false)}
        footer={
          <button
            type="button"
            className="btn-primary"
            onClick={handleSendFeedback}
            disabled={sendingFeedback || !feedbackMessage.trim() || !feedbackSubject.trim()}
          >
            {sendingFeedback ? 'Sending…' : 'Send'}
          </button>
        }
      >
        <div className="form-group">
          <label>What's this about?</label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                feedbackType === 'ticket' ? 'border-accent bg-accent-tint text-accent' : 'border-line-strong text-ink-muted'
              }`}
              onClick={() => setFeedbackType('ticket')}
              disabled={sendingFeedback}
            >
              Report a problem
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                feedbackType === 'idea' ? 'border-accent bg-accent-tint text-accent' : 'border-line-strong text-ink-muted'
              }`}
              onClick={() => setFeedbackType('idea')}
              disabled={sendingFeedback}
            >
              Suggest an idea
            </button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="feedback-subject">Subject</label>
          <input
            id="feedback-subject"
            type="text"
            value={feedbackSubject}
            onChange={(e) => setFeedbackSubject(e.target.value)}
            placeholder={feedbackType === 'ticket' ? "What's the problem, in a few words?" : "What's your idea, in a few words?"}
            disabled={sendingFeedback}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="feedback-message">{feedbackType === 'ticket' ? 'What happened?' : 'Tell us more'}</label>
          <textarea
            id="feedback-message"
            rows={6}
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            placeholder="Tell us what happened or what you'd like to see."
            disabled={sendingFeedback}
          />
        </div>
      </SlideOver>
    </div>
  );
}
