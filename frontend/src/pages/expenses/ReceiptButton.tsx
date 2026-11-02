import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ExpenseMovement } from '../../api';
import { PaperclipIcon, XIcon } from '../../components/common/Icons';
import { useToast } from '../../components/common/ToastProvider';

// Cruces D4: attach the receipt of an expense (PDF / JPG / PNG / WEBP, up to 1 MB), stored
// encrypted. Click to attach; with one attached, open it or remove it.
const MAX = 1024 * 1024;

export default function ReceiptButton({ token, movement, onChanged }: { token: string; movement: ExpenseMovement; onChanged: (m: ExpenseMovement) => void }) {
  const { t } = useTranslation('expenses');
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX) {
      toast.error(t('receipt.tooLarge'));
      return;
    }
    setBusy(true);
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
      const receipt = await api.uploadExpenseReceipt(token, movement.id, { fileName: file.name, mimeType: file.type, data: btoa(binary) });
      onChanged({ ...movement, receipt });
      toast.success(t('receipt.saved'));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    try {
      const blob = await api.downloadExpenseReceipt(token, movement.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async () => {
    try {
      await api.deleteExpenseReceipt(token, movement.id);
      onChanged({ ...movement, receipt: null });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} />
      {movement.receipt ? (
        <>
          <button type="button" className="icon-btn text-accent dark:text-brand-blue-light" title={t('receipt.open')} aria-label={t('receipt.open')} onClick={open}>
            <PaperclipIcon className="h-4 w-4" />
          </button>
          <button type="button" className="icon-btn" title={t('receipt.remove')} aria-label={t('receipt.remove')} onClick={remove}>
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <button type="button" className="icon-btn ex-muted text-xs" disabled={busy} title={t('receipt.attach')} aria-label={t('receipt.attach')} onClick={() => input.current?.click()}>
          <PaperclipIcon className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}
