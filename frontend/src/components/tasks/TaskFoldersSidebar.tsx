import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskFolder } from '../../api';
import type { FolderFilter } from '../../hooks/useMyTasksHub';
import { ChevronLeftIcon, FolderIcon, PlusIcon, XIcon } from '../common/Icons';

interface TaskFoldersSidebarProps {
  folders: TaskFolder[];
  totalPendingCount: number;
  selected: FolderFilter;
  onSelect: (folder: FolderFilter) => void;
  onCreate: (name: string) => void | Promise<void>;
}

// Collapsible left rail for the My Tasks hub — "All tasks" plus every tenant-wide TaskFolder, each
// with a live pending-task count. Collapsing shrinks it to icon-only (more room for the list/board),
// same collapse affordance as the app's own main Sidebar.
export default function TaskFoldersSidebar({ folders, totalPendingCount, selected, onSelect, onCreate }: TaskFoldersSidebarProps) {
  const { t } = useTranslation('tasks');
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const submitNewFolder = async () => {
    if (!newName.trim()) {
      setAdding(false);
      return;
    }
    await onCreate(newName);
    setNewName('');
    setAdding(false);
  };

  return (
    <div className={`task-folders-rail ${collapsed ? 'collapsed' : ''}`}>
      <div className="task-folders-top">
        {!collapsed && <span className="task-folders-label">{t('myTasks.folders.label')}</span>}
        <button
          type="button"
          className="task-folders-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? t('myTasks.folders.expandAria') : t('myTasks.folders.collapseAria')}
        >
          <ChevronLeftIcon />
        </button>
      </div>

      <button type="button" className={`task-folder-row ${selected === 'all' ? 'active' : ''}`} onClick={() => onSelect('all')} title={t('myTasks.folders.allTasks')}>
        <FolderIcon />
        {!collapsed && (
          <>
            <span className="task-folder-name">{t('myTasks.folders.allTasks')}</span>
            <span className="task-folder-count">{totalPendingCount}</span>
          </>
        )}
      </button>

      {folders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          className={`task-folder-row ${selected === folder.id ? 'active' : ''}`}
          onClick={() => onSelect(folder.id)}
          title={folder.name}
        >
          <FolderIcon />
          {!collapsed && (
            <>
              <span className="task-folder-name">{folder.name}</span>
              <span className="task-folder-count">{folder.pendingTaskCount ?? 0}</span>
            </>
          )}
        </button>
      ))}

      {!collapsed &&
        (adding ? (
          <div className="task-folder-add-row">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNewFolder();
                if (e.key === 'Escape') {
                  setAdding(false);
                  setNewName('');
                }
              }}
              placeholder={t('myTasks.folders.namePlaceholder')}
            />
            <button type="button" className="icon-btn" onClick={submitNewFolder} aria-label={t('myTasks.folders.confirmNewAria')}>
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setAdding(false);
                setNewName('');
              }}
              aria-label={t('myTasks.folders.cancelNewAria')}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button type="button" className="task-folder-row" onClick={() => setAdding(true)}>
            <PlusIcon />
            <span className="task-folder-name">{t('myTasks.folders.newFolder')}</span>
          </button>
        ))}
    </div>
  );
}
