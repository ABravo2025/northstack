import { useEffect, useState } from 'react';
import { api, type Task } from '../api';
import { useToast } from '../components/common/ToastProvider';

export type FolderFilter = 'all' | 'none' | string; // string = a real folder id

// Data + filters + mutations for the My Tasks hub page (`/tasks`) — every task the signed-in user
// is assignee or creator of. Kept separate from the page component itself and from
// useTaskFolders.ts so the page's JSX stays about layout, not data-fetching plumbing.
export function useMyTasksHub(token: string) {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce the search box — otherwise every keystroke fires a request.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = async () => {
    try {
      const result = await api.listTasksHub(token, {
        includeCompleted: showCompleted,
        folderId: folderFilter === 'all' ? undefined : folderFilter,
        search: search || undefined,
      });
      setTasks(result);
    } catch (error) {
      toast.error('Failed to load tasks: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompleted, folderFilter, search]);

  const toggleComplete = async (task: Task) => {
    try {
      await api.updateTask(token, task.id, { completedAt: task.completedAt ? null : new Date().toISOString() });
      await load();
    } catch (error) {
      toast.error('Failed to update task: ' + (error as Error).message);
    }
  };

  const deleteTask = async (task: Task) => {
    try {
      await api.deleteTask(token, task.id);
      toast.success('Task deleted.');
      await load();
    } catch (error) {
      toast.error('Failed to delete task: ' + (error as Error).message);
    }
  };

  return {
    tasks,
    loading,
    showCompleted,
    setShowCompleted,
    folderFilter,
    setFolderFilter,
    searchInput,
    setSearchInput,
    toggleComplete,
    deleteTask,
    reload: load,
  };
}
