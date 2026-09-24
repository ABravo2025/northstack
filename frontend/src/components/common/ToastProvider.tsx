import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ToastType = 'success' | 'error';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const SUCCESS_DURATION_MS = 5000;
const ERROR_DURATION_MS = 8000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, type, message }]);
      window.setTimeout(() => dismiss(id), type === 'error' ? ERROR_DURATION_MS : SUCCESS_DURATION_MS);
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container">
        {toasts.map((toastItem) => (
          <div key={toastItem.id} className={`toast toast-${toastItem.type}`}>
            <span>{toastItem.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(toastItem.id)}
              aria-label={t('toast.dismiss')}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
