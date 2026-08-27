import { useEffect, useRef, useState } from 'react';
import { api, type TagAssignmentLite, type TagDefinition, type TaskEntityType } from '../../api';
import { useToast } from './ToastProvider';
import Popover from './Popover';
import { XIcon } from './Icons';

interface TagInputProps {
  token: string;
  entityType: TaskEntityType;
  entityId: string;
  tags: TagAssignmentLite[];
  onChanged: () => void;
}

// Free-form, shared across Contact/Company/Employee (backlog QA, 2026-08-27
// — the user picked "tags libres compartidos" over a predefined per-tenant
// catalog). Typing an existing tag's name reuses it (autocomplete lists
// every tag already used anywhere in the tenant); typing a new one creates
// it on the fly — see tagService.ts's assignTag.
export default function TagInput({ token, entityType, entityId, tags, onChanged }: TagInputProps) {
  const toast = useToast();
  const [allTags, setAllTags] = useState<TagDefinition[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listTagDefinitions(token).then(setAllTags).catch(() => {});
  }, [token]);

  const assignedNames = new Set(tags.map((t) => t.name.toLowerCase()));
  const suggestions = allTags
    .filter((t) => !assignedNames.has(t.name.toLowerCase()))
    .filter((t) => !query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase()));

  const addTag = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await api.addTag(token, entityType, entityId, trimmed);
      setAllTags((prev) => (prev.some((t) => t.name.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, { id: '', tenantId: '', name: trimmed, createdAt: '' }]));
      setQuery('');
      setOpen(false);
      onChanged();
    } catch (error) {
      toast.error('Failed to add tag: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeTag = async (tag: TagAssignmentLite) => {
    try {
      await api.removeTag(token, tag.tagAssignmentId);
      onChanged();
    } catch (error) {
      toast.error('Failed to remove tag: ' + (error as Error).message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center">
        {tags.map((tag) => (
          <span key={tag.tagAssignmentId} className="time-off-policy-chip">
            {tag.name}
            <span className="time-off-policy-chip-remove" onClick={() => removeTag(tag)}>
              <XIcon className="h-3 w-3" />
            </span>
          </span>
        ))}
        <div ref={inputRef} className="inline-block">
          <input
            type="text"
            className="overview-field-input"
            style={{ minWidth: 140 }}
            value={query}
            placeholder="+ Add tag"
            disabled={saving}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(query);
              }
            }}
          />
        </div>
      </div>
      <Popover open={open && (suggestions.length > 0 || query.trim().length > 0)} onClose={() => setOpen(false)} anchorRef={inputRef} width={200}>
        <div className="status-manage-list">
          {suggestions.map((t) => (
            <button key={t.id || t.name} type="button" className="popover-menu-item w-full text-left" onClick={() => addTag(t.name)}>
              {t.name}
            </button>
          ))}
          {query.trim() && !allTags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button type="button" className="popover-menu-item w-full text-left" onClick={() => addTag(query)}>
              Create "{query.trim()}"
            </button>
          )}
        </div>
      </Popover>
    </div>
  );
}
