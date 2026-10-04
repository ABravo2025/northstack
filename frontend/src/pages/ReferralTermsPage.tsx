import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../components/common/AuthLayout';
import { API_BASE_URL, apiFetch, throwApiError } from '../api/http';
import type { ReferralRules } from '../api/referrals';
import { TermsList } from './ReferralsSettingsPage';

// Referral program terms (2026-10-04) — public, linked from the join form. The numbers come from
// the backend's REFERRAL config, so this page can't drift from what's actually applied.
export default function ReferralTermsPage() {
  const { t } = useTranslation('settingsPages');
  const [rules, setRules] = useState<ReferralRules | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`${API_BASE_URL}/api/public/referral-rules`)
      .then(async (res) => {
        if (!res.ok) await throwApiError(res);
        setRules(await res.json());
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <AuthLayout>
      <h2 className="auth-title">{t('referrals.terms.title')}</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {rules && (
        <div className="text-sm leading-relaxed">
          <TermsList rules={rules} onDark />
        </div>
      )}
    </AuthLayout>
  );
}
