import type { ViewFilter, ViewSort } from '../api';

export type FieldValueType = 'text' | 'number' | 'date' | 'select' | 'email';

export interface ViewField {
  key: string;
  label: string;
  valueType: FieldValueType;
  selectOptions?: { value: string; color?: string | null }[];
  getValue: (item: any) => string;
}

export const OPERATORS: Record<FieldValueType, { value: string; label: string }[]> = {
  text: [{ value: 'contains', label: 'contains' }],
  email: [{ value: 'contains', label: 'contains' }],
  number: [
    { value: 'eq', label: '=' },
    { value: 'gt', label: '>' },
    { value: 'lt', label: '<' },
  ],
  date: [
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
  ],
  select: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
  ],
};

function customFieldValue(item: any, definitionId: string): string {
  const match = item.customFieldVals?.find((v: any) => v.customFieldDefinitionId === definitionId);
  return match?.value ?? '';
}

interface StatusLike {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
}

interface CatalogEntryLike {
  id: string;
  name: string;
  isActive: boolean;
}

interface CustomFieldLike {
  id: string;
  name: string;
  fieldType: string;
  options: string | null;
  isActive: boolean;
}

function buildCustomFieldColumns(customFields: CustomFieldLike[]): ViewField[] {
  return customFields
    .filter((f) => f.isActive)
    .map((f) => {
      const valueType: FieldValueType =
        f.fieldType === 'number'
          ? 'number'
          : f.fieldType === 'date'
            ? 'date'
            : f.fieldType === 'email'
              ? 'email'
              : f.fieldType === 'select'
                ? 'select'
                : 'text';
      const selectOptions =
        valueType === 'select'
          ? (JSON.parse(f.options || '[]') as string[]).map((opt) => ({ value: opt }))
          : undefined;
      return {
        key: `cf:${f.id}`,
        label: f.name,
        valueType,
        selectOptions,
        getValue: (item: any) => customFieldValue(item, f.id),
      };
    });
}

export function buildEmployeeFields(
  statuses: StatusLike[],
  customFields: CustomFieldLike[],
  departments: CatalogEntryLike[] = [],
  jobTitles: CatalogEntryLike[] = [],
): ViewField[] {
  return [
    {
      key: 'name',
      label: 'Name',
      valueType: 'text',
      getValue: (item: any) => `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(),
    },
    {
      key: 'email',
      label: 'Business Email',
      valueType: 'email',
      getValue: (item: any) => item.email ?? '',
    },
    {
      key: 'personalEmail',
      label: 'Personal Email',
      valueType: 'email',
      getValue: (item: any) => item.personalEmail ?? '',
    },
    {
      key: 'department',
      label: 'Department',
      valueType: 'select',
      selectOptions: departments.filter((d) => d.isActive).map((d) => ({ value: d.name })),
      getValue: (item: any) => item.departmentDefn?.name ?? '',
    },
    {
      key: 'jobTitle',
      label: 'Job Title',
      valueType: 'select',
      selectOptions: jobTitles.filter((j) => j.isActive).map((j) => ({ value: j.name })),
      getValue: (item: any) => item.jobTitleDefn?.name ?? '',
    },
    {
      key: 'status',
      label: 'Status',
      valueType: 'select',
      selectOptions: statuses.filter((s) => s.isActive).map((s) => ({ value: s.name, color: s.color })),
      getValue: (item: any) => item.statusDefn?.name ?? '',
    },
    {
      key: 'startDate',
      label: 'Start Date',
      valueType: 'date',
      getValue: (item: any) => item.startDate ?? '',
    },
    {
      key: 'endDate',
      label: 'End Date',
      valueType: 'date',
      getValue: (item: any) => item.endDate ?? '',
    },
    {
      key: 'contractUrl',
      label: 'Contract URL',
      valueType: 'text',
      getValue: (item: any) => item.contractUrl ?? '',
    },
    {
      key: 'contractType',
      label: 'Contract Type',
      valueType: 'select',
      selectOptions: [{ value: 'Part Time' }, { value: 'Full Time' }],
      getValue: (item: any) =>
        item.contractType === 'part_time' ? 'Part Time' : item.contractType === 'full_time' ? 'Full Time' : '',
    },
    {
      key: 'compensationType',
      label: 'Compensation Type',
      valueType: 'select',
      selectOptions: [{ value: 'Hourly' }, { value: 'Monthly' }],
      getValue: (item: any) =>
        item.compensationType === 'hourly' ? 'Hourly' : item.compensationType === 'monthly' ? 'Monthly' : '',
    },
    {
      key: 'hourlyRate',
      label: 'Hourly Rate',
      valueType: 'number',
      getValue: (item: any) => (item.hourlyRateCents != null ? String(item.hourlyRateCents / 100) : ''),
    },
    {
      key: 'monthlyRate',
      label: 'Monthly Rate',
      valueType: 'number',
      getValue: (item: any) => (item.monthlyRateCents != null ? String(item.monthlyRateCents / 100) : ''),
    },
    ...buildCustomFieldColumns(customFields),
  ];
}

export function buildClientFields(statuses: StatusLike[], customFields: CustomFieldLike[]): ViewField[] {
  return [
    {
      key: 'name',
      label: 'Name',
      valueType: 'text',
      getValue: (item: any) => `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(),
    },
    {
      key: 'email',
      label: 'Email',
      valueType: 'email',
      getValue: (item: any) => item.email ?? '',
    },
    {
      key: 'company',
      label: 'Company',
      valueType: 'text',
      getValue: (item: any) => item.company ?? '',
    },
    {
      key: 'status',
      label: 'Status',
      valueType: 'select',
      selectOptions: statuses.filter((s) => s.isActive).map((s) => ({ value: s.name, color: s.color })),
      getValue: (item: any) => item.statusDefn?.name ?? '',
    },
    ...buildCustomFieldColumns(customFields),
  ];
}

export function findField(fields: ViewField[], key: string): ViewField | undefined {
  return fields.find((f) => f.key === key);
}

export function groupableFields(fields: ViewField[]): ViewField[] {
  return fields.filter((f) => f.valueType === 'select');
}

function matchesFilter(raw: string, filter: ViewFilter): boolean {
  switch (filter.operator) {
    case 'contains':
      return raw.toLowerCase().includes(filter.value.toLowerCase());
    case 'is':
      return raw === filter.value;
    case 'is_not':
      return raw !== filter.value;
    case 'eq':
      return Number(raw) === Number(filter.value);
    case 'gt':
      return Number(raw) > Number(filter.value);
    case 'lt':
      return Number(raw) < Number(filter.value);
    case 'before':
      return raw !== '' && new Date(raw).getTime() < new Date(filter.value).getTime();
    case 'after':
      return raw !== '' && new Date(raw).getTime() > new Date(filter.value).getTime();
    default:
      return true;
  }
}

export function applyFilters<T>(items: T[], fields: ViewField[], filters: ViewFilter[]): T[] {
  if (!filters.length) return items;
  return items.filter((item) =>
    filters.every((filter) => {
      const field = findField(fields, filter.field);
      if (!field || !filter.value) return true;
      return matchesFilter(field.getValue(item), filter);
    }),
  );
}

export function applySort<T>(items: T[], fields: ViewField[], sort: ViewSort | null): T[] {
  if (!sort) return items;
  const field = findField(fields, sort.field);
  if (!field) return items;
  const dir = sort.direction === 'desc' ? -1 : 1;
  return items.slice().sort((a, b) => {
    const av = field.getValue(a);
    const bv = field.getValue(b);
    const numeric = field.valueType === 'number';
    if (numeric) return (Number(av) - Number(bv)) * dir;
    return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
}

export function parseFilters(raw: string | null): ViewFilter[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function parseSort(raw: string | null): ViewSort | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
