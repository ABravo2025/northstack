import { useEffect } from 'react';
import { XIcon } from './Icons';

interface SlideOverProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function SlideOver({ open, title, onClose, children, footer }: SlideOverProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div className={`slideover-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`slideover-panel ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="slideover-head">
          <h3 className="slideover-title">{title}</h3>
          <button type="button" className="slideover-close" onClick={onClose} aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="slideover-body">{children}</div>
        {footer && <div className="slideover-foot">{footer}</div>}
      </div>
    </>
  );
}
