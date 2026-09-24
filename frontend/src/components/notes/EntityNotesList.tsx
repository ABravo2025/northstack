import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Note, type TaskEntityType } from '../../api';
import { useToast } from '../common/ToastProvider';
import NoteForm, { type NoteFormPayload } from './NoteForm';
import Avatar from '../common/Avatar';
import { renderNoteDescription } from '../../lib/lightMarkdown';

interface EntityNotesListProps {
  token: string;
  entityType: TaskEntityType;
  entityId: string;
  // Reported every time the list (re)loads, so the tab this list lives in can
  // show a count badge without re-fetching itself.
  onCountChange?: (count: number) => void;
}

// Shared across EmployeeOverviewPanel and the Company/Contact/Opportunity
// detail modals' right-column "Notes" tab — same mechanism as
// EntityTasksList. Compose form is always expanded (2026-07-30 redesign).
export default function EntityNotesList({ token, entityType, entityId, onCountChange }: EntityNotesListProps) {
  const { t } = useTranslation('notesActivity');
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNote, setEditingNote] = useState<Note | null>(null); // null = composing new

  const load = async () => {
    try {
      const result = await api.listNotes(token, entityType, entityId);
      setNotes(result);
      onCountChange?.(result.length);
    } catch (error) {
      toast.error(t('notes.list.toastLoadFailed', { message: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setEditingNote(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const handleDelete = async () => {
    if (!editingNote) return;
    try {
      await api.deleteNote(token, editingNote.id);
      toast.success(t('notes.list.toastDeleted'));
      setEditingNote(null);
      await load();
    } catch (error) {
      toast.error(t('notes.list.toastDeleteFailed', { message: (error as Error).message }));
    }
  };

  const handleSubmit = async (payload: NoteFormPayload) => {
    try {
      if (editingNote) {
        await api.updateNote(token, editingNote.id, payload);
        toast.success(t('notes.list.toastUpdated'));
        setEditingNote(null);
      } else {
        await api.createNote(token, { entityType, entityId, ...payload });
        toast.success(t('notes.list.toastAdded'));
      }
      await load();
    } catch (error) {
      toast.error(t('notes.list.toastSaveFailed', { message: (error as Error).message }));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <NoteForm
        note={editingNote}
        onSubmit={handleSubmit}
        onDelete={editingNote ? handleDelete : undefined}
        onCancelEdit={editingNote ? () => setEditingNote(null) : undefined}
      />

      <div className="note-list">
        {loading && <p className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('notes.list.loading')}</p>}
        {!loading && notes.length === 0 && <p className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('notes.list.empty')}</p>}
        {notes.map((note) => (
          <div
            key={note.id}
            className={`note-row ${editingNote?.id === note.id ? 'note-row-active' : ''}`}
            onClick={() => setEditingNote(note)}
          >
            <div className="note-row-header">
              <span className="note-row-title">{note.title}</span>
              {note.createdBy && <Avatar firstName={note.createdBy.firstName} lastName={note.createdBy.lastName} />}
            </div>
            <div className="note-row-body">{renderNoteDescription(note.description)}</div>
            <span className="note-row-date">{new Date(note.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
