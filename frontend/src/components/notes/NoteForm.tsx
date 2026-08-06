import { useEffect, useState } from 'react';
import type { Note } from '../../api';
import RequiredMark from '../common/RequiredMark';
import { TrashIcon, XIcon } from '../common/Icons';

export interface NoteFormPayload {
  title: string;
  description: string;
}

interface NoteFormProps {
  note: Note | null; // null = composing a new note
  onSubmit: (payload: NoteFormPayload) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onCancelEdit?: () => void;
}

// Always-expanded compose form for the right-column "Notes" tab — same
// treatment as TaskForm (2026-07-30 redesign, no more click-to-open Popover).
// Field names matched to TaskForm's title/description (2026-07-30) for
// consistency between the two.
export default function NoteForm({ note, onSubmit, onDelete, onCancelEdit }: NoteFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    setTitle(note?.title ?? '');
    setDescription(note?.description ?? '');
  }, [note]);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    const wasNew = !note;
    await onSubmit({ title: title.trim(), description: description.trim() });
    if (wasNew) {
      setTitle('');
      setDescription('');
    }
  };

  return (
    <div className="inline-compose-form">
      <div className="nv-field">
        <label htmlFor="note-form-title">
          Title
          <RequiredMark />
        </label>
        <input
          id="note-form-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short title"
          required
        />
      </div>
      <div className="nv-field">
        <label htmlFor="note-form-description">
          Description
          <RequiredMark />
        </label>
        <textarea
          id="note-form-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Supports **bold** and *italic*"
          required
        />
      </div>
      <div className="nv-field flex items-center gap-2">
        <button
          type="button"
          className="btn-primary flex-1 text-center"
          onClick={handleSubmit}
          disabled={!title.trim() || !description.trim()}
        >
          {note ? 'Save' : 'Add note'}
        </button>
        {note && onCancelEdit && (
          <button type="button" className="icon-btn" onClick={onCancelEdit} aria-label="Cancel edit">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {note && onDelete && (
          <button type="button" className="icon-btn danger" onClick={onDelete} aria-label="Delete note">
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
