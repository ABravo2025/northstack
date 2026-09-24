import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Task } from '../api';
import { useTaskFolders } from '../hooks/useTaskFolders';
import { useMyTasksHub } from '../hooks/useMyTasksHub';
import { useGoogleCalendarConnected } from '../hooks/useGoogleCalendarConnected';
import TaskFoldersSidebar from '../components/tasks/TaskFoldersSidebar';
import TaskHubList from '../components/tasks/TaskHubList';
import TaskHubBoard from '../components/tasks/TaskHubBoard';
import NewTaskModal from '../components/tasks/NewTaskModal';
import TaskDetailModal from '../components/tasks/TaskDetailModal';
import { useToast } from '../components/common/ToastProvider';
import { resolveBoardMove, type TaskBoardBucket } from '../lib/taskHubDates';
import { SearchIcon } from '../components/common/Icons';

interface MyTasksPageProps {
  token: string;
  user: any;
}

type ViewMode = 'list' | 'board';

// "My Tasks" hub (/tasks, nav item below Overview) — every task the signed-in user is assignee or
// creator of, in one place, with List/Board views, folders, search, and quick add. Approved as a
// mockup first (Artifact canvas) before this real implementation; see that review for the layout
// rationale. Kept thin on purpose: data lives in useTaskFolders/useMyTasksHub, rows/cards/rail live
// in components/tasks/, this file is just the page shell wiring them together.
export default function MyTasksPage({ token, user }: MyTasksPageProps) {
  const { t } = useTranslation('tasks');
  const toast = useToast();
  const [view, setView] = useState<ViewMode>('list');
  const [tenantUsers, setTenantUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const googleCalendarConnected = useGoogleCalendarConnected(token);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { folders, createFolder, reload: reloadFolders } = useTaskFolders(token);
  const {
    tasks,
    loading,
    showCompleted,
    setShowCompleted,
    folderFilter,
    setFolderFilter,
    searchInput,
    setSearchInput,
    toggleComplete,
    reload: reloadTasks,
  } = useMyTasksHub(token);

  useEffect(() => {
    api.listTenantUsers(token).then(setTenantUsers).catch(() => {});
  }, [token]);

  const totalPendingCount = tasks.filter((t) => !t.completedAt).length;

  const handleTaskListChanged = async () => {
    await Promise.all([reloadTasks(), reloadFolders()]);
  };

  const handleMoveTask = async (task: Task, bucket: TaskBoardBucket) => {
    const patch = resolveBoardMove(bucket);
    if (!patch) return; // rejected drop (e.g. dragged onto "Overdue")
    try {
      await api.updateTask(token, task.id, patch);
      await reloadTasks();
    } catch (error) {
      toast.error(t('myTasks.toasts.failedToMoveTask', { message: (error as Error).message }));
    }
  };

  return (
    <div className="page-full flex flex-col">
      <div className="page-toolbar">
        <h2>{t('myTasks.pageTitle')}</h2>
      </div>

      <div className="task-hub-layout">
        <TaskFoldersSidebar
          folders={folders}
          totalPendingCount={totalPendingCount}
          selected={folderFilter}
          onSelect={setFolderFilter}
          onCreate={createFolder}
        />

        <div className="task-hub-main">
          <div className="task-hub-filters">
            <div className="task-hub-filters-left">
              <div className="toolbar-search max-w-[220px]">
                <SearchIcon />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t('myTasks.searchPlaceholder')}
                />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-ink-muted dark:text-dark-ink-muted">
                <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
                {t('myTasks.showCompleted')}
              </label>
            </div>
            <div className="task-view-toggle" role="group" aria-label={t('myTasks.view.ariaLabel')}>
              <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                {t('myTasks.view.list')}
              </button>
              <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>
                {t('myTasks.view.board')}
              </button>
            </div>
          </div>

          {view === 'list' ? (
            <TaskHubList
              tasks={tasks}
              loading={loading}
              onToggleComplete={toggleComplete}
              onOpenDetail={setSelectedTask}
              onAddTask={() => setAddModalOpen(true)}
            />
          ) : (
            <TaskHubBoard
              tasks={tasks}
              showCompleted={showCompleted}
              onToggleComplete={toggleComplete}
              onOpenDetail={setSelectedTask}
              onMoveTask={handleMoveTask}
            />
          )}
        </div>
      </div>

      <NewTaskModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        token={token}
        tenantUsers={tenantUsers}
        currentUserId={user.id}
        folders={folders}
        defaultFolderId={folderFilter === 'all' || folderFilter === 'none' ? null : folderFilter}
        googleCalendarConnected={googleCalendarConnected}
        onCreated={handleTaskListChanged}
      />

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        token={token}
        tenantUsers={tenantUsers}
        currentUserId={user.id}
        folders={folders}
        googleCalendarConnected={googleCalendarConnected}
        onSaved={handleTaskListChanged}
      />
    </div>
  );
}
