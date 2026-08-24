import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { Pipeline, PipelineStageDefinition, PipelineStageOutcome, PipelineType, Prisma } from '@prisma/client';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Default seed at tenant creation, mirroring seedDefaultStatusDefinitions —
// two starter pipelines the tenant can rename/archive/add more of. Stage
// names/outcomes are a generic 4-stage funnel (New/In Progress open, Won/Lost
// terminal) since the spec didn't prescribe specific stage content, just the
// 2 pipeline names. "Leads" seeds as type `lead` (unqualified prospects,
// company optional), "Clientes" as type `account` (an already-identified
// company) — see the PipelineType doc comment in schema.prisma.
const DEFAULT_PIPELINES: { name: string; type: PipelineType }[] = [
  { name: 'Leads', type: 'lead' },
  { name: 'Clientes', type: 'account' },
];
const DEFAULT_STAGES: { name: string; order: number; outcome: PipelineStageOutcome; probability: number }[] = [
  // Weighted-forecast seed formula (docs/tareas/specredisenosalesv2.md §3.5):
  // for the N `open` stages of a new Pipeline, the first starts at 10%, the
  // last at 80%, interpolated in between (10 + i × 70/(N-1)) — here N=2, so
  // that's just the two endpoints directly. `won`/`lost` are always 100/0.
  { name: 'New', order: 0, outcome: 'open', probability: 10 },
  { name: 'In Progress', order: 1, outcome: 'open', probability: 80 },
  { name: 'Won', order: 2, outcome: 'won', probability: 100 },
  { name: 'Lost', order: 3, outcome: 'lost', probability: 0 },
];

// Two createMany calls (not N sequential creates) — this runs inside the
// tenant-registration transaction alongside seedDefaultStatusDefinitions, and
// each extra round trip there eats into Prisma's interactive-transaction
// timeout against Neon's network latency. IDs are generated client-side so
// the stage rows' pipelineId FK is known upfront without needing the
// pipeline creates' results back (createMany doesn't return created rows).
export async function seedDefaultPipelines(tx: PrismaTx, tenantId: string): Promise<void> {
  const pipelines = DEFAULT_PIPELINES.map((def, i) => ({
    id: randomUUID(),
    tenantId,
    name: def.name,
    type: def.type,
    order: i,
  }));
  await tx.pipeline.createMany({ data: pipelines });

  const stages = pipelines.flatMap((pipeline) =>
    DEFAULT_STAGES.map((stage) => ({
      tenantId,
      pipelineId: pipeline.id,
      name: stage.name,
      order: stage.order,
      outcome: stage.outcome,
      probability: stage.probability,
    })),
  );
  await tx.pipelineStageDefinition.createMany({ data: stages });
}

export interface CreatePipelineInput {
  tenantId: string;
  name: string;
  type: PipelineType;
  order?: number;
}

// `type` deliberately excluded — immutable once a Pipeline is created (see
// docs/tareas/specredisenosalesv2.md §3.1). Reclassifying a pipeline that
// already has Opportunities would silently change which Company-gate rule
// applies to them (src/routes/opportunities.ts's validateOpportunityRefs).
export interface UpdatePipelineInput {
  name?: string;
  order?: number;
  isActive?: boolean;
}

export interface PipelineResult {
  success: boolean;
  pipeline?: Pipeline;
  error?: string;
}

export async function createPipeline(input: CreatePipelineInput): Promise<Pipeline> {
  return prisma.pipeline.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      type: input.type,
      order: input.order ?? 0,
    },
  });
}

export async function listPipelines(tenantId: string) {
  return prisma.pipeline.findMany({
    where: { tenantId },
    orderBy: { order: 'asc' },
    include: {
      stages: { orderBy: { order: 'asc' } },
    },
  });
}

export async function findPipelineById(id: string): Promise<Pipeline | null> {
  return prisma.pipeline.findUnique({ where: { id } });
}

export async function updatePipeline(id: string, tenantId: string, input: UpdatePipelineInput): Promise<PipelineResult> {
  const existing = await prisma.pipeline.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Pipeline not found' };
  }

  const data: Prisma.PipelineUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.order !== undefined) data.order = input.order;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const pipeline = await prisma.pipeline.update({ where: { id }, data });
  return { success: true, pipeline };
}

export interface CreatePipelineStageInput {
  tenantId: string;
  pipelineId: string;
  name: string;
  color?: string | null;
  order?: number;
  outcome?: PipelineStageOutcome;
  probability?: number;
}

export interface UpdatePipelineStageInput {
  name?: string;
  color?: string | null;
  order?: number;
  outcome?: PipelineStageOutcome;
  probability?: number;
  isActive?: boolean;
}

export interface PipelineStageResult {
  success: boolean;
  stage?: PipelineStageDefinition;
  error?: string;
}

// Forced regardless of what the client sends — `won`/`lost` are always
// 100/0, never tenant-editable, matching the spec's "forzado en backend, no
// depende de que el tenant lo configure bien" (docs/tareas/specredisenosalesv2.md
// §3.5). Only `open` stages take the tenant-supplied value (defaulting to 50
// — see the `probability` field's own schema comment for why there's no
// N-based interpolation here, unlike the tenant-registration seed).
function resolveProbability(outcome: PipelineStageOutcome, requested: number | undefined): number {
  if (outcome === 'won') return 100;
  if (outcome === 'lost') return 0;
  return requested ?? 50;
}

export async function createPipelineStage(input: CreatePipelineStageInput): Promise<PipelineStageDefinition> {
  const outcome = input.outcome ?? 'open';
  return prisma.pipelineStageDefinition.create({
    data: {
      tenantId: input.tenantId,
      pipelineId: input.pipelineId,
      name: input.name,
      color: input.color ?? null,
      order: input.order ?? 0,
      outcome,
      probability: resolveProbability(outcome, input.probability),
    },
  });
}

export async function findPipelineStageById(id: string): Promise<PipelineStageDefinition | null> {
  return prisma.pipelineStageDefinition.findUnique({ where: { id } });
}

export async function updatePipelineStage(
  id: string,
  tenantId: string,
  input: UpdatePipelineStageInput,
): Promise<PipelineStageResult> {
  const existing = await prisma.pipelineStageDefinition.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Stage not found' };
  }

  const data: Prisma.PipelineStageDefinitionUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.color !== undefined) data.color = input.color;
  if (input.order !== undefined) data.order = input.order;
  if (input.outcome !== undefined) data.outcome = input.outcome;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.outcome !== undefined || input.probability !== undefined) {
    data.probability = resolveProbability(input.outcome ?? existing.outcome, input.probability);
  }

  const stage = await prisma.pipelineStageDefinition.update({ where: { id }, data });
  return { success: true, stage };
}
