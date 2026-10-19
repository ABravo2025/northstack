import { useTranslation } from 'react-i18next';

// The 10 one-time recovery codes, shown once (spec-2fa.md): copy or download as a .txt. Always dark on
// white: the login's side panel is dark in both themes, the profile modal follows the theme.
export default function RecoveryCodes({ codes }: { codes: string[] }) {
  const { t } = useTranslation('auth');
  const text = [t('twoStep.codesFileTitle'), '', ...codes, '', t('twoStep.codesFileNote')].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
    } catch {
      // still visible to copy by hand
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'northstack-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-gray-200 bg-white p-3 font-mono text-sm text-gray-900" aria-label={t('twoStep.codesTitle')}>
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={copy}>
          {t('twoStep.copy')}
        </button>
        <button type="button" className="btn-secondary" onClick={download}>
          {t('twoStep.download')}
        </button>
      </div>
    </div>
  );
}
