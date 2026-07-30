import { useEffect, useState } from 'react';
import type { Note } from '../api';
import { TrashIcon, XIcon } from './Icons';

export interface NoteFormPayload {
  header: string;
  body: string;
}

interface NoteFormProps {
  note: Note | null; // null = composing a new note
  onSubmit: (payload: NoteFormPayload) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onCancelEdit?: () => void;
}

// Always-expanded compose form for the right-column "Notes" tab — same
// treatment as TaskForm (2026-07-30 redesign, no more click-to-open Popover).
export default function NoteForm({ note, onSubmit, onDelete, onCancelEdit }: NoteFormProps) {
  const [header, setHeader] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    setHeader(note?.header ?? '');
    setBody(note?.body ?? '');
  }, [note]);

  const handleSubmit = async () => {
    if (!header.trim() || !body.trim()) return;
    const wasNew = !note;
    await onSubmit({ header: header.trim(), body: body.trim() });
    if (wasNew) {
      setHeader('');
      setBody('');
    }
  };

  return (
    <div className="inline-compose-form">
      <div className="nv-field">
        <label htmlFor="note-form-header">Header</label>
        <input id="note-form-header" value={header} onChange={(e) => setHeader(e.target.value)} placeholder="Short title" />
      </div>
      <div className="nv-field">
        <label htmlFor="note-form-body">Description</label>
        <textarea
          id="note-form-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Supports **bold** and *italic*"
        />
      </div>
      <div className="nv-field flex items-center gap-2">
        <button
          type="button"
          className="btn-primary flex-1 text-center"
          onClick={handleSubmit}
          disabled={!header.trim() || !body.trim()}
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
