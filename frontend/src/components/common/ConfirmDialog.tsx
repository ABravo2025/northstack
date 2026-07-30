import { useState } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** If set, the confirm button stays disabled until the user types this exact text. */
  confirmText?: string;
  /** Extra external condition (e.g. an in-flight save) that also disables the confirm button. */
  confirmDisabled?: boolean;
  /** If set, renders an opt-in checkbox above the actions (e.g. "also delete N linked records"). */
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  confirmText,
  confirmDisabled = false,
  checkboxLabel,
  checkboxChecked = false,
  onCheckboxChange,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const canConfirm = (!confirmText || typed === confirmText) && !confirmDisabled;

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-dialog-title" className="confirm-dialog-title">
          {title}
        </h3>
        <p className="confirm-dialog-message">{message}</p>
        {checkboxLabel && (
          <label className="flex items-center gap-2 text-sm mb-2">
            <input
              type="checkbox"
              checked={checkboxChecked}
              onChange={(e) => onCheckboxChange?.(e.target.checked)}
            />
            {checkboxLabel}
          </label>
        )}
        {confirmText && (
          <div className="form-group">
            <label htmlFor="confirm-dialog-type-input" className="sr-only">
              Type {confirmText} to confirm
            </label>
            <input
              id="confirm-dialog-type-input"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmText}
              autoFocus
              autoComplete="off"
            />
          </div>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={!canConfirm}
            autoFocus={!confirmText}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
