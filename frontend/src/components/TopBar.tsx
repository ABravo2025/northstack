import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, MenuIcon, UserCircleIcon } from './Icons';
import SlideOver from './SlideOver';
import { useToast } from './ToastProvider';
import { api } from '../api';

interface TopBarProps {
  user: any;
  token: string;
  onLogout: () => void;
  onMenuClick: () => void;
}

export default function TopBar({ user, token, onLogout, onMenuClick }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  const handleSendFeedback = async () => {
    const message = feedbackMessage.trim();
    if (!message) return;
    setSendingFeedback(true);
    try {
      await api.sendFeedback(token, { message, pageUrl: window.location.href });
      toast.success('Thanks! Your feedback was sent.');
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

      <SlideOver
        open={feedbackOpen}
        title="Send feedback"
        onClose={() => setFeedbackOpen(false)}
        footer={
          <button
            type="button"
            className="btn-primary"
            onClick={handleSendFeedback}
            disabled={sendingFeedback || !feedbackMessage.trim()}
          >
            {sendingFeedback ? 'Sending…' : 'Send'}
          </button>
        }
      >
        <div className="form-group">
          <label htmlFor="feedback-message">Found a bug or have an idea?</label>
          <textarea
            id="feedback-message"
            rows={6}
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            placeholder="Tell us what happened or what you'd like to see."
            disabled={sendingFeedback}
            autoFocus
          />
        </div>
      </SlideOver>
    </div>
  );
}
