import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { PayslipVerification } from '../../api';
import { CheckIcon } from '../../components/common/Icons';

// Payroll v2 (unit 5): the page behind the QR / code printed on a payslip. Public: it only says
// whether the payslip exists, who issued it, its number and period — never amounts.
export default function VerifyPayslipPage() {
  const { t, i18n } = useTranslation('hr');
  const { code = '' } = useParams();
  const [result, setResult] = useState<PayslipVerification | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    api
      .verifyPayslip(code)
      .then(setResult)
      .catch(() => setInvalid(true));
  }, [code]);

  const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="page">
      <div className="header">
        <img src="/logo-horizontal-light.svg" alt="Northstack" className="dark:hidden" />
        <img src="/logo-horizontal-dark.svg" alt="Northstack" className="hidden dark:block" />
      </div>
      <div className="container">
        <div className="card mx-auto mt-10 flex max-w-lg flex-col gap-3">
          <h2 className="m-0">{t('payroll.verify.title')}</h2>
          {!result && !invalid && <p className="m-0 text-ink-muted dark:text-dark-ink-muted">{t('payroll.verify.loading')}</p>}
          {invalid && (
            <>
              <p className="m-0 font-semibold text-red-700 dark:text-red-300">{t('payroll.verify.invalid', { code })}</p>
              <p className="m-0 text-ink-muted dark:text-dark-ink-muted">{t('payroll.verify.invalidBody')}</p>
            </>
          )}
          {result && (
            <>
              {result.voidedAt ? (
                <p className="m-0 font-semibold text-red-700 dark:text-red-300">{t('payroll.verify.voided')}</p>
              ) : (
                <p className="m-0 inline-flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckIcon className="h-5 w-5" />
                  {t('payroll.verify.valid')}
                </p>
              )}
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                <dt className="text-ink-muted dark:text-dark-ink-muted">{t('payroll.verify.company')}</dt><dd className="m-0 font-medium">{result.company}</dd>
                <dt className="text-ink-muted dark:text-dark-ink-muted">{t('payroll.verify.number')}</dt><dd className="m-0 font-mono">{result.number}</dd>
                <dt className="text-ink-muted dark:text-dark-ink-muted">{t('payroll.verify.person')}</dt><dd className="m-0">{result.employee}</dd>
                <dt className="text-ink-muted dark:text-dark-ink-muted">{t('payroll.verify.period')}</dt><dd className="m-0">{result.periodLabel}</dd>
                <dt className="text-ink-muted dark:text-dark-ink-muted">{t('payroll.verify.paymentDate')}</dt><dd className="m-0">{day(result.paymentDate)}</dd>
                <dt className="text-ink-muted dark:text-dark-ink-muted">{t('payroll.verify.issued')}</dt><dd className="m-0">{day(result.issuedAt)}</dd>
              </dl>
              <p className="rules-hint m-0">{t('payroll.verify.note')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
