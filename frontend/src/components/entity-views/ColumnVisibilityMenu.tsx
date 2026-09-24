import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Popover from '../common/Popover';
import { EyeIcon } from '../common/Icons';

interface ColumnVisibilityMenuProps {
  columns: { key: string; label: string }[];
  isHidden: (key: string) => boolean;
  onToggle: (key: string) => void;
}

export default function ColumnVisibilityMenu({ columns, isHidden, onToggle }: ColumnVisibilityMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hiddenCount = columns.filter((c) => isHidden(c.key)).length;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="tb-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={hiddenCount > 0 ? t('entityViews.columns.ariaLabelHidden', { count: hiddenCount }) : t('entityViews.columns.ariaLabel')}
        title={t('entityViews.columns.title')}
      >
        <EyeIcon />
        {hiddenCount > 0 && <span className="filter-count">{hiddenCount}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={220}>
        <div onClick={(e) => e.stopPropagation()}>
          <div className="color-picker-section-label">{t('entityViews.columns.sectionLabel')}</div>
          <div className="col-visibility-list">
            {columns.map((col) => (
              <label className="col-visibility-row" key={col.key}>
                <input type="checkbox" checked={!isHidden(col.key)} onChange={() => onToggle(col.key)} />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}
