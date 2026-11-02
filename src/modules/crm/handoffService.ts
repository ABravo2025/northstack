import prisma from '../../lib/prisma.js';
import { sendClientWelcomeEmail } from '../../lib/mailer.js';
import { createTask } from '../tasks/taskService.js';
import { hasRoomForOpenProject } from '../projects/projectService.js';
import { instantiateTemplate } from '../projects/projectTemplateService.js';

// Clientes C3 (spec-clientes-gastos-formularios.md): once a deal is won it's handed off to the
// account owner (CSM): onboarding project from a template, kickoff on the calendar, welcome email.
// Every part is optional except the account owner, and it runs once per deal.

export class HandoffError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}

export interface HandoffInput {
  accountOwnerId: string;
  templateId?: string | null;
  kickoffAt?: string | null; // ISO date-time
  welcomeContactId?: string | null; // send the welcome email to this contact of the deal
}

type HandoffTenant = NonNullable<Parameters<typeof hasRoomForOpenProject>[0]> & { id: string; name: string; country: string | null };

export async function performHandoff(tenant: HandoffTenant, actorUserId: string, opportunityId: string, input: HandoffInput) {
  const tenantId = tenant.id;
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, tenantId },
    include: { stage: true, company: true, contactLinks: { include: { contact: true } } },
  });
  if (!opportunity) throw new HandoffError('Opportunity not found', 404);
  if (opportunity.stage.outcome !== 'won') throw new HandoffError('Win the deal before handing it off', 409, 'not_won');
  if (opportunity.handoffAt) throw new HandoffError('This deal was already handed off', 409, 'already_done');

  const owner = await prisma.user.findFirst({ where: { id: input.accountOwnerId, tenantId, status: 'active' } });
  if (!owner) throw new HandoffError('Account owner not found', 404);

  const contact = input.welcomeContactId ? opportunity.contactLinks.find((l) => l.contactId === input.welcomeContactId)?.contact : null;
  if (input.welcomeContactId && !contact) throw new HandoffError('Contact not found on this deal', 404);

  let kickoff: Date | null = null;
  if (input.kickoffAt) {
    kickoff = new Date(input.kickoffAt);
    if (Number.isNaN(kickoff.getTime())) throw new HandoffError('Invalid kickoff date', 400);
  }

  // The onboarding project is owned by the account owner's employee record.
  let projectId: string | null = null;
  if (input.templateId) {
    const employee = await prisma.employee.findFirst({ where: { tenantId, userId: owner.id }, select: { id: true } });
    if (!employee) throw new HandoffError('The account owner has no employee record to own the onboarding project', 400, 'owner_not_employee');
    const room = await hasRoomForOpenProject(tenant, tenantId);
    if (!room.allowed) throw new HandoffError(`Your plan allows ${room.max} open projects`, 403, 'project_limit');
    const project = await instantiateTemplate(
      {
        templateId: input.templateId,
        tenantId,
        name: `Onboarding · ${opportunity.company.name}`.slice(0, 200),
        companyId: opportunity.companyId,
        ownerEmployeeId: employee.id,
        status: 'active',
      },
      actorUserId,
    ).catch((error: Error) => {
      if (error.message === 'Template not found') throw new HandoffError('Template not found', 404);
      throw error;
    });
    projectId = project?.id ?? null;
  }

  await prisma.company.update({ where: { id: opportunity.companyId }, data: { accountOwnerId: owner.id } });

  if (kickoff) {
    await createTask({
      tenantId,
      entityType: 'company',
      entityId: opportunity.companyId,
      title: `Kickoff · ${opportunity.company.name}`.slice(0, 200),
      assigneeId: owner.id,
      createdById: actorUserId,
      dueDate: kickoff,
      hasVideoCall: true,
      meetAttendeeEmail: contact?.email ?? null,
    });
  }

  if (contact) {
    // Awaited: Vercel can cut off an un-awaited send once the response is out.
    await sendClientWelcomeEmail({
      to: contact.email,
      firstName: contact.firstName,
      tenantName: tenant.name,
      ownerName: `${owner.firstName} ${owner.lastName}`.trim(),
      ownerEmail: owner.email,
      kickoffAt: kickoff,
      // A client contact isn't a user with a language setting: the company's country decides.
      locale: tenant.country && tenant.country !== 'US' ? 'es' : 'en',
    });
  }

  await prisma.opportunity.update({ where: { id: opportunity.id }, data: { handoffAt: new Date(), handoffProjectId: projectId } });
  return { projectId, kickoffScheduled: !!kickoff, welcomeSent: !!contact };
}
