import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import { DownloadIcon } from '../common/Icons';

interface PayslipPreviewModalProps {
  open: boolean;
  onClose: () => void;
  fetchPdf: () => Promise<Blob>;
  // Generic enough by now (title/filename/helper text) to also back the
  // Payroll contract PDF preview (People overview panel) — same
  // fetch-blob-into-an-iframe shape, just not always a payslip. Defaults
  // (translated payslip-preview copy) keep the original payslip callers
  // unchanged; left undefined here (not given a literal default) so the
  // translated fallback can be resolved inside the component body, where
  // useTranslation's `t` is actually available.
  title?: string;
  downloadFilename?: string;
  helperText?: string;
}

export default function PayslipPreviewModal({
  open,
  onClose,
  fetchPdf,
  title,
  // Not translated — a downloaded filename is a technical/system value, not
  // UI copy a user reads on screen (the hard rule's target).
  downloadFilename = 'payslip-preview.pdf',
  helperText,
}: PayslipPreviewModalProps) {
  const { t } = useTranslation('hr');
  const resolvedTitle = title ?? t('payroll.payslipPreview.title');
  const resolvedHelperText = helperText ?? t('payroll.payslipPreview.helperText');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let currentUrl: string | null = null;
    setLoading(true);
    setError(null);
    setObjectUrl(null);

    fetchPdf()
      .then((blob) => {
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));

    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      title={resolvedTitle}
      onClose={onClose}
      wide
      footer={
        objectUrl ? (
          <a href={objectUrl} download={downloadFilename} className="btn-primary gap-1.5 inline-flex items-center">
            <DownloadIcon className="h-4 w-4" />
            {t('payroll.payslipPreview.download')}
          </a>
        ) : undefined
      }
    >
      {resolvedHelperText && <p className="text-sm text-ink-muted mb-3">{resolvedHelperText}</p>}
      {loading && <p>{t('payroll.payslipPreview.loading')}</p>}
      {error && <div className="alert alert-error">{error}</div>}
      {objectUrl && <iframe src={objectUrl} title={resolvedTitle} style={{ width: '100%', height: '70vh', border: 'none' }} />}
    </Modal>
  );
}
