import { useEffect, useRef, useState } from 'react';
import {
  api,
  type FieldCatalogDefinition,
  type Opportunity,
  type Pipeline,
  type PipelineAssignmentMode,
  type PipelineAssignmentUser,
  type PipelineStage,
  type TenantUser,
} from '../api';
import { useToast } from '../components/common/ToastProvider';
import ColorPicker from '../components/common/ColorPicker';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import MultiSelectDropdown, { type MultiSelectOption } from '../components/common/MultiSelectDropdown';
import Popover from '../components/common/Popover';
import RequiredMark from '../components/common/RequiredMark';
import { DotsVerticalIcon, EyeIcon, EyeOffIcon, GripIcon, PlusIcon, TrashIcon } from '../components/common/Icons';

// Fixed width shared by the stage editor's grip-handle column and its header
// spacer, so "Stage name"/"Outcome"/"Win %" line up with the row below —
// found misaligned by the user 2026-08-25 when the grip replaced the old ▲/▼
// buttons (the icon's own intrinsic size didn't match the guessed spacer).
const STAGE_GRIP_COLUMN_WIDTH = 24;

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
  // Per-stage stage-change notification opt-out (docs/tareas/specredisenosalesv2.md
  // §3.8) — defaults on, same as the backend's own default.
  notifyOwnerOnEnter: boolean;
}

let draftStageCounter = 0;
function newDraftStage(): DraftStage {
  draftStageCounter += 1;
  return { key: `draft-${draftStageCounter}`, name: '', outcome: 'open', probability: '50', notifyOwnerOnEnter: true };
}

function draftStage(name: string, outcome: DraftStage['outcome'], probability: string): DraftStage {
  draftStageCounter += 1;
  return { key: `draft-${draftStageCounter}`, name, outcome, probability, notifyOwnerOnEnter: true };
}

// Pre-filled starting point for a new Pipeline (user feedback 2026-08-26:
// an empty single blank row made every new pipeline start from scratch) —
// still fully editable/removable, same as any other draft row.
function defaultDraftStages(): DraftStage[] {
  return [draftStage('Lead', 'open', '50'), draftStage('Won', 'won', '100'), draftStage('Lost', 'lost', '0')];
}

// Shown once, right above the Stages list — explains what each Outcome
// option actually does rather than leaving Won/Open/Lost unexplained
// (found while reviewing this screen 2026-08-24: the dropdown alone gives no
// hint that Won/Lost are terminal and force the probability, or that Open is
// the default and drives the weighted forecast).
const OUTCOME_HELP =
  'Open: still active, counts toward the weighted forecast at its probability. Won/Lost: terminal — probability is forced to 100%/0% and can’t be edited.';

interface StageEditorProps {
  pipeline: Pipeline;
  token: string;
  onChanged: () => void;
}

// A real, separate component (not a function called inline from the parent's
// render) — this matters, not just style: drag state used to live in
// PipelinesSettingsPage itself, so every dragover event re-rendered the
// entire page (including the full Pipelines table sitting underneath the
// modal) dozens of times per drag gesture, which the user reported as a
// janky "screen refresh" while dragging (2026-08-25). Scoping all of this
// component's own state here means a drag only re-renders this subtree.
function StageEditor({ pipeline, token, onChanged }: StageEditorProps) {
  const toast = useToast();
  const [newStageName, setNewStageName] = useState('');
  // Local draft while editing a stage's win probability — committed onBlur
  // (docs/tareas/specredisenosalesv2.md §3.5), keyed by stage.id so multiple
  // stages can be mid-edit independently.
  const [probabilityDrafts, setProbabilityDrafts] = useState<Record<string, string>>({});
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newStageName.trim();
    if (!name) return;
    try {
      await api.createPipelineStage(token, pipeline.id, { name, order: pipeline.stages.length, outcome: 'open' });
      setNewStageName('');
      onChanged();
    } catch (error) {
      toast.error('Failed to add stage: ' + (error as Error).message);
    }
  };

  const handleColorChange = async (stage: PipelineStage, color: string) => {
    try {
      await api.updatePipelineStage(token, pipeline.id, stage.id, { color });
      onChanged();
    } catch (error) {
      toast.error('Failed to update stage color: ' + (error as Error).message);
    }
  };

  const handleOutcomeChange = async (stage: PipelineStage, outcome: string) => {
    try {
      await api.updatePipelineStage(token, pipeline.id, stage.id, { outcome: outcome as 'open' | 'won' | 'lost' });
      onChanged();
    } catch (error) {
      toast.error('Failed to update stage outcome: ' + (error as Error).message);
    }
  };

  const getProbabilityDraft = (stage: PipelineStage): string =>
    probabilityDrafts[stage.id] !== undefined ? probabilityDrafts[stage.id] : String(stage.probability);

  const handleProbabilityBlur = async (stage: PipelineStage) => {
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
      onChanged();
    } catch (error) {
      toast.error('Failed to update probability: ' + (error as Error).message);
    }
  };

  const toggleArchive = async (stage: PipelineStage) => {
    try {
      await api.updatePipelineStage(token, pipeline.id, stage.id, { isActive: !stage.isActive });
      onChanged();
    } catch (error) {
      toast.error('Failed to update stage: ' + (error as Error).message);
    }
  };

  const toggleNotifyOwnerOnEnter = async (stage: PipelineStage) => {
    try {
      await api.updatePipelineStage(token, pipeline.id, stage.id, { notifyOwnerOnEnter: !stage.notifyOwnerOnEnter });
      onChanged();
    } catch (error) {
      toast.error('Failed to update stage notification setting: ' + (error as Error).message);
    }
  };

  const handleDragStart = (stageId: string) => setDraggedStageId(stageId);

  const handleDragEnd = () => {
    setDraggedStageId(null);
    setDragOverStageId(null);
  };

  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (dragOverStageId !== overId) setDragOverStageId(overId);
  };

  const handleDrop = async (targetStageId: string) => {
    setDragOverStageId(null);
    const draggedId = draggedStageId;
    setDraggedStageId(null);
    if (!draggedId || draggedId === targetStageId) return;

    const draggedIndex = sortedStages.findIndex((s) => s.id === draggedId);
    const targetIndex = sortedStages.findIndex((s) => s.id === targetStageId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = [...sortedStages];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    try {
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order !== i) {
          await api.updatePipelineStage(token, pipeline.id, reordered[i].id, { order: i });
        }
      }
      onChanged();
    } catch (error) {
      toast.error('Failed to reorder stage: ' + (error as Error).message);
    }
  };

  return (
    <>
      {sortedStages.length > 0 && <p className="mb-2 text-xs text-gray-500">{OUTCOME_HELP}</p>}
      {sortedStages.length > 0 && (
        <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          <span style={{ width: STAGE_GRIP_COLUMN_WIDTH }} />
          <span style={{ width: 28 }} />
          <span className="flex-1">Stage name</span>
          <span style={{ width: 110 }}>Outcome</span>
          <span style={{ width: 56, textAlign: 'center' }}>Win %</span>
          <span style={{ width: 56, textAlign: 'center' }} title="Notify the owner (in-app + email) when a deal enters this stage">
            Notify
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {sortedStages.map((stage) => (
          <div
            key={stage.id}
            className={`flex items-center gap-2 rounded-md border-t-2 border-transparent ${
              draggedStageId === stage.id ? 'opacity-40' : ''
            } ${dragOverStageId === stage.id && draggedStageId && draggedStageId !== stage.id ? 'border-t-brand-blue' : ''}`}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDrop={() => handleDrop(stage.id)}
          >
            <span
              className="status-manage-grip"
              style={{ width: STAGE_GRIP_COLUMN_WIDTH, justifyContent: 'center' }}
              draggable
              onDragStart={() => handleDragStart(stage.id)}
              onDragEnd={handleDragEnd}
              aria-label={`Drag to reorder ${stage.name}`}
            >
              <GripIcon className="h-3.5 w-3.5" />
            </span>
            <ColorPicker value={stage.color || '#6b7280'} onChange={(color) => handleColorChange(stage, color)} />
            <span className={`flex-1 text-sm ${!stage.isActive ? 'inactive' : ''}`}>{stage.name}</span>
            <select
              className="select-compact"
              style={{ width: 110 }}
              value={stage.outcome}
              onChange={(e) => handleOutcomeChange(stage, e.target.value)}
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
                onBlur={() => handleProbabilityBlur(stage)}
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
            <span style={{ width: 56, display: 'flex', justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={stage.notifyOwnerOnEnter}
                onChange={() => toggleNotifyOwnerOnEnter(stage)}
                title="Notify the owner (in-app + email) when a deal enters this stage"
              />
            </span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => toggleArchive(stage)}
              aria-label={stage.isActive ? 'Archive stage' : 'Reactivate stage'}
            >
              <span className="tip">{stage.isActive ? 'Archive' : 'Reactivate'}</span>
              {stage.isActive ? (
                <EyeIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <EyeOffIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              )}
            </button>
          </div>
        ))}
      </div>

      <form className="flex items-center gap-2 mt-3" onSubmit={handleAddStage}>
        <input
          type="text"
          placeholder="New stage name"
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
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
}

interface PipelineAutomationEditorProps {
  pipeline: Pipeline;
  token: string;
  // Only for assignmentMode/stalledThresholdDays — those live on `pipeline`
  // itself (owned by the parent's `pipelines` state), so a save has to flow
  // back through loadPipelines to be reflected here. Participants are this
  // component's own local state (below) precisely so toggling one doesn't
  // re-run the parent's fetch/re-render — same reasoning as StageEditor.
  onPipelineChanged: () => void;
}

// Automations section of the Edit modal (docs/tareas/specredisenosalesv2.md
// §3.8) — a real separate component for the same reason StageEditor is: the
// participants checklist does a server round-trip per checkbox, and that
// state living in the page component would re-render the whole Pipelines
// table underneath the modal on every click.
function PipelineAutomationEditor({ pipeline, token, onPipelineChanged }: PipelineAutomationEditorProps) {
  const toast = useToast();
  const [participants, setParticipants] = useState<PipelineAssignmentUser[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [departments, setDepartments] = useState<FieldCatalogDefinition[]>([]);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [addingFromDepartments, setAddingFromDepartments] = useState(false);
  const [stalledDraft, setStalledDraft] = useState(
    pipeline.stalledThresholdDays !== null ? String(pipeline.stalledThresholdDays) : '',
  );
  // Which single mechanism builds the round-robin list right now — showing
  // the individual picker and the department bulk-add side by side as two
  // "optional" tools read as a mistake (user feedback 2026-08-26): pick one,
  // not both at once. A required select (no blank option), not a checkbox
  // pair, so there's never an ambiguous "neither chosen" state.
  const [participantMode, setParticipantMode] = useState<'user' | 'department'>('user');

  useEffect(() => {
    let cancelled = false;
    setParticipantsLoading(true);
    Promise.all([
      api.listPipelineAssignmentUsers(token, pipeline.id),
      api.listTenantUsers(token),
      api.listFieldCatalogDefinitions(token, 'department'),
    ])
      .then(([assignmentUsers, users, depts]) => {
        if (cancelled) return;
        setParticipants(assignmentUsers);
        setTenantUsers(users);
        setDepartments(depts);
      })
      .catch((error) => toast.error('Failed to load automation settings: ' + (error as Error).message))
      .finally(() => {
        if (!cancelled) setParticipantsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.id]);

  useEffect(() => {
    setStalledDraft(pipeline.stalledThresholdDays !== null ? String(pipeline.stalledThresholdDays) : '');
  }, [pipeline.stalledThresholdDays]);

  const refreshParticipants = async () => {
    try {
      const data = await api.listPipelineAssignmentUsers(token, pipeline.id);
      setParticipants(data);
    } catch (error) {
      toast.error('Failed to refresh participants: ' + (error as Error).message);
    }
  };

  const handleModeChange = async (value: PipelineAssignmentMode | null) => {
    try {
      await api.updatePipeline(token, pipeline.id, { assignmentMode: value });
      onPipelineChanged();
    } catch (error) {
      toast.error('Failed to update assignment mode: ' + (error as Error).message);
    }
  };

  // Single select surfaces 3-4 real choices (Off / Round robin — by user /
  // Round robin — by department / Account owner) instead of a mode select
  // plus a second, nested "how" select — found confusing shown as two steps
  // (user feedback 2026-08-26). `participantMode` only ever matters while
  // assignmentMode is round_robin; the persisted enum itself never grows a
  // 3rd/4th value for this — the "by user"/"by department" distinction is
  // purely which tool built the (flat, either way) participant list.
  const unifiedModeValue = pipeline.assignmentMode === 'round_robin' ? `round_robin_${participantMode}` : pipeline.assignmentMode ?? '';

  const handleUnifiedModeChange = (value: string) => {
    if (value === 'round_robin_user' || value === 'round_robin_department') {
      setParticipantMode(value === 'round_robin_user' ? 'user' : 'department');
      setSelectedDepartmentIds([]);
      if (pipeline.assignmentMode !== 'round_robin') handleModeChange('round_robin');
    } else {
      handleModeChange(value === '' ? null : (value as PipelineAssignmentMode));
    }
  };

  const handleStalledBlur = async () => {
    const trimmed = stalledDraft.trim();
    const parsed = trimmed === '' ? null : Number.parseInt(trimmed, 10);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
      toast.error('Stalled reminder days must be a positive number');
      setStalledDraft(pipeline.stalledThresholdDays !== null ? String(pipeline.stalledThresholdDays) : '');
      return;
    }
    if (parsed === pipeline.stalledThresholdDays) return;
    try {
      await api.updatePipeline(token, pipeline.id, { stalledThresholdDays: parsed });
      onPipelineChanged();
    } catch (error) {
      toast.error('Failed to update stalled reminder threshold: ' + (error as Error).message);
    }
  };

  // MultiSelectDropdown reports the full next selection on every toggle (one
  // id added or removed at a time in practice) — diff against the persisted
  // list to know which single assign/unassign call to fire.
  const handleParticipantsChange = async (nextSelected: string[]) => {
    const currentIds = participants.map((p) => p.userId);
    const added = nextSelected.filter((id) => !currentIds.includes(id));
    const removed = currentIds.filter((id) => !nextSelected.includes(id));
    try {
      for (const id of added) await api.assignUserToPipeline(token, pipeline.id, id);
      for (const id of removed) await api.unassignUserFromPipeline(token, pipeline.id, id);
      refreshParticipants();
    } catch (error) {
      toast.error('Failed to update participants: ' + (error as Error).message);
    }
  };

  const handleAddFromDepartments = async () => {
    if (selectedDepartmentIds.length === 0) return;
    setAddingFromDepartments(true);
    try {
      const result = await api.assignPipelineUsersByDepartments(token, pipeline.id, selectedDepartmentIds);
      toast.success(
        `Added ${result.addedCount} of ${result.resolvedUserCount} user(s) as participants (${result.alreadyAssignedCount} were already in the list).`,
      );
      setSelectedDepartmentIds([]);
      refreshParticipants();
      // Switch back to the individual view so the merged, current list is
      // what's on screen after a bulk-add, not the now-empty department picker.
      setParticipantMode('user');
    } catch (error) {
      toast.error('Failed to add from departments: ' + (error as Error).message);
    } finally {
      setAddingFromDepartments(false);
    }
  };

  const participantUserIds = participants.map((p) => p.userId);
  const userOptions: MultiSelectOption[] = tenantUsers.map((u) => ({
    value: u.id,
    label: `${u.firstName} ${u.lastName}`,
    note: u.status !== 'active' ? '(inactive)' : undefined,
  }));
  const departmentOptions: MultiSelectOption[] = departments.map((d) => ({ value: d.id, label: d.name }));

  return (
    <>
      <div className="form-group">
        <label htmlFor="pipeline-assignment-mode">Owner auto-assignment</label>
        <select id="pipeline-assignment-mode" value={unifiedModeValue} onChange={(e) => handleUnifiedModeChange(e.target.value)}>
          <option value="">Off — owner must always be chosen manually</option>
          <option value="round_robin_user">Round robin — by user</option>
          <option value="round_robin_department">Round robin — by department</option>
          {pipeline.type === 'account' && (
            <option value="account_owner">Account owner — use the Company's Account Owner</option>
          )}
        </select>
        {pipeline.assignmentMode === 'account_owner' && (
          <p className="mt-1 text-xs text-gray-500">
            Used when the Company has an Account Owner set. Falls back to round robin over the participants below
            when it doesn't.
          </p>
        )}
      </div>

      {pipeline.assignmentMode && (
        <div className="form-group">
          <label htmlFor={participantMode === 'user' ? 'pipeline-participants' : 'pipeline-departments'}>Round-robin participants</label>
          <p className="mb-1 text-xs text-gray-500">
            Only currently-active employees are ever picked when it's their turn. A user with no linked Employee
            record can be added here but will always be skipped.
          </p>

          {participantMode === 'user' ? (
            <MultiSelectDropdown
              id="pipeline-participants"
              options={userOptions}
              selected={participantUserIds}
              onChange={handleParticipantsChange}
              placeholder={participantsLoading ? 'Loading…' : 'Select participants…'}
              emptyMessage="No users in this tenant yet."
              loading={participantsLoading}
            />
          ) : (
            <>
              <p className="mb-1 text-xs text-gray-500">
                One-time add — adds whoever currently has an Employee in the selected department(s). Not a live
                link: later department changes won't update this list automatically.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <MultiSelectDropdown
                    id="pipeline-departments"
                    options={departmentOptions}
                    selected={selectedDepartmentIds}
                    onChange={setSelectedDepartmentIds}
                    placeholder={participantsLoading ? 'Loading…' : 'Select departments…'}
                    emptyMessage="No departments configured yet."
                    loading={participantsLoading}
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={selectedDepartmentIds.length === 0 || addingFromDepartments}
                  onClick={handleAddFromDepartments}
                >
                  {addingFromDepartments ? 'Adding…' : 'Add selected'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="pipeline-stalled-threshold">Stalled-deal reminders</label>
        <div className="flex items-center gap-2">
          <input
            id="pipeline-stalled-threshold"
            type="number"
            min={1}
            className="select-compact"
            style={{ width: 80 }}
            placeholder="Off"
            value={stalledDraft}
            onChange={(e) => setStalledDraft(e.target.value)}
            onBlur={handleStalledBlur}
          />
          <span className="text-sm text-gray-500">days in the same stage before notifying the owner</span>
        </div>
      </div>
    </>
  );
}

interface PipelineAutomationCreateFieldsProps {
  token: string;
  type: 'lead' | 'account';
  assignmentMode: PipelineAssignmentMode | null;
  onAssignmentModeChange: (mode: PipelineAssignmentMode | null) => void;
  participantUserIds: string[];
  onParticipantUserIdsChange: (ids: string[]) => void;
  departmentIds: string[];
  onDepartmentIdsChange: (ids: string[]) => void;
  stalledThresholdDraft: string;
  onStalledThresholdDraftChange: (value: string) => void;
}

// Create-mode counterpart of PipelineAutomationEditor — found by the user
// 2026-08-25: automations were edit-only, so nobody would ever discover the
// feature exists unless they thought to go edit a freshly created pipeline.
// Unlike the edit-mode version, nothing here calls the API directly — the
// pipeline doesn't exist yet, so every choice is draft state owned by the
// parent (mirrors how `createStages` already works) and gets applied by
// handleCreatePipeline once a real pipeline id exists.
function PipelineAutomationCreateFields({
  token,
  type,
  assignmentMode,
  onAssignmentModeChange,
  participantUserIds,
  onParticipantUserIdsChange,
  departmentIds,
  onDepartmentIdsChange,
  stalledThresholdDraft,
  onStalledThresholdDraftChange,
}: PipelineAutomationCreateFieldsProps) {
  const toast = useToast();
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [departments, setDepartments] = useState<FieldCatalogDefinition[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  // Exclusive choice, not two "optional" tools shown together (user feedback
  // 2026-08-26) — mirrors PipelineAutomationEditor's own toggle.
  const [participantMode, setParticipantMode] = useState<'user' | 'department'>('user');

  // Single select surfaces 3-4 real choices directly (Off / Round robin — by
  // user / Round robin — by department / Account owner) — see
  // PipelineAutomationEditor's own identical comment for why this replaced a
  // mode select plus a second, nested "how" select (user feedback 2026-08-26).
  const unifiedModeValue = assignmentMode === 'round_robin' ? `round_robin_${participantMode}` : assignmentMode ?? '';

  const handleUnifiedModeChange = (value: string) => {
    if (value === 'round_robin_user' || value === 'round_robin_department') {
      const mode = value === 'round_robin_user' ? 'user' : 'department';
      setParticipantMode(mode);
      if (mode === 'user') {
        onDepartmentIdsChange([]);
      } else {
        onParticipantUserIdsChange([]);
      }
      onAssignmentModeChange('round_robin');
    } else {
      onAssignmentModeChange(value === '' ? null : (value as PipelineAssignmentMode));
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listTenantUsers(token), api.listFieldCatalogDefinitions(token, 'department')])
      .then(([users, depts]) => {
        if (cancelled) return;
        setTenantUsers(users);
        setDepartments(depts);
      })
      .catch((error) => toast.error('Failed to load users/departments: ' + (error as Error).message))
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userOptions: MultiSelectOption[] = tenantUsers.map((u) => ({
    value: u.id,
    label: `${u.firstName} ${u.lastName}`,
    note: u.status !== 'active' ? '(inactive)' : undefined,
  }));
  const departmentOptions: MultiSelectOption[] = departments.map((d) => ({ value: d.id, label: d.name }));

  return (
    <>
      <div className="form-group">
        <label htmlFor="new-pipeline-assignment-mode">Owner auto-assignment</label>
        <select id="new-pipeline-assignment-mode" value={unifiedModeValue} onChange={(e) => handleUnifiedModeChange(e.target.value)}>
          <option value="">Off — owner must always be chosen manually</option>
          <option value="round_robin_user">Round robin — by user</option>
          <option value="round_robin_department">Round robin — by department</option>
          {type === 'account' && <option value="account_owner">Account owner — use the Company's Account Owner</option>}
        </select>
        {assignmentMode === 'account_owner' && (
          <p className="mt-1 text-xs text-gray-500">
            Used when the Company has an Account Owner set. Falls back to round robin over the participants below
            when it doesn't.
          </p>
        )}
      </div>

      {assignmentMode && (
        <div className="form-group">
          <label htmlFor={participantMode === 'user' ? 'new-pipeline-participants' : 'new-pipeline-departments'}>
            Round-robin participants
            {assignmentMode === 'round_robin' && <RequiredMark />}
          </label>
          <p className="mb-1 text-xs text-gray-500">
            {assignmentMode === 'account_owner'
              ? "Used only as a fallback, when the Company has no Account Owner set. Only currently-active employees are ever picked."
              : "Only currently-active employees are ever picked when it's their turn. Can be changed later too."}
          </p>

          {participantMode === 'user' ? (
            <MultiSelectDropdown
              id="new-pipeline-participants"
              options={userOptions}
              selected={participantUserIds}
              onChange={onParticipantUserIdsChange}
              placeholder={loadingOptions ? 'Loading…' : 'Select participants…'}
              emptyMessage="No users in this tenant yet."
              loading={loadingOptions}
            />
          ) : (
            <>
              <p className="mb-1 text-xs text-gray-500">
                One-time add — adds whoever currently has an Employee in the selected department(s) as participants,
                once this pipeline is created.
              </p>
              <MultiSelectDropdown
                id="new-pipeline-departments"
                options={departmentOptions}
                selected={departmentIds}
                onChange={onDepartmentIdsChange}
                placeholder={loadingOptions ? 'Loading…' : 'Select departments…'}
                emptyMessage="No departments configured yet."
                loading={loadingOptions}
              />
            </>
          )}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="new-pipeline-stalled-threshold">Stalled-deal reminders</label>
        <div className="flex items-center gap-2">
          <input
            id="new-pipeline-stalled-threshold"
            type="number"
            min={1}
            className="select-compact"
            style={{ width: 80 }}
            placeholder="Off"
            value={stalledThresholdDraft}
            onChange={(e) => onStalledThresholdDraftChange(e.target.value)}
          />
          <span className="text-sm text-gray-500">days in the same stage before notifying the owner</span>
        </div>
      </div>
    </>
  );
}

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
  // Automations, available from creation on (user feedback 2026-08-25: an
  // edit-only Automations section meant nobody would ever discover it).
  const [createAssignmentMode, setCreateAssignmentMode] = useState<PipelineAssignmentMode | null>(null);
  const [createParticipantUserIds, setCreateParticipantUserIds] = useState<string[]>([]);
  const [createDepartmentIds, setCreateDepartmentIds] = useState<string[]>([]);
  const [createStalledThresholdDraft, setCreateStalledThresholdDraft] = useState('');

  useEffect(() => {
    setLoading(true);
    loadPipelines().finally(() => setLoading(false));
    api.listOpportunities(token).then(setOpportunities).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deliberately never touches `loading` — this is also the background
  // refresh called after every single field save in the Edit modal (rename,
  // stage color/outcome/probability/archive/reorder, add stage). Flipping
  // `loading` here used to unmount the ENTIRE page (table + modal + editor)
  // behind a "Loading..." placeholder and remount it on every one of those
  // saves — the real cause of the "screen refresh" the user reported
  // 2026-08-25, not (or not only) the drag-state re-render scope fixed
  // earlier the same day. `loading` now only gets set by the initial mount
  // effect above, where there's genuinely nothing on screen yet.
  const loadPipelines = async () => {
    try {
      const data = await api.listPipelines(token);
      setPipelines(data);
    } catch (error) {
      toast.error('Failed to load pipelines: ' + (error as Error).message);
    }
  };

  const openCreate = () => {
    setEditingPipelineId(null);
    setCreateName('');
    setCreateType('lead');
    setCreateStages(defaultDraftStages());
    setCreateAssignmentMode(null);
    setCreateParticipantUserIds([]);
    setCreateDepartmentIds([]);
    setCreateStalledThresholdDraft('');
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
    // Round robin (either flavor) needs at least one participant to actually
    // do anything — required the same way Name/Type are (user feedback
    // 2026-08-26). account_owner is exempt: it degrades gracefully to the
    // Company's Account Owner even with zero fallback participants.
    if (createAssignmentMode === 'round_robin' && createParticipantUserIds.length === 0 && createDepartmentIds.length === 0) {
      toast.error('Round robin requires at least one participant, by user or by department.');
      return;
    }
    setCreating(true);
    try {
      const trimmedStalled = createStalledThresholdDraft.trim();
      const parsedStalled = trimmedStalled === '' ? null : Number.parseInt(trimmedStalled, 10);
      const pipeline = await api.createPipeline(token, {
        name,
        type: createType,
        order: pipelines.length,
        assignmentMode: createAssignmentMode,
        stalledThresholdDays: parsedStalled !== null && Number.isFinite(parsedStalled) ? parsedStalled : null,
      });
      const stagesToCreate = createStages.filter((s) => s.name.trim());
      for (let i = 0; i < stagesToCreate.length; i++) {
        const stage = stagesToCreate[i];
        const parsedProbability = Number.parseInt(stage.probability, 10);
        await api.createPipelineStage(token, pipeline.id, {
          name: stage.name.trim(),
          order: i,
          outcome: stage.outcome,
          probability: Number.isFinite(parsedProbability) ? parsedProbability : undefined,
          notifyOwnerOnEnter: stage.notifyOwnerOnEnter,
        });
      }
      // Automation participants — applied after creation, same "draft until
      // Save" idiom as Stages above (docs/tareas/specredisenosalesv2.md §3.8).
      for (const userId of createParticipantUserIds) {
        await api.assignUserToPipeline(token, pipeline.id, userId);
      }
      if (createDepartmentIds.length > 0) {
        await api.assignPipelineUsersByDepartments(token, pipeline.id, createDepartmentIds);
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
              <span>Automations</span>
              <PipelineAutomationEditor pipeline={editingPipeline} token={token} onPipelineChanged={loadPipelines} />
            </div>
            <div className="form-group">
              <span>Stages</span>
              <StageEditor pipeline={editingPipeline} token={token} onChanged={loadPipelines} />
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
              <select
                id="new-pipeline-type"
                value={createType}
                onChange={(e) => {
                  const nextType = e.target.value as 'lead' | 'account';
                  setCreateType(nextType);
                  // account_owner only makes sense on an `account` pipeline
                  // (backend rejects the combination) — drop it rather than
                  // submit a stale, now-invalid choice.
                  if (nextType === 'lead' && createAssignmentMode === 'account_owner') {
                    setCreateAssignmentMode(null);
                  }
                }}
              >
                <option value="lead">Leads — unqualified prospects, company optional</option>
                <option value="account">Account — an already-identified company</option>
              </select>
            </div>

            <div className="form-group">
              <span>Automations</span>
              <PipelineAutomationCreateFields
                token={token}
                type={createType}
                assignmentMode={createAssignmentMode}
                onAssignmentModeChange={setCreateAssignmentMode}
                participantUserIds={createParticipantUserIds}
                onParticipantUserIdsChange={setCreateParticipantUserIds}
                departmentIds={createDepartmentIds}
                onDepartmentIdsChange={setCreateDepartmentIds}
                stalledThresholdDraft={createStalledThresholdDraft}
                onStalledThresholdDraftChange={setCreateStalledThresholdDraft}
              />
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
                  <span style={{ width: 56, textAlign: 'center' }} title="Notify the owner (in-app + email) when a deal enters this stage">
                    Notify
                  </span>
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
                    <span style={{ width: 56, display: 'flex', justifyContent: 'center' }}>
                      <input
                        type="checkbox"
                        checked={stage.notifyOwnerOnEnter}
                        onChange={(e) => updateDraftStage(stage.key, { notifyOwnerOnEnter: e.target.checked })}
                        title="Notify the owner (in-app + email) when a deal enters this stage"
                      />
                    </span>
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
