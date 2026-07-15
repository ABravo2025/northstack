import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, UserCircleIcon } from './Icons';

interface TopBarProps {
  user: any;
  onLogout: () => void;
}

export default function TopBar({ user, onLogout }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const isAdmin = user.role === 'owner' || user.role === 'admin';

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
      <img src="/logo-horizontal-light.svg" alt="Northstack" />

      <div className="user-menu" ref={menuRef}>
        <button
          ref={triggerRef}
          className="user-menu-trigger"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <UserCircleIcon className="h-5 w-5" />
          {user.firstName} {user.lastName}
          <ChevronDownIcon className="h-4 w-4" />
        </button>

        {open && (
          <div className="user-menu-dropdown" role="menu">
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/profile');
              }}
            >
              Profile
            </button>
            {isAdmin && (
              <button
                className="user-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate('/company');
                }}
              >
                Company Settings
              </button>
            )}
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
  );
}
