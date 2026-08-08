import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import { DownloadIcon } from '../common/Icons';

interface PayslipPreviewModalProps {
  open: boolean;
  onClose: () => void;
  fetchPdf: () => Promise<Blob>;
  // Generic enough by now (title/filename/helper text) to also back the
  // Payroll contract PDF preview (People overview panel) — same
  // fetch-blob-into-an-iframe shape, just not always a payslip. Defaults
  // keep the original payslip callers unchanged.
  title?: string;
  downloadFilename?: string;
  helperText?: string;
}

export default function PayslipPreviewModal({
  open,
  onClose,
  fetchPdf,
  title = 'Payslip preview',
  downloadFilename = 'payslip-preview.pdf',
  helperText = 'Preview only — not sent.',
}: PayslipPreviewModalProps) {
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
      title={title}
      onClose={onClose}
      wide
      footer={
        objectUrl ? (
          <a href={objectUrl} download={downloadFilename} className="btn-primary gap-1.5 inline-flex items-center">
            <DownloadIcon className="h-4 w-4" />
            Download
          </a>
        ) : undefined
      }
    >
      {helperText && <p className="text-sm text-ink-muted mb-3">{helperText}</p>}
      {loading && <p>Loading preview…</p>}
      {error && <div className="alert alert-error">{error}</div>}
      {objectUrl && <iframe src={objectUrl} title={title} style={{ width: '100%', height: '70vh', border: 'none' }} />}
    </Modal>
  );
}
