import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Tenant, type TenantProfileUpdate } from '../api';
import { useToast } from '../components/common/ToastProvider';
import { CURRENCY_CODES, currencyLabel } from '../lib/currencies';
import { COMPANY_SIZE_OPTIONS } from '../lib/companySize';
import { COUNTRIES } from '../lib/countries';
import { resizeLogoFile, tenantLogoUrl } from '../lib/tenantLogo';

// Settings → Company (2026-09-25) — replaces the old Settings → Appearance page, which only held
// currency + the theme picker. The theme moved to Settings → Profile, since it's a per-device
// preference every user should reach, not a tenant setting behind manage_tenant_settings.
// Deliberately no tax ID field (privacy policy).

type ProfileForm = Required<Omit<TenantProfileUpdate, 'currency'>>;

function toForm(tenant: Tenant): ProfileForm {
  return {
    name: tenant.name,
    legalName: tenant.legalName ?? '',
    address: tenant.address ?? '',
    phone: tenant.phone ?? '',
    website: tenant.website ?? '',
    companySize: tenant.companySize ?? '',
    industry: tenant.industry ?? '',
    country: tenant.country ?? '',
  };
}

interface CompanyPageProps {
  token: string;
  onTenantUpdated: (tenant: Tenant) => void;
}

export default function CompanyPage({ token, onTenantUpdated }: CompanyPageProps) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyTenant = (updated: Tenant) => {
    setTenant(updated);
    onTenantUpdated(updated);
  };

  useEffect(() => {
    api
      .getCurrentTenant(token)
      .then((loaded) => {
        setTenant(loaded);
        setForm(toForm(loaded));
      })
      .catch((error) => toast.error(t('company.loadError', { message: (error as Error).message })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const setField = (field: keyof ProfileForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFieldError(null);
    setSaving(true);
    try {
      const updated = await api.updateTenantProfile(token, form);
      applyTenant(updated);
      setForm(toForm(updated));
      toast.success(t('company.saved'));
    } catch (error) {
      const field = (error as { field?: string }).field;
      if (field) {
        setFieldError({ field, message: (error as Error).message });
      } else {
        toast.error(t('company.saveError', { message: (error as Error).message }));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogoPicked = async (file: File | undefined) => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    const resized = await resizeLogoFile(file);
    if ('error' in resized) {
      toast.error(t(`company.logo.error.${resized.error}`));
      return;
    }
    setLogoBusy(true);
    try {
      applyTenant(await api.uploadTenantLogo(token, resized.dataUrl));
      toast.success(t('company.logo.uploaded'));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoRemove = async () => {
    setLogoBusy(true);
    try {
      applyTenant(await api.removeTenantLogo(token));
      toast.success(t('company.logo.removed'));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };

  const handleCurrencyChange = async (value: string) => {
    if (!tenant) return;
    setSavingCurrency(true);
    try {
      applyTenant(await api.updateTenantProfile(token, { currency: value }));
      toast.success(t('company.currencyUpdated'));
    } catch (error) {
      toast.error(t('company.currencyUpdateError', { message: (error as Error).message }));
    } finally {
      setSavingCurrency(false);
    }
  };

  const errorFor = (field: string) =>
    fieldError?.field === field ? <p className="field-error">{fieldError.message}</p> : null;

  const logoUrl = tenantLogoUrl(tenant);

  return (
    <div className="max-w-6xl flex flex-col gap-4">
      <div className="card">
        <h3 className="card-title">{t('company.detailsTitle')}</h3>
        <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t('company.detailsHelp')}</p>
        {form && (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-x-4 md:grid-cols-2">
              <div className="form-group">
                <label htmlFor="company-name">{t('company.name')}</label>
                <input id="company-name" value={form.name} onChange={(e) => setField('name', e.target.value)} required maxLength={120} />
                {errorFor('name')}
              </div>
              <div className="form-group">
                <label htmlFor="company-legalName">{t('company.legalName')}</label>
                <input id="company-legalName" value={form.legalName} onChange={(e) => setField('legalName', e.target.value)} maxLength={200} />
                {errorFor('legalName')}
              </div>
              <div className="form-group">
                <label htmlFor="company-industry">{t('company.industry')}</label>
                <input
                  id="company-industry"
                  value={form.industry}
                  onChange={(e) => setField('industry', e.target.value)}
                  placeholder={t('company.industryPlaceholder')}
                  maxLength={100}
                />
                {errorFor('industry')}
              </div>
              <div className="form-group">
                <label htmlFor="company-size">{t('company.size')}</label>
                <select id="company-size" value={form.companySize} onChange={(e) => setField('companySize', e.target.value)}>
                  <option value="">—</option>
                  {COMPANY_SIZE_OPTIONS.map((band) => (
                    <option key={band} value={band}>
                      {t('company.sizeOption', { band })}
                    </option>
                  ))}
                </select>
                {errorFor('companySize')}
              </div>
              <div className="form-group">
                <label htmlFor="company-country">{t('company.country')}</label>
                <select id="company-country" value={form.country} onChange={(e) => setField('country', e.target.value)}>
                  <option value="">—</option>
                  {/* Keeps a legacy/free-text value selectable even if it isn't in the list. */}
                  {form.country && !COUNTRIES.includes(form.country) && <option value={form.country}>{form.country}</option>}
                  {COUNTRIES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {errorFor('country')}
              </div>
              <div className="form-group">
                <label htmlFor="company-phone">{t('company.phone')}</label>
                <input id="company-phone" type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} maxLength={40} />
                {errorFor('phone')}
              </div>
              <div className="form-group md:col-span-2">
                <label htmlFor="company-address">{t('company.address')}</label>
                <input id="company-address" value={form.address} onChange={(e) => setField('address', e.target.value)} maxLength={300} />
                {errorFor('address')}
              </div>
              <div className="form-group md:col-span-2">
                <label htmlFor="company-website">{t('company.website')}</label>
                <input
                  id="company-website"
                  value={form.website}
                  onChange={(e) => setField('website', e.target.value)}
                  placeholder="https://"
                  maxLength={200}
                />
                {errorFor('website')}
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? t('company.saving') : t('company.save')}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">{t('company.logo.title')}</h3>
        <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t('company.logo.help')}</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-40 items-center justify-center rounded-md border border-dashed border-line bg-surface-0 p-2 dark:border-dark-line dark:bg-dark-page">
            {logoUrl ? (
              <img src={logoUrl} alt={t('company.logo.alt')} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('company.logo.none')}</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => handleLogoPicked(e.target.files?.[0])}
            />
            <button type="button" className="btn-secondary" disabled={logoBusy || !tenant} onClick={() => fileInputRef.current?.click()}>
              {logoUrl ? t('company.logo.replace') : t('company.logo.upload')}
            </button>
            {logoUrl && (
              <button type="button" className="btn-danger" disabled={logoBusy} onClick={handleLogoRemove}>
                {t('company.logo.remove')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">{t('company.currencyTitle')}</h3>
        <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t('company.currencyHelp')}</p>
        <div className="nv-field max-w-xs">
          <label htmlFor="company-currency">{t('company.currency')}</label>
          <select
            id="company-currency"
            value={tenant?.currency ?? ''}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            disabled={savingCurrency || !tenant}
          >
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
