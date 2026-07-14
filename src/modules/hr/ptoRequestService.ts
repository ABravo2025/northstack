import prisma from '../../lib/prisma.js';
import type { PtoRequest, PtoRequestStatus, User } from '@prisma/client';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function countInclusiveDays(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
}

export interface CreatePtoRequestInput {
  tenantId: string;
  employeeId: string;
  ptoPolicyId: string;
  startDate: string;
  endDate: string;
  note?: string;
}

export interface CreatePtoRequestResult {
  success: boolean;
  request?: PtoRequest;
  error?: string;
}

export async function createPtoRequest(input: CreatePtoRequestInput): Promise<CreatePtoRequestResult> {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { success: false, error: 'Invalid start or end date' };
  }
  if (endDate < startDate) {
    return { success: false, error: 'End date must be on or after the start date' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee || employee.tenantId !== input.tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const policy = await prisma.ptoPolicyDefinition.findUnique({ where: { id: input.ptoPolicyId } });
  if (!policy || policy.tenantId !== input.tenantId || !policy.isActive) {
    return { success: false, error: 'PTO policy not found' };
  }

  const assignment = await prisma.employeePtoPolicy.findUnique({
    where: { employeeId_ptoPolicyId: { employeeId: input.employeeId, ptoPolicyId: input.ptoPolicyId } },
  });
  if (!assignment) {
    return { success: false, error: 'This PTO policy is not assigned to you' };
  }

  const daysRequested = countInclusiveDays(startDate, endDate);
  const autoApprove = !policy.requiresApproval;

  const request = await prisma.ptoRequest.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      ptoPolicyId: input.ptoPolicyId,
      startDate,
      endDate,
      daysRequested,
      note: input.note,
      approverId: employee.managerId,
      status: autoApprove ? 'approved' : 'pending',
      decidedAt: autoApprove ? new Date() : null,
      decisionNote: autoApprove ? 'Auto-approved — this policy does not require approval' : null,
    },
  });

  return { success: true, request };
}

export async function listMyPtoRequests(tenantId: string, employeeId: string) {
  return prisma.ptoRequest.findMany({
    where: { tenantId, employeeId },
    include: { ptoPolicy: true, approver: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listPendingApprovals(tenantId: string, approverEmployeeId: string) {
  return prisma.ptoRequest.findMany({
    where: { tenantId, approverId: approverEmployeeId, status: 'pending' },
    include: { ptoPolicy: true, employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function listAllPtoRequests(tenantId: string) {
  return prisma.ptoRequest.findMany({
    where: { tenantId },
    include: {
      ptoPolicy: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
      approver: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export interface DecidePtoRequestResult {
  success: boolean;
  request?: PtoRequest;
  error?: string;
}

export async function decidePtoRequest(
  requestId: string,
  tenantId: string,
  actingUser: User,
  decision: 'approved' | 'rejected',
  decisionNote?: string,
): Promise<DecidePtoRequestResult> {
  const request = await prisma.ptoRequest.findUnique({ where: { id: requestId } });
  if (!request || request.tenantId !== tenantId) {
    return { success: false, error: 'PTO request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'This request has already been decided' };
  }

  const isOwnerOrAdmin = actingUser.role === 'owner' || actingUser.role === 'admin';
  const actingEmployee = await prisma.employee.findUnique({ where: { userId: actingUser.id } });
  const isAssignedApprover = actingEmployee && request.approverId === actingEmployee.id;

  if (!isOwnerOrAdmin && !isAssignedApprover) {
    return { success: false, error: 'You are not authorized to decide this request' };
  }

  const updated = await prisma.ptoRequest.update({
    where: { id: requestId },
    data: {
      status: decision as PtoRequestStatus,
      decidedAt: new Date(),
      decisionNote: decisionNote ?? null,
    },
  });

  return { success: true, request: updated };
}

export interface CancelPtoRequestResult {
  success: boolean;
  error?: string;
}

export async function cancelPtoRequest(
  requestId: string,
  tenantId: string,
  employeeId: string,
): Promise<CancelPtoRequestResult> {
  const request = await prisma.ptoRequest.findUnique({ where: { id: requestId } });
  if (!request || request.tenantId !== tenantId) {
    return { success: false, error: 'PTO request not found' };
  }

  if (request.employeeId !== employeeId) {
    return { success: false, error: 'You can only cancel your own requests' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Only pending requests can be cancelled' };
  }

  await prisma.ptoRequest.update({ where: { id: requestId }, data: { status: 'cancelled' } });
  return { success: true };
}
