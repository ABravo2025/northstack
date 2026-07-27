import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { Pipeline, PipelineStageDefinition, PipelineStageOutcome, Prisma } from '@prisma/client';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Default seed at tenant creation, mirroring seedDefaultStatusDefinitions —
// two starter pipelines the tenant can rename/archive/add more of. Stage
// names/outcomes are a generic 4-stage funnel (New/In Progress open, Won/Lost
// terminal) since the spec didn't prescribe specific stage content, just the
// 2 pipeline names.
const DEFAULT_PIPELINE_NAMES = ['Leads', 'Clientes'];
const DEFAULT_STAGES: { name: string; order: number; outcome: PipelineStageOutcome }[] = [
  { name: 'New', order: 0, outcome: 'open' },
  { name: 'In Progress', order: 1, outcome: 'open' },
  { name: 'Won', order: 2, outcome: 'won' },
  { name: 'Lost', order: 3, outcome: 'lost' },
];

// Two createMany calls (not N sequential creates) — this runs inside the
// tenant-registration transaction alongside seedDefaultStatusDefinitions, and
// each extra round trip there eats into Prisma's interactive-transaction
// timeout against Neon's network latency. IDs are generated client-side so
// the stage rows' pipelineId FK is known upfront without needing the
// pipeline creates' results back (createMany doesn't return created rows).
export async function seedDefaultPipelines(tx: PrismaTx, tenantId: string): Promise<void> {
  const pipelines = DEFAULT_PIPELINE_NAMES.map((name, i) => ({ id: randomUUID(), tenantId, name, order: i }));
  await tx.pipeline.createMany({ data: pipelines });

  const stages = pipelines.flatMap((pipeline) =>
    DEFAULT_STAGES.map((stage) => ({
      tenantId,
      pipelineId: pipeline.id,
      name: stage.name,
      order: stage.order,
      outcome: stage.outcome,
    })),
  );
  await tx.pipelineStageDefinition.createMany({ data: stages });
}

export interface CreatePipelineInput {
  tenantId: string;
  name: string;
  order?: number;
}

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
}

export interface UpdatePipelineStageInput {
  name?: string;
  color?: string | null;
  order?: number;
  outcome?: PipelineStageOutcome;
  isActive?: boolean;
}

export interface PipelineStageResult {
  success: boolean;
  stage?: PipelineStageDefinition;
  error?: string;
}

export async function createPipelineStage(input: CreatePipelineStageInput): Promise<PipelineStageDefinition> {
  return prisma.pipelineStageDefinition.create({
    data: {
      tenantId: input.tenantId,
      pipelineId: input.pipelineId,
      name: input.name,
      color: input.color ?? null,
      order: input.order ?? 0,
      outcome: input.outcome ?? 'open',
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

  const stage = await prisma.pipelineStageDefinition.update({ where: { id }, data });
  return { success: true, stage };
}
