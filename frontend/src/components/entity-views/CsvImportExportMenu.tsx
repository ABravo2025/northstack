import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../common/ToastProvider';
import SlideOver from '../common/SlideOver';
import RequiredMark from '../common/RequiredMark';
import { DownloadIcon, UploadIcon } from '../common/Icons';

interface ImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

interface CsvImportExportMenuProps {
  token: string;
  onImported: () => void;
  // Plural label shown in button titles/toasts (e.g. "Companies") and the filenames the
  // downloaded files use (lowercased — e.g. "companies.csv"/"companies-import-template.csv").
  entityLabelPlural: string;
  // Singular form for the "N created" toast/result message (e.g. "Company") — not derived
  // from the plural (naive "strip trailing s" breaks on Company -> Companie).
  entityLabelSingular: string;
  exportCsv: (token: string) => Promise<string>;
  importCsv: (token: string, csv: string) => Promise<ImportResult>;
  csvTemplate: (token: string) => Promise<string>;
  // Custom Roles Fase J — Company/Contact gate export by view_company/view_contact and
  // import+template by manage_company/manage_contact (2 different real permissions on the same
  // menu), unlike Employee where both are uniformly gated by manage_payroll one level up by the
  // caller. Both default to true so existing single-permission callers (Employee) don't need to
  // pass anything.
  canExport?: boolean;
  canImport?: boolean;
}

export interface CsvImportExportMenuHandle {
  openImport: () => void;
}

function downloadCsvBlob(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const CsvImportExportMenu = forwardRef<CsvImportExportMenuHandle, CsvImportExportMenuProps>(function CsvImportExportMenu(
  { token, onImported, entityLabelPlural, entityLabelSingular, exportCsv, importCsv, csvTemplate, canExport = true, canImport = true },
  ref,
) {
  const filenameBase = entityLabelPlural.toLowerCase();
  const { t } = useTranslation();
  const toast = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    openImport: () => {
      resetImportState();
      setImportOpen(true);
    },
  }));

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await exportCsv(token);
      downloadCsvBlob(csv, `${filenameBase}.csv`);
    } catch (error) {
      toast.error(t('csvImport.exportFailed', { message: (error as Error).message }));
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const csv = await csvTemplate(token);
      downloadCsvBlob(csv, `${filenameBase}-import-template.csv`);
    } catch (error) {
      toast.error(t('csvImport.templateDownloadFailed', { message: (error as Error).message }));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const resetImportState = () => {
    setFileName('');
    setCsvText('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setCsvText(await file.text());
  };

  const handleImport = async () => {
    if (!csvText.trim()) return;
    setImporting(true);
    try {
      const res = await importCsv(token, csvText);
      setResult(res);
      if (res.created > 0) {
        toast.success(
          t('csvImport.importedCount', {
            count: res.created,
            entity: res.created === 1 ? entityLabelSingular : entityLabelPlural.toLowerCase(),
          }),
        );
        onImported();
      }
    } catch (error) {
      toast.error(t('csvImport.importFailed', { message: (error as Error).message }));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      {canExport && (
        <button
          type="button"
          className="tb-btn"
          onClick={handleExport}
          disabled={exporting}
          aria-label={t('csvImport.exportAriaLabel', { entity: entityLabelPlural })}
          title={t('csvImport.exportTitle')}
        >
          <DownloadIcon />
        </button>
      )}
      {canImport && (
        <button
          type="button"
          className="tb-btn"
          onClick={() => {
            resetImportState();
            setImportOpen(true);
          }}
          aria-label={t('csvImport.importAriaLabel', { entity: entityLabelPlural })}
          title={t('csvImport.importTitle')}
        >
          <UploadIcon />
        </button>
      )}

      <SlideOver
        open={importOpen && canImport}
        title={t('csvImport.importSlideOverTitle', { entity: entityLabelPlural })}
        onClose={() => setImportOpen(false)}
      >
        <div className="nv-field">
          <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('csvImport.uploadInstructions')}</p>
          <button type="button" className="btn-secondary mt-2" onClick={handleDownloadTemplate} disabled={downloadingTemplate}>
            {downloadingTemplate ? t('csvImport.downloading') : t('csvImport.downloadTemplate')}
          </button>
        </div>
        <div className="nv-field">
          <label htmlFor="csv-file-input">
            {t('csvImport.csvFileLabel')}
            <RequiredMark />
          </label>
          <input
            id="csv-file-input"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChosen}
            required
          />
        </div>
        {fileName && (
          <div className="nv-field">
            <button type="button" className="btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? t('csvImport.importing') : t('csvImport.importFile', { fileName })}
            </button>
          </div>
        )}
        {result && (
          <div className="nv-field">
            <p className="text-sm font-semibold text-brand-navy dark:text-dark-ink">
              {t('csvImport.importedCount', {
                count: result.created,
                entity: result.created === 1 ? entityLabelSingular.toLowerCase() : entityLabelPlural.toLowerCase(),
              })}
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-semibold text-red-600">{t('csvImport.rowsHadErrors', { count: result.errors.length })}</p>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-red-600">
                  {result.errors.map((err, i) => (
                    <li key={i}>{t('csvImport.rowError', { row: err.row, message: err.message })}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </>
  );
});

export default CsvImportExportMenu;
