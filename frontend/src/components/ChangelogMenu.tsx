import { useEffect, useRef, useState } from 'react';
import Popover from './Popover';
import { BellIcon } from './Icons';
import { CHANGELOG_ENTRIES } from '../lib/changelog';

const LAST_SEEN_KEY = 'northstack:changelogLastSeen';

export default function ChangelogMenu() {
  const [open, setOpen] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    const latest = CHANGELOG_ENTRIES[0]?.id;
    setHasUnseen(!!latest && lastSeen !== latest);
  }, []);

  const handleOpen = () => {
    setOpen((v) => !v);
    const latest = CHANGELOG_ENTRIES[0]?.id;
    if (latest) {
      localStorage.setItem(LAST_SEEN_KEY, latest);
      setHasUnseen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="changelog-trigger"
        onClick={handleOpen}
        aria-label={hasUnseen ? "What's new (new updates available)" : "What's new"}
        title="What's new"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {hasUnseen && <span className="changelog-dot" />}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} align="right" width={320}>
        <div className="changelog-list">
          <div className="color-picker-section-label">What's new</div>
          {CHANGELOG_ENTRIES.map((entry) => (
            <div className="changelog-entry" key={entry.id}>
              <div className="changelog-entry-date">{entry.date}</div>
              <div className="changelog-entry-title">{entry.title}</div>
              <p className="changelog-entry-desc">{entry.description}</p>
            </div>
          ))}
        </div>
      </Popover>
    </>
  );
}
