import { canManageCustomFields } from '../modules/auth/permissionService.js';
import {
  createPipeline,
  createPipelineStage,
  findPipelineById,
  findPipelineStageById,
  listPipelines,
  updatePipeline,
  updatePipelineStage,
} from '../modules/crm/pipelineService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const VALID_OUTCOMES = ['open', 'won', 'lost'];
const VALID_PIPELINE_TYPES = ['lead', 'account'];

// Shared by the stage POST/PATCH handlers — `undefined` (not provided) is
// always valid, since resolveProbability's own default/forcing applies then.
function isValidProbability(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

export const pipelinesRouter = createAsyncRouter();

// Read is open to any authenticated tenant member (same as status-definitions/
// field-catalog) — pipelines are reference data needed to render Opportunity
// forms/boards, not something that needs a stricter gate than viewing them.
pipelinesRouter.get('/api/pipelines', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const pipelines = await listPipelines(user.tenantId!);
  return res.json(pipelines);
});

pipelinesRouter.post('/api/pipelines', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (!VALID_PIPELINE_TYPES.includes(req.body.type)) {
    return res.status(400).json({ error: "type must be 'lead' or 'account'" });
  }

  const pipeline = await createPipeline({
    tenantId: user.tenantId!,
    name: name.trim(),
    type: req.body.type,
    order: req.body.order,
  });
  return res.status(201).json(pipeline);
});

pipelinesRouter.patch('/api/pipelines/:pipelineId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  // `type` is immutable after creation (docs/tareas/specredisenosalesv2.md
  // §3.1) — silently ignored here rather than erroring, since the frontend
  // no longer sends it and a stray value shouldn't break unrelated updates.
  const result = await updatePipeline(req.params.pipelineId, user.tenantId!, {
    name: req.body.name,
    order: req.body.order,
    isActive: req.body.isActive,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.pipeline);
});

pipelinesRouter.post('/api/pipelines/:pipelineId/stages', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const pipeline = await findPipelineById(req.params.pipelineId);
  if (!pipeline || pipeline.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (req.body.outcome !== undefined && !VALID_OUTCOMES.includes(req.body.outcome)) {
    return res.status(400).json({ error: "outcome must be 'open', 'won', or 'lost'" });
  }

  if (req.body.probability !== undefined && !isValidProbability(req.body.probability)) {
    return res.status(400).json({ error: 'probability must be an integer between 0 and 100' });
  }

  const stage = await createPipelineStage({
    tenantId: user.tenantId!,
    pipelineId: req.params.pipelineId,
    name: name.trim(),
    color: req.body.color,
    order: req.body.order,
    outcome: req.body.outcome,
    probability: req.body.probability,
  });

  return res.status(201).json(stage);
});

pipelinesRouter.patch('/api/pipelines/:pipelineId/stages/:stageId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const stage = await findPipelineStageById(req.params.stageId);
  if (!stage || stage.tenantId !== user.tenantId || stage.pipelineId !== req.params.pipelineId) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  if (req.body.outcome !== undefined && !VALID_OUTCOMES.includes(req.body.outcome)) {
    return res.status(400).json({ error: "outcome must be 'open', 'won', or 'lost'" });
  }

  if (req.body.probability !== undefined && !isValidProbability(req.body.probability)) {
    return res.status(400).json({ error: 'probability must be an integer between 0 and 100' });
  }

  const result = await updatePipelineStage(req.params.stageId, user.tenantId!, {
    name: req.body.name,
    color: req.body.color,
    order: req.body.order,
    outcome: req.body.outcome,
    probability: req.body.probability,
    isActive: req.body.isActive,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.stage);
});
