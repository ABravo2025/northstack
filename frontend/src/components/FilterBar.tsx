import { useRef, useState } from 'react';
import type { ViewFilter } from '../api';
import { OPERATORS, type ViewField } from '../lib/viewFields';
import Popover from './Popover';
import { FilterIcon, PlusIcon, XIcon } from './Icons';

interface FilterBarProps {
  fields: ViewField[];
  filters: ViewFilter[];
  onChange: (filters: ViewFilter[]) => void;
}

export default function FilterBar({ fields, filters, onChange }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updateFilter = (index: number, patch: Partial<ViewFilter>) => {
    const next = filters.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange(next);
  };

  const addFilter = () => {
    const first = fields[0];
    if (!first) return;
    onChange([...filters, { field: first.key, operator: OPERATORS[first.valueType][0].value, value: '' }]);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="tb-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={filters.length > 0 ? `Filter (${filters.length} active)` : 'Filter'}
        title="Filter"
      >
        <FilterIcon />
        {filters.length > 0 && <span className="filter-count">{filters.length}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={buttonRef} width={320}>
        {filters.map((filter, index) => {
          const field = fields.find((f) => f.key === filter.field) ?? fields[0];
          const ops = field ? OPERATORS[field.valueType] : [];
          return (
            <div className="filter-row" key={index}>
              <select
                className="field-sel"
                value={filter.field}
                onChange={(e) => {
                  const nextField = fields.find((f) => f.key === e.target.value);
                  updateFilter(index, {
                    field: e.target.value,
                    operator: nextField ? OPERATORS[nextField.valueType][0].value : filter.operator,
                    value: '',
                  });
                }}
              >
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select className="op-sel" value={filter.operator} onChange={(e) => updateFilter(index, { operator: e.target.value })}>
                {ops.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              {field?.valueType === 'select' ? (
                <select
                  className="val-input"
                  value={filter.value}
                  onChange={(e) => updateFilter(index, { value: e.target.value })}
                >
                  <option value="">-- select --</option>
                  {field.selectOptions?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="val-input"
                  type={field?.valueType === 'date' ? 'date' : field?.valueType === 'number' ? 'number' : 'text'}
                  value={filter.value}
                  onChange={(e) => updateFilter(index, { value: e.target.value })}
                />
              )}
              <span className="rm-filter" onClick={() => removeFilter(index)}>
                <XIcon />
              </span>
            </div>
          );
        })}
        <button type="button" className="add-filter-btn" onClick={addFilter} disabled={fields.length === 0}>
          <PlusIcon />
          Add filter
        </button>
      </Popover>
    </>
  );
}
