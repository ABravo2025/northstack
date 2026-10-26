import prisma from '../../lib/prisma.js';
import type { PaymentAccountSubType } from '@prisma/client';
import { encryptPaymentAccountData } from '../../lib/encryption.js';
import { setEmployeeTaxId } from './employeeTaxIdService.js';
import {
  checkSigningTaxId,
  listSigningPaymentMethods,
  renderSignedContractPdf,
  sendSignedContractCopy,
  taxIdAsked,
  type ContractConfirmationDetails,
} from './contractConfirmationService.js';

// Contracts tab of the People detail panel (2026-10-26): every EmployeeCompensation row of one
// person, each with where it stands. A contract only ever needs a signature when it's the
// person's first-ever one (blocksParticipation) — a raise/reassignment never re-asks.
export type ContractGroup = 'pending_signature' | 'active' | 'upcoming' | 'ended';
export type ContractSignature = 'signed' | 'pending' | 'overdue' | 'not_required';

export interface EmployeeContractEntry {
  id: string;
  group: ContractGroup;
  signature: ContractSignature;
  compensationType: 'hourly' | 'fixed';
  rateCents: number;
  currency: string;
  payFrequencyName: string;
  jobTitle: string;
  description: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  confirmedAt: string | null;
  confirmedIp: string | null;
  paymentMethodName: string | null;
  createdAt: string;
  createdByName: string | null;
  hasContractPdf: boolean;
  // The one "Resend" acts on (contractPdfService.ts's findRelevantCompensation): the open
  // contract, else the latest.
  isCurrent: boolean;
}

// Same 3 days as employeeService.ts's CONTRACT_EXPIRY_DAYS — after that an unsigned first
// contract shows as overdue.
const SIGNATURE_OVERDUE_DAYS = 3;

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function listEmployeeContracts(tenantId: string, employeeId: string): Promise<{ success: boolean; contracts?: EmployeeContractEntry[]; error?: string }> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { tenantId: true } });
  if (!employee || employee.tenantId !== tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const rows = await prisma.employeeCompensation.findMany({
    where: { tenantId, employeeId },
    // Never the encrypted account data nor the PDF bytes — those stay behind their own endpoints.
    select: {
      id: true,
      compensationType: true,
      rateCents: true,
      currency: true,
      jobTitle: true,
      description: true,
      effectiveFrom: true,
      effectiveTo: true,
      note: true,
      confirmedAt: true,
      confirmedIp: true,
      blocksParticipation: true,
      createdAt: true,
      payFrequency: { select: { name: true } },
      paymentMethod: { select: { name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });
  const withPdf = new Set(
    (await prisma.employeeCompensation.findMany({
      where: { tenantId, employeeId, contractPdf: { not: null } },
      select: { id: true },
    })).map((r) => r.id),
  );

  const open = rows.filter((r) => r.effectiveTo === null).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const latest = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const currentId = (open ?? latest)?.id;

  const today = startOfTodayUtc();
  const contracts = rows.map((r): EmployeeContractEntry => {
    let signature: ContractSignature = 'not_required';
    if (r.blocksParticipation) {
      if (r.confirmedAt) signature = 'signed';
      else signature = (Date.now() - r.createdAt.getTime()) / 86_400_000 > SIGNATURE_OVERDUE_DAYS ? 'overdue' : 'pending';
    }
    const ended = r.effectiveTo !== null && r.effectiveTo < today;
    let group: ContractGroup;
    if (ended) group = 'ended';
    else if (signature === 'pending' || signature === 'overdue') group = 'pending_signature';
    else if (r.effectiveFrom > today) group = 'upcoming';
    else group = 'active';

    return {
      id: r.id,
      group,
      signature,
      compensationType: r.compensationType,
      rateCents: r.rateCents,
      currency: r.currency,
      payFrequencyName: r.payFrequency.name,
      jobTitle: r.jobTitle,
      description: r.description,
      effectiveFrom: r.effectiveFrom.toISOString(),
      effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
      note: r.note,
      confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      confirmedIp: r.confirmedIp,
      paymentMethodName: r.paymentMethod?.name ?? null,
      createdAt: r.createdAt.toISOString(),
      createdByName: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}`.trim() : null,
      hasContractPdf: withPdf.has(r.id),
      isCurrent: r.id === currentId,
    };
  });

  return { success: true, contracts };
}

// One specific contract's PDF (draft or signed) — the existing /contract-pdf only ever serves the
// current one.
export async function getContractPdfById(tenantId: string, employeeId: string, compensationId: string): Promise<{ success: boolean; pdfBytes?: Uint8Array; error?: string }> {
  const row = await prisma.employeeCompensation.findUnique({
    where: { id: compensationId },
    select: { tenantId: true, employeeId: true, contractPdf: true },
  });
  if (!row || row.tenantId !== tenantId || row.employeeId !== employeeId) {
    return { success: false, error: 'Contract not found' };
  }
  if (!row.contractPdf) {
    return { success: false, error: 'No contract document stored for this contract' };
  }
  return { success: true, pdfBytes: row.contractPdf };
}

// ── My contract: signing a first contract while logged in ──────────────────────────────────

async function findMyUnsignedContract(userId: string, tenantId: string) {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    include: { timeOffPolicies: { include: { timeOffPolicy: true } } },
  });
  if (!employee || employee.tenantId !== tenantId) return null;
  const compensation = await prisma.employeeCompensation.findFirst({
    where: { tenantId, employeeId: employee.id, blocksParticipation: true, confirmedAt: null },
    include: { payFrequency: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!compensation) return null;
  return { employee, compensation };
}

export type MyPendingContract = Omit<ContractConfirmationDetails, 'email'> & { compensationId: string; countryOfResidence: string | null };

export async function getMyPendingContract(userId: string, tenantId: string): Promise<MyPendingContract | null> {
  const found = await findMyUnsignedContract(userId, tenantId);
  if (!found) return null;
  const { employee, compensation } = found;
  const [tenant, paymentMethods] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    listSigningPaymentMethods(tenantId),
  ]);
  return {
    compensationId: compensation.id,
    tenantName: tenant.name,
    employeeFirstName: employee.firstName,
    employeeLastName: employee.lastName,
    jobTitle: compensation.jobTitle,
    description: compensation.description,
    compensationType: compensation.compensationType,
    rateCents: compensation.rateCents,
    currency: compensation.currency,
    payFrequencyName: compensation.payFrequency.name,
    effectiveFrom: compensation.effectiveFrom.toISOString(),
    nationality: employee.nationality,
    countryOfResidence: employee.countryOfResidence,
    timeOffPolicyNames: employee.timeOffPolicies.map((a) => a.timeOffPolicy.name),
    paymentMethods,
    taxId: await taxIdAsked(tenant, employee.id, employee.personType),
  };
}

export interface ConfirmMyContractInput {
  userId: string;
  tenantId: string;
  compensationId: string;
  countryOfResidence: string;
  paymentMethodId: string;
  paymentAccountSubType?: PaymentAccountSubType | null;
  paymentAccountData: string;
  taxId?: string;
  acceptedContract: boolean;
  ip: string;
}

// Same checks and same end state as contractConfirmationService.ts's confirmContract, minus
// everything about creating the account (phone, password, terms — this person already has one).
export async function confirmMyContract(input: ConfirmMyContractInput): Promise<{ success: boolean; error?: string; field?: string }> {
  const found = await findMyUnsignedContract(input.userId, input.tenantId);
  // compensationId pins what the person actually read — if it changed underneath them, refuse.
  if (!found || found.compensation.id !== input.compensationId) {
    return { success: false, error: 'This contract is no longer waiting for your signature' };
  }
  const { employee, compensation } = found;

  if (!input.acceptedContract) {
    return { success: false, error: 'You must accept the contract to continue', field: 'acceptedContract' };
  }
  if (!input.countryOfResidence.trim()) {
    return { success: false, error: 'Country of residence is required', field: 'countryOfResidence' };
  }
  if (!input.paymentAccountData.trim()) {
    return { success: false, error: 'Payment account details are required', field: 'paymentAccountData' };
  }
  const paymentMethod = await prisma.paymentMethodDefinition.findUnique({ where: { id: input.paymentMethodId } });
  if (!paymentMethod || paymentMethod.tenantId !== input.tenantId || !paymentMethod.isActive) {
    return { success: false, error: 'Payment method not found', field: 'paymentMethodId' };
  }

  const [tenant, signer] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: input.tenantId } }),
    prisma.user.findUniqueOrThrow({ where: { id: input.userId } }),
  ]);
  // Same tax ID question as the invitation flow (contractConfirmationService.ts).
  const taxIdAsk = await taxIdAsked(tenant, employee.id, employee.personType);
  const taxIdRaw = (input.taxId ?? '').trim();
  const taxIdError = checkSigningTaxId(taxIdAsk, taxIdRaw);
  if (taxIdError) {
    return { success: false, error: taxIdError, field: 'taxId' };
  }
  const confirmedAt = new Date();
  const signedPdfBuffer = await renderSignedContractPdf(tenant, employee, compensation, confirmedAt, input.ip);
  const encryptedAccountData = encryptPaymentAccountData(input.paymentAccountData.trim());

  const alreadySigned = 'ALREADY_SIGNED';
  try {
    await prisma.$transaction(async (tx) => {
      // Conditional on still being unsigned, so a double submit can't sign twice.
      const updated = await tx.employeeCompensation.updateMany({
        where: { id: compensation.id, confirmedAt: null },
        data: {
          paymentMethodId: paymentMethod.id,
          paymentAccountSubType: input.paymentAccountSubType ?? null,
          paymentAccountDataEncrypted: encryptedAccountData,
          confirmedAt,
          confirmedIp: input.ip,
          contractPdf: signedPdfBuffer,
        },
      });
      if (updated.count === 0) throw new Error(alreadySigned);
      await tx.employee.update({
        where: { id: employee.id },
        data: { countryOfResidence: input.countryOfResidence.trim() },
      });
    });
  } catch (err) {
    if ((err as Error).message === alreadySigned) {
      return { success: false, error: 'This contract is no longer waiting for your signature' };
    }
    throw err;
  }

  await sendSignedContractCopy({
    tenantId: input.tenantId,
    tenantName: tenant.name,
    signer,
    employee,
    createdByUserId: compensation.createdByUserId,
    pdfBuffer: signedPdfBuffer,
  });
  if (taxIdAsk && taxIdRaw) await setEmployeeTaxId(input.tenantId, employee.id, taxIdRaw, input.userId);
  return { success: true };
}
