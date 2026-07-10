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

  return (
    <div className="header">
      <img src="/logo-horizontal-light.svg" alt="Northstack" />

      <div className="user-menu" ref={menuRef}>
        <button className="user-menu-trigger" onClick={() => setOpen(!open)}>
          <UserCircleIcon className="h-5 w-5" />
          {user.firstName} {user.lastName}
          <ChevronDownIcon className="h-4 w-4" />
        </button>

        {open && (
          <div className="user-menu-dropdown">
            <button
              className="user-menu-item"
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
                onClick={() => {
                  setOpen(false);
                  navigate('/settings');
                }}
              >
                Settings
              </button>
            )}
            <button
              className="user-menu-item"
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
