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
import {
  assignUserToPipeline,
  assignUsersByDepartments,
  listPipelineAssignmentUsers,
  unassignUserFromPipeline,
} from '../modules/crm/pipelineAssignmentService.js';
import { findUserById } from '../modules/tenant/tenantService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const VALID_OUTCOMES = ['open', 'won', 'lost'];
const VALID_PIPELINE_TYPES = ['lead', 'account'];
const VALID_ASSIGNMENT_MODES = ['round_robin', 'account_owner'];

// Shared by the stage POST/PATCH handlers — `undefined` (not provided) is
// always valid, since resolveProbability's own default/forcing applies then.
function isValidProbability(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

// null clears the reminder (off); undefined is always valid (not provided).
function isValidStalledThreshold(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1);
}

function isValidAssignmentMode(value: unknown): boolean {
  return value === null || VALID_ASSIGNMENT_MODES.includes(value as string);
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

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (!VALID_PIPELINE_TYPES.includes(req.body.type)) {
    return res.status(400).json({ error: "type must be 'lead' or 'account'" });
  }

  if (req.body.assignmentMode !== undefined && !isValidAssignmentMode(req.body.assignmentMode)) {
    return res.status(400).json({ error: "assignmentMode must be 'round_robin', 'account_owner', or null" });
  }

  // account_owner only makes sense on an `account` Pipeline — it defers to
  // Company.accountOwnerId, which a `lead` Opportunity may not even have yet
  // (docs/tareas/specredisenosalesv2.md §3.8).
  if (req.body.assignmentMode === 'account_owner' && req.body.type !== 'account') {
    return res.status(400).json({ error: "assignmentMode 'account_owner' requires type 'account'" });
  }

  if (req.body.stalledThresholdDays !== undefined && !isValidStalledThreshold(req.body.stalledThresholdDays)) {
    return res.status(400).json({ error: 'stalledThresholdDays must be a positive integer or null' });
  }

  const pipeline = await createPipeline({
    tenantId: user.tenantId!,
    name: name.trim(),
    type: req.body.type,
    order: req.body.order,
    createdById: user.id,
    assignmentMode: req.body.assignmentMode,
    stalledThresholdDays: req.body.stalledThresholdDays,
  });
  return res.status(201).json(pipeline);
});

pipelinesRouter.patch('/api/pipelines/:pipelineId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (req.body.assignmentMode !== undefined && !isValidAssignmentMode(req.body.assignmentMode)) {
    return res.status(400).json({ error: "assignmentMode must be 'round_robin', 'account_owner', or null" });
  }

  if (req.body.assignmentMode === 'account_owner') {
    const pipeline = await findPipelineById(req.params.pipelineId);
    if (!pipeline || pipeline.tenantId !== user.tenantId) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }
    if (pipeline.type !== 'account') {
      return res.status(400).json({ error: "assignmentMode 'account_owner' requires type 'account'" });
    }
  }

  if (req.body.stalledThresholdDays !== undefined && !isValidStalledThreshold(req.body.stalledThresholdDays)) {
    return res.status(400).json({ error: 'stalledThresholdDays must be a positive integer or null' });
  }

  // `type` is immutable after creation (docs/tareas/specredisenosalesv2.md
  // §3.1) — silently ignored here rather than erroring, since the frontend
  // no longer sends it and a stray value shouldn't break unrelated updates.
  const result = await updatePipeline(req.params.pipelineId, user.tenantId!, {
    name: req.body.name,
    order: req.body.order,
    isActive: req.body.isActive,
    assignmentMode: req.body.assignmentMode,
    stalledThresholdDays: req.body.stalledThresholdDays,
    updatedById: user.id,
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

  if (!canManageCustomFields(user.roleContext)) {
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

  if (req.body.notifyOwnerOnEnter !== undefined && typeof req.body.notifyOwnerOnEnter !== 'boolean') {
    return res.status(400).json({ error: 'notifyOwnerOnEnter must be a boolean' });
  }

  const stage = await createPipelineStage(
    {
      tenantId: user.tenantId!,
      pipelineId: req.params.pipelineId,
      name: name.trim(),
      color: req.body.color,
      order: req.body.order,
      outcome: req.body.outcome,
      probability: req.body.probability,
      notifyOwnerOnEnter: req.body.notifyOwnerOnEnter,
    },
    user.id,
  );

  return res.status(201).json(stage);
});

pipelinesRouter.patch('/api/pipelines/:pipelineId/stages/:stageId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
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

  if (req.body.notifyOwnerOnEnter !== undefined && typeof req.body.notifyOwnerOnEnter !== 'boolean') {
    return res.status(400).json({ error: 'notifyOwnerOnEnter must be a boolean' });
  }

  const result = await updatePipelineStage(
    req.params.stageId,
    user.tenantId!,
    {
      name: req.body.name,
      color: req.body.color,
      order: req.body.order,
      outcome: req.body.outcome,
      probability: req.body.probability,
      isActive: req.body.isActive,
      notifyOwnerOnEnter: req.body.notifyOwnerOnEnter,
    },
    user.id,
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.stage);
});

// Round-robin participants (docs/tareas/specredisenosalesv2.md §3.8) — mirrors
// the /api/hr/employees/:employeeId/time-off-policies routes' shape exactly.

pipelinesRouter.get('/api/pipelines/:pipelineId/assignment-users', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const pipeline = await findPipelineById(req.params.pipelineId);
  if (!pipeline || pipeline.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }

  const assignments = await listPipelineAssignmentUsers(user.tenantId!, req.params.pipelineId);
  return res.json(assignments);
});

pipelinesRouter.post('/api/pipelines/:pipelineId/assignment-users', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const pipeline = await findPipelineById(req.params.pipelineId);
  if (!pipeline || pipeline.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }

  if (!req.body.userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const targetUser = await findUserById(req.body.userId);
  if (!targetUser || targetUser.tenantId !== user.tenantId) {
    return res.status(400).json({ error: 'User not found' });
  }

  const result = await assignUserToPipeline(user.tenantId!, req.params.pipelineId, req.body.userId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.assignment);
});

pipelinesRouter.delete('/api/pipelines/:pipelineId/assignment-users/:userId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const pipeline = await findPipelineById(req.params.pipelineId);
  if (!pipeline || pipeline.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }

  const result = await unassignUserFromPipeline(user.tenantId!, req.params.pipelineId, req.params.userId);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.status(204).end();
});

// Bulk-add convenience, not a live binding (docs/tareas/specredisenosalesv2.md
// §3.8) — see assignUsersByDepartments's own doc comment. Just inserts
// ordinary assignment-user rows for whoever currently has an Employee in the
// given departments.
pipelinesRouter.post('/api/pipelines/:pipelineId/assignment-users/from-departments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const pipeline = await findPipelineById(req.params.pipelineId);
  if (!pipeline || pipeline.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }

  if (!Array.isArray(req.body.departmentIds) || req.body.departmentIds.length === 0) {
    return res.status(400).json({ error: 'departmentIds must be a non-empty array' });
  }

  const result = await assignUsersByDepartments(user.tenantId!, req.params.pipelineId, req.body.departmentIds);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json({
    resolvedUserCount: result.resolvedUserCount,
    addedCount: result.addedCount,
    alreadyAssignedCount: result.alreadyAssignedCount,
  });
});
