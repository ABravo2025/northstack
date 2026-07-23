import { useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from './ToastProvider';
import SlideOver from './SlideOver';
import { DownloadIcon, UploadIcon } from './Icons';

interface CsvImportExportMenuProps {
  token: string;
  entityType: 'employee' | 'client';
  onImported: () => void;
}

interface ImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

const LABELS = {
  employee: { plural: 'Employees', filename: 'employees.csv', templateFilename: 'employees-import-template.csv' },
  client: { plural: 'Clients', filename: 'clients.csv', templateFilename: 'clients-import-template.csv' },
};

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

export default function CsvImportExportMenu({ token, entityType, onImported }: CsvImportExportMenuProps) {
  const toast = useToast();
  const label = LABELS[entityType];
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = entityType === 'employee' ? await api.exportEmployeesCsv(token) : await api.exportClientsCsv(token);
      downloadCsvBlob(csv, label.filename);
    } catch (error) {
      toast.error('Failed to export CSV: ' + (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const csv = entityType === 'employee' ? await api.employeesCsvTemplate(token) : await api.clientsCsvTemplate(token);
      downloadCsvBlob(csv, label.templateFilename);
    } catch (error) {
      toast.error('Failed to download template: ' + (error as Error).message);
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
      const res =
        entityType === 'employee' ? await api.importEmployeesCsv(token, csvText) : await api.importClientsCsv(token, csvText);
      setResult(res);
      if (res.created > 0) {
        toast.success(`Imported ${res.created} ${res.created === 1 ? label.plural.slice(0, -1) : label.plural.toLowerCase()}.`);
        onImported();
      }
    } catch (error) {
      toast.error('Failed to import CSV: ' + (error as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <button type="button" className="tb-btn" onClick={handleExport} disabled={exporting} aria-label={`Export ${label.plural} to CSV`} title="Export to CSV">
        <DownloadIcon />
      </button>
      <button
        type="button"
        className="tb-btn"
        onClick={() => {
          resetImportState();
          setImportOpen(true);
        }}
        aria-label={`Import ${label.plural} from CSV`}
        title="Import from CSV"
      >
        <UploadIcon />
      </button>

      <SlideOver open={importOpen} title={`Import ${label.plural} from CSV`} onClose={() => setImportOpen(false)}>
        <div className="nv-field">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Upload a CSV file with a header row. Not sure of the columns? Download a template below — it has the exact
            column names and one filled-in example row showing the expected format (e.g. dates as YYYY-MM-DD).
          </p>
          <button type="button" className="btn-secondary mt-2" onClick={handleDownloadTemplate} disabled={downloadingTemplate}>
            {downloadingTemplate ? 'Downloading…' : 'Download CSV template'}
          </button>
        </div>
        <div className="nv-field">
          <label htmlFor="csv-file-input">CSV file</label>
          <input id="csv-file-input" ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChosen} />
        </div>
        {fileName && (
          <div className="nv-field">
            <button type="button" className="btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${fileName}`}
            </button>
          </div>
        )}
        {result && (
          <div className="nv-field">
            <p className="text-sm font-semibold text-brand-navy dark:text-gray-100">
              {result.created} {result.created === 1 ? label.plural.slice(0, -1).toLowerCase() : label.plural.toLowerCase()} imported.
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-semibold text-red-600">{result.errors.length} row(s) had errors:</p>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-red-600">
                  {result.errors.map((err, i) => (
                    <li key={i}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </>
  );
}
