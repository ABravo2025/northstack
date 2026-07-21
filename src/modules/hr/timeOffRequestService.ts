import prisma from '../../lib/prisma.js';
import { sendTimeOffRequestDecidedEmail, sendTimeOffRequestPendingEmail } from '../../lib/mailer.js';
import type { TimeOffRequest, TimeOffRequestStatus, User } from '@prisma/client';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function countInclusiveDays(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface CreateTimeOffRequestInput {
  tenantId: string;
  employeeId: string;
  timeOffPolicyId: string;
  startDate: string;
  endDate: string;
  note?: string;
}

export interface CreateTimeOffRequestResult {
  success: boolean;
  request?: TimeOffRequest;
  error?: string;
}

export async function createTimeOffRequest(input: CreateTimeOffRequestInput): Promise<CreateTimeOffRequestResult> {
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

  const policy = await prisma.timeOffPolicyDefinition.findUnique({ where: { id: input.timeOffPolicyId } });
  if (!policy || policy.tenantId !== input.tenantId || !policy.isActive) {
    return { success: false, error: 'Time off policy not found' };
  }

  const assignment = await prisma.employeeTimeOffPolicy.findUnique({
    where: { employeeId_timeOffPolicyId: { employeeId: input.employeeId, timeOffPolicyId: input.timeOffPolicyId } },
  });
  if (!assignment) {
    return { success: false, error: 'This time off policy is not assigned to you' };
  }

  const daysRequested = countInclusiveDays(startDate, endDate);
  const autoApprove = !policy.requiresApproval;

  const request = await prisma.timeOffRequest.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      timeOffPolicyId: input.timeOffPolicyId,
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

  const employeeName = `${employee.firstName} ${employee.lastName}`;
  const manager = employee.managerId ? await prisma.employee.findUnique({ where: { id: employee.managerId } }) : null;

  if (autoApprove) {
    // Nobody actively approved this, so unlike a manual decision, everyone who'd
    // otherwise want visibility gets notified: the employee, their manager, and the owner.
    const owner = await prisma.user.findFirst({ where: { tenantId: input.tenantId, role: 'owner' } });
    const recipients = [
      { email: employee.email, isEmployee: true },
      ...(manager ? [{ email: manager.email, isEmployee: false }] : []),
      ...(owner ? [{ email: owner.email, isEmployee: false }] : []),
    ];
    for (const recipient of recipients) {
      sendTimeOffRequestDecidedEmail({
        to: recipient.email,
        recipientIsEmployee: recipient.isEmployee,
        employeeName,
        policyName: policy.name,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        daysRequested,
        decision: 'approved',
        autoApproved: true,
      }).catch((err) => console.error('Failed to send time off decided email:', err));
    }
  } else if (manager) {
    sendTimeOffRequestPendingEmail({
      to: manager.email,
      approverName: manager.firstName,
      employeeName,
      policyName: policy.name,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      daysRequested,
    }).catch((err) => console.error('Failed to send time off pending email:', err));
  }

  return { success: true, request };
}

export async function listMyTimeOffRequests(tenantId: string, employeeId: string) {
  return prisma.timeOffRequest.findMany({
    where: { tenantId, employeeId },
    include: { timeOffPolicy: true, approver: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listPendingApprovals(tenantId: string, approverEmployeeId: string) {
  return prisma.timeOffRequest.findMany({
    where: { tenantId, approverId: approverEmployeeId, status: 'pending' },
    include: { timeOffPolicy: true, employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

// A time off tag on an employee's row is only ever active for the exact days a
// request covers — this looks up "as of today" state, not the whole history.
export async function findActiveTimeOffRequestsForEmployees(tenantId: string, employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return [];
  }
  const today = new Date(new Date().toISOString().slice(0, 10));
  return prisma.timeOffRequest.findMany({
    where: {
      tenantId,
      employeeId: { in: employeeIds },
      status: 'approved',
      startDate: { lte: today },
      endDate: { gte: today },
    },
    include: { timeOffPolicy: true },
  });
}

export async function listTimeOffRequestsForCalendar(tenantId: string) {
  return prisma.timeOffRequest.findMany({
    where: { tenantId, status: { in: ['approved', 'pending'] } },
    include: { timeOffPolicy: true, employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { startDate: 'asc' },
  });
}

export async function listAllTimeOffRequests(tenantId: string) {
  return prisma.timeOffRequest.findMany({
    where: { tenantId },
    include: {
      timeOffPolicy: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
      approver: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export interface DecideTimeOffRequestResult {
  success: boolean;
  request?: TimeOffRequest;
  error?: string;
}

export async function decideTimeOffRequest(
  requestId: string,
  tenantId: string,
  actingUser: User,
  decision: 'approved' | 'rejected',
  decisionNote?: string,
): Promise<DecideTimeOffRequestResult> {
  const request = await prisma.timeOffRequest.findUnique({ where: { id: requestId } });
  if (!request || request.tenantId !== tenantId) {
    return { success: false, error: 'Time off request not found' };
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

  const updated = await prisma.timeOffRequest.update({
    where: { id: requestId },
    data: {
      status: decision as TimeOffRequestStatus,
      decidedAt: new Date(),
      decisionNote: decisionNote ?? null,
    },
  });

  const [employee, policy] = await Promise.all([
    prisma.employee.findUnique({ where: { id: request.employeeId } }),
    prisma.timeOffPolicyDefinition.findUnique({ where: { id: request.timeOffPolicyId } }),
  ]);
  if (employee && policy) {
    sendTimeOffRequestDecidedEmail({
      to: employee.email,
      recipientIsEmployee: true,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      policyName: policy.name,
      startDate: formatDate(request.startDate),
      endDate: formatDate(request.endDate),
      daysRequested: request.daysRequested,
      decision,
      decisionNote,
    }).catch((err) => console.error('Failed to send time off decided email:', err));
  }

  return { success: true, request: updated };
}

export interface CancelTimeOffRequestResult {
  success: boolean;
  error?: string;
}

export async function cancelTimeOffRequest(
  requestId: string,
  tenantId: string,
  employeeId: string,
): Promise<CancelTimeOffRequestResult> {
  const request = await prisma.timeOffRequest.findUnique({ where: { id: requestId } });
  if (!request || request.tenantId !== tenantId) {
    return { success: false, error: 'Time off request not found' };
  }

  if (request.employeeId !== employeeId) {
    return { success: false, error: 'You can only cancel your own requests' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Only pending requests can be cancelled' };
  }

  await prisma.timeOffRequest.update({ where: { id: requestId }, data: { status: 'cancelled' } });
  return { success: true };
}
