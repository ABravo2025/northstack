import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { DateRange } from '../../lib/dateRangePresets';

// Shared by the Dashboards pages that need it (standing rule: every metric has the period and a
// department filter). The period comes from DashboardsLayout; the department lives on the page.

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function dashboardDates(range: DateRange) {
  return { from: localDate(range.since), to: localDate(range.until) };
}

export function DepartmentFilter({ token, value, onChange, hint }: { token: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const { t } = useTranslation('crm');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api
      .listFieldCatalogDefinitions(token, 'department')
      .then((rows) => setDepartments(rows.filter((r) => r.isActive).map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setDepartments([]));
  }, [token]);
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="ex-field">
        {t('clientsDash.department')}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('clientsDash.allDepartments')}</option>
          <option value="none">{t('clientsDash.noDepartment')}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      {hint && <span className="ex-hint mb-2">{hint}</span>}
    </div>
  );
}
