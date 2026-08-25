import { Fragment, useEffect, useState } from 'react';
import { api, type Opportunity, type Pipeline, type PipelineStage } from '../api';
import { useToast } from '../components/common/ToastProvider';
import ColorPicker from '../components/common/ColorPicker';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import RequiredMark from '../components/common/RequiredMark';
import { ChevronDownIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/common/Icons';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
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
    setCreateName('');
    setCreateType('lead');
    setCreateStages([newDraftStage()]);
    setCreateOpen(true);
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

  const startRename = (pipeline: Pipeline) => {
    setRenamingId(pipeline.id);
    setRenameValue(pipeline.name);
  };

  const submitRename = async (pipelineId: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await api.updatePipeline(token, pipelineId, { name: renameValue.trim() });
      setRenamingId(null);
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

  const moveStage = async (pipeline: Pipeline, stage: PipelineStage, direction: -1 | 1) => {
    const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((s) => s.id === stage.id);
    const swapWith = sorted[index + direction];
    if (!swapWith) return;
    try {
      await Promise.all([
        api.updatePipelineStage(token, pipeline.id, stage.id, { order: swapWith.order }),
        api.updatePipelineStage(token, pipeline.id, swapWith.id, { order: stage.order }),
      ]);
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

  const sortArrow = (field: PipelineSortField) => (
    <span className="sort-arrow">{sortField === field && sortDirection === 'desc' ? '▴' : '▾'}</span>
  );

  const renderPipelineRow = (pipeline: Pipeline) => {
    const isExpanded = expandedId === pipeline.id;
    const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);
    return (
      <>
        <tr className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : pipeline.id)}>
          <td>
            <div className="flex items-center gap-2">
              <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
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
            </div>
          </td>
          <td>
            {renamingId === pipeline.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => submitRename(pipeline.id)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename(pipeline.id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="rounded-md border border-brand-blue px-2 py-1 text-sm"
              />
            ) : (
              <span className="font-semibold">{pipeline.name}</span>
            )}
          </td>
          <td>{sortedStages.length}</td>
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
          <td onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <button type="button" className="icon-btn" onClick={() => startRename(pipeline)}>
                <span className="tip">Rename</span>
                <PencilIcon />
              </button>
              <button type="button" className="btn-secondary" onClick={() => handleArchiveToggleClick(pipeline)}>
                {pipeline.isActive ? 'Archive' : 'Reactivate'}
              </button>
            </div>
          </td>
        </tr>

        {isExpanded && (
          <tr>
            <td colSpan={6} className="bg-surface-0 dark:bg-dark-page" style={{ cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
              {sortedStages.length > 0 && <p className="mb-2 text-xs text-gray-500">{OUTCOME_HELP}</p>}
              {sortedStages.length > 0 && (
                <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  <span style={{ width: 32 }} />
                  <span style={{ width: 28 }} />
                  <span className="flex-1">Stage name</span>
                  <span style={{ width: 110 }}>Outcome</span>
                  <span style={{ width: 56, textAlign: 'center' }}>Win %</span>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {sortedStages.map((stage, i) => (
                  <div key={stage.id} className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={i === 0}
                        onClick={() => moveStage(pipeline, stage, -1)}
                        style={{ height: 16 }}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={i === sortedStages.length - 1}
                        onClick={() => moveStage(pipeline, stage, 1)}
                        style={{ height: 16 }}
                      >
                        ▼
                      </button>
                    </div>
                    <ColorPicker
                      value={stage.color || '#6b7280'}
                      onChange={(color) => handleStageColorChange(pipeline, stage, color)}
                    />
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
            </td>
          </tr>
        )}
      </>
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
        <tbody>
          {(pipelineTab === 'archived' ? archivedPipelines : activePipelines).map((pipeline) => (
            <Fragment key={pipeline.id}>{renderPipelineRow(pipeline)}</Fragment>
          ))}
        </tbody>
      </table>

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
        open={createOpen}
        title="New Pipeline"
        onClose={() => setCreateOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="create-pipeline-form" className="btn-primary" disabled={creating}>
              {creating ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
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
      </Modal>
    </div>
  );
}
