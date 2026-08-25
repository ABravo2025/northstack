import { useEffect, useRef, useState } from 'react';
import { api, type Opportunity, type Pipeline, type PipelineStage } from '../api';
import { useToast } from '../components/common/ToastProvider';
import ColorPicker from '../components/common/ColorPicker';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import Popover from '../components/common/Popover';
import RequiredMark from '../components/common/RequiredMark';
import { DotsVerticalIcon, GripIcon, PlusIcon, TrashIcon } from '../components/common/Icons';

interface PipelinesSettingsPageProps {
  token: string;
}

const OUTCOME_LABELS: Record<string, string> = { open: 'Open', won: 'Won', lost: 'Lost' };
const PIPELINE_TYPE_LABELS: Record<'lead' | 'account', string> = { lead: 'Leads', account: 'Account' };
// Fixed (not hashed) so Type reads at a glance — found by the user 2026-08-25:
// the plain-text type label off to the side was too easy to miss.
const PIPELINE_TYPE_CHIP_COLOR: Record<'lead' | 'account', 'purple' | 'teal'> = { lead: 'purple', account: 'teal' };

type PipelineSortField = 'type' | 'name' | 'stages' | 'createdAt' | 'updatedAt';

function getPipelineSortValue(p: Pipeline, field: PipelineSortField): string | number {
  switch (field) {
    case 'type':
      return p.type;
    case 'name':
      return p.name.toLowerCase();
    case 'stages':
      return p.stages.length;
    case 'createdAt':
      return new Date(p.createdAt).getTime();
    case 'updatedAt':
      return new Date(p.updatedAt).getTime();
  }
}

function formatPipelineDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface DraftStage {
  key: string;
  name: string;
  outcome: 'open' | 'won' | 'lost';
  // String (not number) while editing, same as probabilityDrafts below — kept
  // separate per-stage here since these rows aren't persisted yet, so there's
  // no id to key a shared draft map by. Sent as the stage's `probability` on
  // create; backend still forces 100/0 for won/lost regardless of this value
  // (docs/tareas/specredisenosalesv2.md §3.5).
  probability: string;
}

let draftStageCounter = 0;
function newDraftStage(): DraftStage {
  draftStageCounter += 1;
  return { key: `draft-${draftStageCounter}`, name: '', outcome: 'open', probability: '50' };
}

// Shown once, right above the Stages list — explains what each Outcome
// option actually does rather than leaving Won/Open/Lost unexplained
// (found while reviewing this screen 2026-08-24: the dropdown alone gives no
// hint that Won/Lost are terminal and force the probability, or that Open is
// the default and drives the weighted forecast).
const OUTCOME_HELP =
  'Open: still active, counts toward the weighted forecast at its probability. Won/Lost: terminal — probability is forced to 100%/0% and can’t be edited.';

export default function PipelinesSettingsPage({ token }: PipelinesSettingsPageProps) {
  const toast = useToast();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);
  // Holds the pipeline currently open in the Edit modal — null means the
  // modal (if open at all) is in Create mode instead (see `createOpen`).
  // Editing happens entirely inside the modal now (user feedback 2026-08-25):
  // no more inline rename-in-row or click-to-expand-stages in the table.
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newStageName, setNewStageName] = useState<Record<string, string>>({});
  // Local draft while editing a stage's win probability — committed onBlur
  // (docs/tareas/specredisenosalesv2.md §3.5), same "commit on blur, not
  // every keystroke" idiom as pipeline rename above, keyed by stage.id so
  // multiple stages can be mid-edit independently.
  const [probabilityDrafts, setProbabilityDrafts] = useState<Record<string, string>>({});
  const [archivingPipeline, setArchivingPipeline] = useState<Pipeline | null>(null);
  const [archivingSaving, setArchivingSaving] = useState(false);
  const [reactivatingPipeline, setReactivatingPipeline] = useState<Pipeline | null>(null);
  const [reactivatingSaving, setReactivatingSaving] = useState(false);
  const [pipelineTab, setPipelineTab] = useState<'active' | 'archived'>('active');
  const [sortField, setSortField] = useState<PipelineSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  // Row-level "..." menu (Edit / Archive) — one shared Popover anchored to
  // whichever row's trigger was last clicked, same pattern as
  // TimeOffOverviewPage.tsx's policy row menu.
  const [pipelineRowMenuFor, setPipelineRowMenuFor] = useState<string | null>(null);
  const pipelineRowMenuAnchorRef = useRef<HTMLElement | null>(null);
  // Drag-to-reorder for the stage editor (replaces the old ▲/▼ buttons per
  // user feedback 2026-08-25) — same drag/dragover/drop state shape as
  // FieldCatalogMenu.tsx's catalog-entry reordering.
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const handleSort = (field: PipelineSortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<'lead' | 'account'>('lead');
  const [createStages, setCreateStages] = useState<DraftStage[]>([newDraftStage()]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadPipelines();
    api.listOpportunities(token).then(setOpportunities).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPipelines = async () => {
    setLoading(true);
    try {
      const data = await api.listPipelines(token);
      setPipelines(data);
    } catch (error) {
      toast.error('Failed to load pipelines: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingPipelineId(null);
    setCreateName('');
    setCreateType('lead');
    setCreateStages([newDraftStage()]);
    setCreateOpen(true);
  };

  const handleStartEdit = (pipeline: Pipeline) => {
    setRenameValue(pipeline.name);
    setEditingPipelineId(pipeline.id);
    setPipelineRowMenuFor(null);
  };

  const closePipelineModal = () => {
    setCreateOpen(false);
    setEditingPipelineId(null);
  };

  const addDraftStage = () => {
    setCreateStages((prev) => [...prev, newDraftStage()]);
  };

  const removeDraftStage = (key: string) => {
    setCreateStages((prev) => prev.filter((s) => s.key !== key));
  };

  const updateDraftStage = (key: string, patch: Partial<DraftStage>) => {
    setCreateStages((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const handleCreatePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const pipeline = await api.createPipeline(token, { name, type: createType, order: pipelines.length });
      const stagesToCreate = createStages.filter((s) => s.name.trim());
      for (let i = 0; i < stagesToCreate.length; i++) {
        const stage = stagesToCreate[i];
        const parsedProbability = Number.parseInt(stage.probability, 10);
        await api.createPipelineStage(token, pipeline.id, {
          name: stage.name.trim(),
          order: i,
          outcome: stage.outcome,
          probability: Number.isFinite(parsedProbability) ? parsedProbability : undefined,
        });
      }
      setCreateOpen(false);
      toast.success('Pipeline created.');
      loadPipelines();
    } catch (error) {
      toast.error('Failed to create pipeline: ' + (error as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // Auto-saves on blur, same idiom as the stage fields below — the Edit
  // modal has no separate "Save" step for the name field.
  const submitRename = async (pipelineId: string) => {
    if (!renameValue.trim()) return;
    try {
      await api.updatePipeline(token, pipelineId, { name: renameValue.trim() });
      loadPipelines();
    } catch (error) {
      toast.error('Failed to rename pipeline: ' + (error as Error).message);
    }
  };

  // Archiving affects every Opportunity in the pipeline (they become read-only
  // until reactivated), so it goes through a type-to-confirm dialog like other
  // destructive-ish actions in the app. Reactivating isn't destructive, but
  // still gets a plain (no type-to-confirm) dialog per the user's request —
  // it flips creation menus back on tenant-wide, not something to fire by
  // accident. A lighter treatment than Archive on purpose.
  const handleArchiveToggleClick = (pipeline: Pipeline) => {
    setPipelineRowMenuFor(null);
    if (pipeline.isActive) {
      setArchivingPipeline(pipeline);
    } else {
      setReactivatingPipeline(pipeline);
    }
  };

  const handleConfirmReactivatePipeline = async () => {
    if (!reactivatingPipeline) return;
    setReactivatingSaving(true);
    try {
      await api.updatePipeline(token, reactivatingPipeline.id, { isActive: true });
      toast.success('Pipeline reactivated.');
      setReactivatingPipeline(null);
      loadPipelines();
    } catch (error) {
      toast.error('Failed to update pipeline: ' + (error as Error).message);
    } finally {
      setReactivatingSaving(false);
    }
  };

  const handleConfirmArchivePipeline = async () => {
    if (!archivingPipeline) return;
    setArchivingSaving(true);
    try {
      await api.updatePipeline(token, archivingPipeline.id, { isActive: false });
      toast.success('Pipeline archived.');
      setArchivingPipeline(null);
      loadPipelines();
    } catch (error) {
      toast.error('Failed to update pipeline: ' + (error as Error).message);
    } finally {
      setArchivingSaving(false);
    }
  };

  const handleAddStage = async (e: React.FormEvent, pipeline: Pipeline) => {
    e.preventDefault();
    const name = (newStageName[pipeline.id] || '').trim();
    if (!name) return;
    try {
      await api.createPipelineStage(token, pipeline.id, {
        name,
        order: pipeline.stages.length,
        outcome: 'open',
      });
      setNewStageName({ ...newStageName, [pipeline.id]: '' });
      loadPipelines();
    } catch (error) {
      toast.error('Failed to add stage: ' + (error as Error).message);
    }
  };

  const handleStageColorChange = async (pipeline: Pipeline, stage: PipelineStage, color: string) => {
    try {
      await api.updatePipelineStage(token, pipeline.id, stage.id, { color });
      loadPipelines();
    } catch (error) {
      toast.error('Failed to update stage color: ' + (error as Error).message);
    }
  };

  const handleStageOutcomeChange = async (pipeline: Pipeline, stage: PipelineStage, outcome: string) => {
    try {
      await api.updatePipelineStage(token, pipeline.id, stage.id, { outcome: outcome as 'open' | 'won' | 'lost' });
      loadPipelines();
    } catch (error) {
      toast.error('Failed to update stage outcome: ' + (error as Error).message);
    }
  };

  const getProbabilityDraft = (stage: PipelineStage): string =>
    probabilityDrafts[stage.id] !== undefined ? probabilityDrafts[stage.id] : String(stage.probability);

  const handleStageProbabilityBlur = async (pipeline: Pipeline, stage: PipelineStage) => {
    const raw = probabilityDrafts[stage.id];
    setProbabilityDrafts((prev) => {
      const next = { ...prev };
      delete next[stage.id];
      return next;
    });
    if (raw === undefined) return;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100 || parsed === stage.probability) return;
    try {
      await api.updatePipelineStage(token, pipeline.id, stage.id, { probability: parsed });
      loadPipelines();
    } catch (error) {
      toast.error('Failed to update probability: ' + (error as Error).message);
    }
  };

  const toggleArchiveStage = async (pipeline: Pipeline, stage: PipelineStage) => {
    try {
      await api.updatePipelineStage(token, pipeline.id, stage.id, { isActive: !stage.isActive });
      loadPipelines();
    } catch (error) {
      toast.error('Failed to update stage: ' + (error as Error).message);
    }
  };

  const handleStageDragStart = (stageId: string) => setDraggedStageId(stageId);

  const handleStageDragEnd = () => {
    setDraggedStageId(null);
    setDragOverStageId(null);
  };

  const handleStageDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (dragOverStageId !== overId) setDragOverStageId(overId);
  };

  const handleStageDrop = async (pipeline: Pipeline, targetStageId: string) => {
    setDragOverStageId(null);
    const draggedId = draggedStageId;
    setDraggedStageId(null);
    if (!draggedId || draggedId === targetStageId) return;

    const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);
    const draggedIndex = sorted.findIndex((s) => s.id === draggedId);
    const targetIndex = sorted.findIndex((s) => s.id === targetStageId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = [...sorted];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    try {
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order !== i) {
          await api.updatePipelineStage(token, pipeline.id, reordered[i].id, { order: i });
        }
      }
      loadPipelines();
    } catch (error) {
      toast.error('Failed to reorder stage: ' + (error as Error).message);
    }
  };

  if (loading) {
    return <p>Loading...</p>;
  }

  const sortPipelines = (list: Pipeline[]): Pipeline[] => {
    if (!sortField) return list;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = getPipelineSortValue(a, sortField);
      const bv = getPipelineSortValue(b, sortField);
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  };

  const activePipelines = sortPipelines(pipelines.filter((p) => p.isActive));
  const archivedPipelines = sortPipelines(pipelines.filter((p) => !p.isActive));
  const editingPipeline = editingPipelineId ? pipelines.find((p) => p.id === editingPipelineId) ?? null : null;
  const menuPipeline = pipelineRowMenuFor ? pipelines.find((p) => p.id === pipelineRowMenuFor) ?? null : null;

  const sortArrow = (field: PipelineSortField) => (
    <span className="sort-arrow">{sortField === field && sortDirection === 'desc' ? '▴' : '▾'}</span>
  );

  // The stage-editing block — reused as-is inside the Edit modal below and
  // nowhere else now (used to live inline in an expanded table row; moved
  // into the modal per the user's 2026-08-25 feedback). Every control here
  // still auto-saves immediately on change/blur, same as before the move.
  const renderStageEditor = (pipeline: Pipeline) => {
    const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);
    return (
      <>
        {sortedStages.length > 0 && <p className="mb-2 text-xs text-gray-500">{OUTCOME_HELP}</p>}
        {sortedStages.length > 0 && (
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            <span style={{ width: 20 }} />
            <span style={{ width: 28 }} />
            <span className="flex-1">Stage name</span>
            <span style={{ width: 110 }}>Outcome</span>
            <span style={{ width: 56, textAlign: 'center' }}>Win %</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {sortedStages.map((stage) => (
            <div
              key={stage.id}
              className={`flex items-center gap-2 rounded-md border-t-2 border-transparent ${
                draggedStageId === stage.id ? 'opacity-40' : ''
              } ${dragOverStageId === stage.id && draggedStageId && draggedStageId !== stage.id ? 'border-t-brand-blue' : ''}`}
              onDragOver={(e) => handleStageDragOver(e, stage.id)}
              onDrop={() => handleStageDrop(pipeline, stage.id)}
            >
              <span
                className="status-manage-grip"
                draggable
                onDragStart={() => handleStageDragStart(stage.id)}
                onDragEnd={handleStageDragEnd}
                aria-label={`Drag to reorder ${stage.name}`}
              >
                <GripIcon className="h-3.5 w-3.5" />
              </span>
              <ColorPicker value={stage.color || '#6b7280'} onChange={(color) => handleStageColorChange(pipeline, stage, color)} />
              <span className={`flex-1 text-sm ${!stage.isActive ? 'inactive' : ''}`}>{stage.name}</span>
              <select
                className="select-compact"
                style={{ width: 110 }}
                value={stage.outcome}
                onChange={(e) => handleStageOutcomeChange(pipeline, stage, e.target.value)}
              >
                {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {stage.outcome === 'open' ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="select-compact"
                  style={{ width: 56 }}
                  value={getProbabilityDraft(stage)}
                  onChange={(e) => setProbabilityDrafts({ ...probabilityDrafts, [stage.id]: e.target.value })}
                  onBlur={() => handleStageProbabilityBlur(pipeline, stage)}
                  title="Win probability (%) — used for the weighted pipeline forecast"
                />
              ) : (
                <span
                  className="text-xs text-ink-faint"
                  style={{ width: 56, textAlign: 'center' }}
                  title="Forced — Won is always 100%, Lost is always 0%"
                >
                  {stage.probability}%
                </span>
              )}
              <button type="button" className="btn-secondary" onClick={() => toggleArchiveStage(pipeline, stage)}>
                {stage.isActive ? 'Archive' : 'Reactivate'}
              </button>
            </div>
          ))}
        </div>

        <form className="flex items-center gap-2 mt-3" onSubmit={(e) => handleAddStage(e, pipeline)}>
          <input
            type="text"
            placeholder="New stage name"
            value={newStageName[pipeline.id] || ''}
            onChange={(e) => setNewStageName({ ...newStageName, [pipeline.id]: e.target.value })}
            style={{ maxWidth: 220 }}
          />
          <button type="submit" className="btn-secondary">
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="h-3.5 w-3.5" />
              Add Stage
            </span>
          </button>
        </form>
      </>
    );
  };

  const renderPipelineRow = (pipeline: Pipeline) => {
    return (
      <tr key={pipeline.id}>
        <td>
          {/* Fixed color per type (not hashed) so Lead vs Account reads at a
              glance — found by the user 2026-08-25, the old plain-text label
              was too easy to miss. Type itself stays read-only: immutable
              after creation (docs/tareas/specredisenosalesv2.md §3.1) —
              reclassifying a pipeline with existing Opportunities would
              silently change which Company-gate rule applies to them. */}
          <span
            className={`category-chip chip-${PIPELINE_TYPE_CHIP_COLOR[pipeline.type]}`}
            title="Pipeline type can't be changed after creation"
          >
            {PIPELINE_TYPE_LABELS[pipeline.type]}
          </span>
        </td>
        <td>
          <span className="font-semibold">{pipeline.name}</span>
        </td>
        <td>{pipeline.stages.length}</td>
        <td>
          <div>{formatPipelineDate(pipeline.createdAt)}</div>
          <div className="text-xs text-ink-faint">
            {pipeline.createdBy ? `${pipeline.createdBy.firstName} ${pipeline.createdBy.lastName}` : '—'}
          </div>
        </td>
        <td>
          <div>{formatPipelineDate(pipeline.updatedAt)}</div>
          <div className="text-xs text-ink-faint">
            {pipeline.updatedBy ? `${pipeline.updatedBy.firstName} ${pipeline.updatedBy.lastName}` : '—'}
          </div>
        </td>
        <td>
          <button
            type="button"
            className="icon-btn"
            onClick={(e) => {
              pipelineRowMenuAnchorRef.current = e.currentTarget;
              setPipelineRowMenuFor(pipelineRowMenuFor === pipeline.id ? null : pipeline.id);
            }}
            aria-label={`Actions for ${pipeline.name}`}
            title="Actions"
          >
            <DotsVerticalIcon />
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="card-title mb-1">Pipelines</h3>
          <p className="text-sm text-gray-500">
            Sales pipelines for Opportunities. Each pipeline has its own stages — archiving a pipeline keeps its
            Opportunities visible read-only, it just disappears from creation menus.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <span className="inline-flex items-center gap-1.5">
            <PlusIcon className="h-4 w-4" />
            New Pipeline
          </span>
        </button>
      </div>

      {archivedPipelines.length > 0 && (
        <div className="views-bar mb-3">
          <button
            type="button"
            className={`view-tab ${pipelineTab === 'active' ? 'active' : ''}`}
            onClick={() => setPipelineTab('active')}
          >
            Active ({activePipelines.length})
          </button>
          <button
            type="button"
            className={`view-tab ${pipelineTab === 'archived' ? 'active' : ''}`}
            onClick={() => setPipelineTab('archived')}
          >
            Archived ({archivedPipelines.length})
          </button>
        </div>
      )}

      <table className="table full-table">
        <thead>
          <tr>
            <th className={`sortable ${sortField === 'type' ? 'sorted' : ''}`} onClick={() => handleSort('type')}>
              Type {sortArrow('type')}
            </th>
            <th className={`sortable ${sortField === 'name' ? 'sorted' : ''}`} onClick={() => handleSort('name')}>
              Name {sortArrow('name')}
            </th>
            <th className={`sortable ${sortField === 'stages' ? 'sorted' : ''}`} onClick={() => handleSort('stages')}>
              Stages {sortArrow('stages')}
            </th>
            <th className={`sortable ${sortField === 'createdAt' ? 'sorted' : ''}`} onClick={() => handleSort('createdAt')}>
              Created {sortArrow('createdAt')}
            </th>
            <th className={`sortable ${sortField === 'updatedAt' ? 'sorted' : ''}`} onClick={() => handleSort('updatedAt')}>
              Updated {sortArrow('updatedAt')}
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>{(pipelineTab === 'archived' ? archivedPipelines : activePipelines).map(renderPipelineRow)}</tbody>
      </table>

      <Popover
        open={pipelineRowMenuFor !== null}
        onClose={() => setPipelineRowMenuFor(null)}
        anchorRef={pipelineRowMenuAnchorRef}
        width={160}
        align="right"
      >
        {menuPipeline && (
          <>
            <div className="popover-menu-item" onClick={() => handleStartEdit(menuPipeline)}>
              Edit
            </div>
            <div className="popover-menu-item" onClick={() => handleArchiveToggleClick(menuPipeline)}>
              {menuPipeline.isActive ? 'Archive' : 'Reactivate'}
            </div>
          </>
        )}
      </Popover>

      {archivingPipeline && (
        <ConfirmDialog
          title={`Archive "${archivingPipeline.name}"`}
          message={`This pipeline has ${
            opportunities.filter((o) => o.pipelineId === archivingPipeline.id).length
          } Opportunity(ies). They'll stay visible but become read-only until this pipeline is reactivated, and the pipeline will disappear from creation menus. Type ARCHIVE to confirm.`}
          confirmLabel={archivingSaving ? 'Archiving…' : 'ARCHIVE'}
          confirmText="ARCHIVE"
          confirmDisabled={archivingSaving}
          onConfirm={handleConfirmArchivePipeline}
          onCancel={() => setArchivingPipeline(null)}
        />
      )}

      {reactivatingPipeline && (
        <ConfirmDialog
          title={`Reactivate "${reactivatingPipeline.name}"`}
          message="This pipeline will reappear in creation menus and its Opportunities become editable again."
          confirmLabel={reactivatingSaving ? 'Reactivating…' : 'Reactivate'}
          danger={false}
          confirmDisabled={reactivatingSaving}
          onConfirm={handleConfirmReactivatePipeline}
          onCancel={() => setReactivatingPipeline(null)}
        />
      )}

      <Modal
        open={createOpen || editingPipelineId !== null}
        title={editingPipeline ? 'Edit Pipeline' : 'New Pipeline'}
        onClose={closePipelineModal}
        wide
        footer={
          editingPipeline ? (
            <button type="button" className="btn-primary" onClick={closePipelineModal}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={closePipelineModal}>
                Cancel
              </button>
              <button type="submit" form="create-pipeline-form" className="btn-primary" disabled={creating}>
                {creating ? 'Saving…' : 'Save'}
              </button>
            </>
          )
        }
      >
        {editingPipeline ? (
          <div>
            <div className="form-group">
              <label htmlFor="edit-pipeline-name">Pipeline name</label>
              <input
                id="edit-pipeline-name"
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => submitRename(editingPipeline.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
            <div className="form-group">
              <label>Type</label>
              <p className="text-sm text-ink-faint" title="Pipeline type can't be changed after creation">
                {PIPELINE_TYPE_LABELS[editingPipeline.type]}
              </p>
            </div>
            <div className="form-group">
              <span>Stages</span>
              {renderStageEditor(editingPipeline)}
            </div>
          </div>
        ) : (
          <form id="create-pipeline-form" onSubmit={handleCreatePipeline}>
            <div className="form-group">
              <label htmlFor="new-pipeline-name">
                Pipeline name
                <RequiredMark />
              </label>
              <input
                id="new-pipeline-name"
                type="text"
                autoFocus
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Leads, Renewals"
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-pipeline-type">Type</label>
              <select id="new-pipeline-type" value={createType} onChange={(e) => setCreateType(e.target.value as 'lead' | 'account')}>
                <option value="lead">Leads — unqualified prospects, company optional</option>
                <option value="account">Account — an already-identified company</option>
              </select>
            </div>

            <div className="form-group">
              <span>Stages</span>
              <p className="mb-1 text-xs text-gray-500">
                Add the stages a deal moves through in this pipeline. You can leave this empty and add stages
                later, or reorder/color them once the pipeline is created.
              </p>
              <p className="mb-2 text-xs text-gray-500">{OUTCOME_HELP}</p>
              {createStages.length > 0 && (
                <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  <span className="flex-1">Stage name</span>
                  <span style={{ width: 110 }}>Outcome</span>
                  <span style={{ width: 56, textAlign: 'center' }}>Win %</span>
                  <span style={{ width: 32 }} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                {createStages.map((stage, i) => (
                  <div key={stage.key} className="flex items-center gap-2">
                    <input
                      type="text"
                      className="flex-1"
                      placeholder={`Stage ${i + 1} name`}
                      value={stage.name}
                      onChange={(e) => updateDraftStage(stage.key, { name: e.target.value })}
                    />
                    <select
                      className="select-compact"
                      style={{ width: 110 }}
                      value={stage.outcome}
                      onChange={(e) => updateDraftStage(stage.key, { outcome: e.target.value as DraftStage['outcome'] })}
                    >
                      {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {stage.outcome === 'open' ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="select-compact"
                        style={{ width: 56 }}
                        value={stage.probability}
                        onChange={(e) => updateDraftStage(stage.key, { probability: e.target.value })}
                        title="Win probability (%) — used for the weighted pipeline forecast"
                      />
                    ) : (
                      <span
                        className="text-xs text-ink-faint"
                        style={{ width: 56, textAlign: 'center' }}
                        title="Forced — Won is always 100%, Lost is always 0%"
                      >
                        {stage.outcome === 'won' ? 100 : 0}%
                      </span>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeDraftStage(stage.key)}
                      aria-label="Remove stage"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-secondary mt-2" onClick={addDraftStage}>
                <span className="inline-flex items-center gap-1.5">
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add Stage
                </span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
