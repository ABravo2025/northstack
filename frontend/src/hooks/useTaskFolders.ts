import { useEffect, useState } from 'react';
import { api, type TaskFolder } from '../api';
import { useToast } from '../components/common/ToastProvider';

// Folder list + create/delete for the My Tasks hub's collapsible left rail. Kept separate from
// useMyTasksHub.ts (the task list itself) since folders change far less often and several
// surfaces (the rail, the "Add task"/detail modals' Folder select) all need the same list.
export function useTaskFolders(token: string) {
  const toast = useToast();
  const [folders, setFolders] = useState<TaskFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const result = await api.listTaskFolders(token);
      setFolders(result);
    } catch (error) {
      toast.error('Failed to load folders: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await api.createTaskFolder(token, trimmed);
      await load();
    } catch (error) {
      toast.error('Failed to create folder: ' + (error as Error).message);
    }
  };

  const deleteFolder = async (folderId: string) => {
    try {
      await api.deleteTaskFolder(token, folderId);
      await load();
    } catch (error) {
      toast.error('Failed to delete folder: ' + (error as Error).message);
    }
  };

  return { folders, loading, createFolder, deleteFolder, reload: load };
}
