import { useEffect } from 'react';
import { XIcon } from './Icons';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  // Wider still than `wide` (768px) — for content that genuinely needs more
  // room side-by-side, like a 3-card pricing comparison (PlansModal). Kept
  // as its own prop rather than widening `wide` itself, so existing
  // "wide" call sites (entity Add forms) don't change shape.
  xwide?: boolean;
}

// Centered, backdrop-covered modal for small standalone forms — distinct
// from SlideOver, which is the default for "entity" forms living inside a
// page's existing flow. Same open/title/onClose/footer API as SlideOver so
// call sites read the same way; reach for this only when a design
// explicitly calls for a centered dialog instead of a side panel.
export default function Modal({ open, title, onClose, children, footer, wide = false, xwide = false }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Stop this from also reaching a parent detail panel's own Escape
      // listener (EmployeeOverviewPanel/CompanyDetailModal etc. close on
      // Escape too, via a `window` keydown listener) — document is a real
      // ancestor of window in the bubble path, so plain stopPropagation()
      // (unlike the document-vs-document case in Popover.tsx) is enough
      // here. Without it, opening a Modal from inside one of those panels
      // and pressing Escape closed both layers at once instead of just the
      // modal on top (found 2026-08-08 via the Payroll contract-preview
      // modal opened from the People overview panel).
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-panel ${wide ? 'wide' : ''} ${xwide ? 'xwide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
