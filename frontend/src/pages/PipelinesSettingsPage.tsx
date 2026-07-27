import { useEffect, useState } from 'react';
import { api, type Pipeline, type PipelineStage } from '../api';
import { useToast } from '../components/ToastProvider';
import ColorPicker from '../components/ColorPicker';
import { ChevronDownIcon, PencilIcon, PlusIcon } from '../components/Icons';

interface PipelinesSettingsPageProps {
  token: string;
}

const OUTCOME_LABELS: Record<string, string> = { open: 'Open', won: 'Won', lost: 'Lost' };

export default function PipelinesSettingsPage({ token }: PipelinesSettingsPageProps) {
  const toast = useToast();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newStageName, setNewStageName] = useState<Record<string, string>>({});

  useEffect(() => {
    loadPipelines();
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

  const handleCreatePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipelineName.trim()) return;
    try {
      await api.createPipeline(token, { name: newPipelineName.trim(), order: pipelines.length });
      setNewPipelineName('');
      toast.success('Pipeline created.');
      loadPipelines();
    } catch (error) {
      toast.error('Failed to create pipeline: ' + (error as Error).message);
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

  const toggleArchivePipeline = async (pipeline: Pipeline) => {
    try {
      await api.updatePipeline(token, pipeline.id, { isActive: !pipeline.isActive });
      toast.success(pipeline.isActive ? 'Pipeline archived.' : 'Pipeline reactivated.');
      loadPipelines();
    } catch (error) {
      toast.error('Failed to update pipeline: ' + (error as Error).message);
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

  return (
    <div>
      <h3 className="card-title mb-3">Pipelines</h3>
      <p className="text-sm text-gray-500 mb-4">
        Sales pipelines for Opportunities. Each pipeline has its own stages — archiving a pipeline keeps its
        Opportunities visible read-only, it just disappears from creation menus.
      </p>

      <div className="flex flex-col gap-3">
        {pipelines.map((pipeline) => {
          const isExpanded = expandedId === pipeline.id;
          const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);
          return (
            <div key={pipeline.id} className="card" style={{ padding: 0 }}>
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setExpandedId(isExpanded ? null : pipeline.id)}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                </button>

                {renamingId === pipeline.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => submitRename(pipeline.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename(pipeline.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="rounded-md border border-brand-blue px-2 py-1 text-sm"
                  />
                ) : (
                  <span className="font-semibold flex-1">{pipeline.name}</span>
                )}

                {!pipeline.isActive && <span className="chip-linked">Archived</span>}
                <span className="text-xs text-gray-400">{sortedStages.length} stages</span>

                <button type="button" className="icon-btn" onClick={() => startRename(pipeline)}>
                  <span className="tip">Rename</span>
                  <PencilIcon />
                </button>
                <button type="button" className="btn-secondary" onClick={() => toggleArchivePipeline(pipeline)}>
                  {pipeline.isActive ? 'Archive' : 'Reactivate'}
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-800 p-3">
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
                          value={stage.outcome}
                          onChange={(e) => handleStageOutcomeChange(pipeline, stage, e.target.value)}
                        >
                          {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
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
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form className="flex items-center gap-2 mt-4" onSubmit={handleCreatePipeline}>
        <input
          type="text"
          placeholder="New pipeline name"
          value={newPipelineName}
          onChange={(e) => setNewPipelineName(e.target.value)}
          style={{ maxWidth: 220 }}
        />
        <button type="submit" className="btn-primary">
          <span className="inline-flex items-center gap-1.5">
            <PlusIcon className="h-4 w-4" />
            New Pipeline
          </span>
        </button>
      </form>
    </div>
  );
}
