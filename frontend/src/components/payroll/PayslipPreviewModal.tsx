import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import { DownloadIcon } from '../common/Icons';

interface PayslipPreviewModalProps {
  open: boolean;
  onClose: () => void;
  fetchPdf: () => Promise<Blob>;
}

// Reusable across the run detail screen (a person's entries within a run)
// and any future loose-entry payslip trigger — both backend endpoints return
// the same "preview, not issued" PDF shape (Unidad 20).
export default function PayslipPreviewModal({ open, onClose, fetchPdf }: PayslipPreviewModalProps) {
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
      title="Payslip preview"
      onClose={onClose}
      wide
      footer={
        objectUrl ? (
          <a href={objectUrl} download="payslip-preview.pdf" className="btn-primary gap-1.5 inline-flex items-center">
            <DownloadIcon className="h-4 w-4" />
            Download
          </a>
        ) : undefined
      }
    >
      <p className="text-sm text-ink-muted mb-3">Preview only — not sent.</p>
      {loading && <p>Loading preview…</p>}
      {error && <div className="alert alert-error">{error}</div>}
      {objectUrl && <iframe src={objectUrl} title="Payslip preview" style={{ width: '100%', height: '70vh', border: 'none' }} />}
    </Modal>
  );
}
