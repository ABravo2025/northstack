import type { PlatformEntityType, TenantStatus } from '@prisma/client';
import { requirePlatformRole } from '../lib/platformAuth.js';
import {
  getTenantDetail,
  listTenants,
  listTenantUsers,
  type SortOrder,
  type TenantSortField,
  type TenantUserSortField,
} from '../modules/platform/platformTenantService.js';
import {
  createIdeaNote,
  createTicket,
  createTicketNote,
  getIdeaWithNotes,
  getTicketWithNotes,
  listIdeas,
  listTickets,
  updateIdea,
  updateTicket,
  type IdeaSortField,
  type TicketSortField,
} from '../modules/platform/platformTicketService.js';
import {
  createPlatformStatus,
  listPlatformStatuses,
  updatePlatformStatus,
} from '../modules/platform/platformStatusService.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const platformRouter = createAsyncRouter();

const VALID_TENANT_STATUSES: TenantStatus[] = ['active', 'suspended', 'cancelled'];
const VALID_TENANT_SORT: TenantSortField[] = ['name', 'country', 'createdAt', 'userCount'];
const VALID_TENANT_USER_SORT: TenantUserSortField[] = [
  'firstName',
  'lastName',
  'email',
  'role',
  'status',
  'createdAt',
];
const VALID_TICKET_SORT: TicketSortField[] = ['subject', 'createdAt'];
const VALID_IDEA_SORT: IdeaSortField[] = ['subject', 'createdAt'];
const VALID_PLATFORM_ENTITY_TYPES: PlatformEntityType[] = ['ticket', 'idea'];

function parseSortOrder(value: unknown): SortOrder {
  return value === 'desc' ? 'desc' : 'asc';
}

platformRouter.get('/api/platform/tenants', async (req, res) => {
  const user = await requirePlatformRole('platform_support')(req, res);
  if (!user) {
    return;
  }

  const status = req.query.status as string;
  if (!VALID_TENANT_STATUSES.includes(status as TenantStatus)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_TENANT_STATUSES.join(', ')}` });
  }

  const sortBy = (req.query.sortBy as string) || 'name';
  if (!VALID_TENANT_SORT.includes(sortBy as TenantSortField)) {
    return res.status(400).json({ error: `sortBy must be one of: ${VALID_TENANT_SORT.join(', ')}` });
  }

  const tenants = await listTenants({
    status: status as TenantStatus,
    sortBy: sortBy as TenantSortField,
    sortOrder: parseSortOrder(req.query.sortOrder),
    search: (req.query.search as string) || undefined,
  });
  return res.json(tenants);
});

platformRouter.get('/api/platform/tenants/:id', async (req, res) => {
  const user = await requirePlatformRole('platform_support')(req, res);
  if (!user) {
    return;
  }

  const tenant = await getTenantDetail(req.params.id);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  return res.json(tenant);
});

platformRouter.get('/api/platform/tenants/:id/users', async (req, res) => {
  const user = await requirePlatformRole('platform_support')(req, res);
  if (!user) {
    return;
  }

  const sortBy = (req.query.sortBy as string) || 'firstName';
  if (!VALID_TENANT_USER_SORT.includes(sortBy as TenantUserSortField)) {
    return res.status(400).json({ error: `sortBy must be one of: ${VALID_TENANT_USER_SORT.join(', ')}` });
  }

  const users = await listTenantUsers({
    tenantId: req.params.id,
    sortBy: sortBy as TenantUserSortField,
    sortOrder: parseSortOrder(req.query.sortOrder),
  });
  return res.json(users);
});

platformRouter.get('/api/platform/tickets', async (req, res) => {
  const user = await requirePlatformRole('platform_support')(req, res);
  if (!user) {
    return;
  }

  const sortBy = (req.query.sortBy as string) || 'createdAt';
  if (!VALID_TICKET_SORT.includes(sortBy as TicketSortField)) {
    return res.status(400).json({ error: `sortBy must be one of: ${VALID_TICKET_SORT.join(', ')}` });
  }

  const tickets = await listTickets({
    status: (req.query.status as string) || undefined,
    assignee: (req.query.assignee as string) || undefined,
    search: (req.query.search as string) || undefined,
    sortBy: sortBy as TicketSortField,
    sortOrder: parseSortOrder(req.query.sortOrder),
  });
  return res.json(tickets);
});

platformRouter.post('/api/platform/tickets', async (req, res) => {
  const user = await requirePlatformRole('platform_support')(req, res);
  if (!user) {
    return;
  }

  const tenantId = req.body.tenantId as string;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required' });
  }

  const ticket = await createTicket({
    tenantId,
    userId: (req.body.userId as string) || undefined,
    createdByType: 'platform_staff',
    subject: (req.body.subject as string) || '',
    description: (req.body.description as string) || '',
  });

  return res.status(201).json(ticket);
});

platformRouter.get('/api/platform/tickets/:id', async (req, res) => {
  const user = await requirePlatformRole('platform_support')(req, res);
  if (!user) {
    return;
  }

  const ticket = await getTicketWithNotes(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  return res.json(ticket);
});

platformRouter.patch('/api/platform/tickets/:id', async (req, res) => {
  const user = await requirePlatformRole('platform_support')(req, res);
  if (!user) {
    return;
  }

  const ticket = await updateTicket(req.params.id, {
    statusId: req.body.statusId,
    assignedToUserId: req.body.assignedToUserId,
    subject: req.body.subject,
    description: req.body.description,
  });
  return res.json(ticket);
});

platformRouter.post('/api/platform/tickets/:id/notes', async (req, res) => {
  const user = await requirePlatformRole('platform_support')(req, res);
  if (!user) {
    return;
  }

  const description = (req.body.description as string)?.trim();
  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  const note = await createTicketNote(req.params.id, user.id, description);
  return res.status(201).json(note);
});

// Settings del catálogo -- solo platform_admin (bypass implícito, sin roles
// extra en la lista).
platformRouter.get('/api/platform/statuses', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) {
    return;
  }

  const entityType = req.query.entityType as string;
  if (!VALID_PLATFORM_ENTITY_TYPES.includes(entityType as PlatformEntityType)) {
    return res.status(400).json({ error: `entityType must be one of: ${VALID_PLATFORM_ENTITY_TYPES.join(', ')}` });
  }

  const statuses = await listPlatformStatuses(entityType as PlatformEntityType);
  return res.json(statuses);
});

platformRouter.post('/api/platform/statuses', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) {
    return;
  }

  const entityType = req.body.entityType as string;
  const key = (req.body.key as string)?.trim();
  const label = (req.body.label as string)?.trim();
  if (!VALID_PLATFORM_ENTITY_TYPES.includes(entityType as PlatformEntityType)) {
    return res.status(400).json({ error: `entityType must be one of: ${VALID_PLATFORM_ENTITY_TYPES.join(', ')}` });
  }
  if (!key || !label) {
    return res.status(400).json({ error: 'key and label are required' });
  }

  const status = await createPlatformStatus({
    entityType: entityType as PlatformEntityType,
    key,
    label,
    order: typeof req.body.order === 'number' ? req.body.order : 0,
    color: (req.body.color as string) || undefined,
  });
  return res.status(201).json(status);
});

platformRouter.patch('/api/platform/statuses/:id', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) {
    return;
  }

  const result = await updatePlatformStatus(req.params.id, {
    label: req.body.label,
    order: req.body.order,
    color: req.body.color,
    isDefault: req.body.isDefault,
    isTerminal: req.body.isTerminal,
    active: req.body.active,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.status);
});

// "Ver/gestionar Ideas" es solo platform_admin (ver la matriz de acceso en
// spec-admin-center-platform-roles.md) -- a diferencia de Tickets, que
// también deja pasar a platform_support.
platformRouter.get('/api/platform/ideas', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) {
    return;
  }

  const sortBy = (req.query.sortBy as string) || 'createdAt';
  if (!VALID_IDEA_SORT.includes(sortBy as IdeaSortField)) {
    return res.status(400).json({ error: `sortBy must be one of: ${VALID_IDEA_SORT.join(', ')}` });
  }

  const ideas = await listIdeas({
    status: (req.query.status as string) || undefined,
    search: (req.query.search as string) || undefined,
    sortBy: sortBy as IdeaSortField,
    sortOrder: parseSortOrder(req.query.sortOrder),
  });
  return res.json(ideas);
});

platformRouter.get('/api/platform/ideas/:id', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) {
    return;
  }

  const idea = await getIdeaWithNotes(req.params.id);
  if (!idea) {
    return res.status(404).json({ error: 'Idea not found' });
  }
  return res.json(idea);
});

platformRouter.patch('/api/platform/ideas/:id', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) {
    return;
  }

  const idea = await updateIdea(req.params.id, {
    statusId: req.body.statusId,
    subject: req.body.subject,
    description: req.body.description,
  });
  return res.json(idea);
});

platformRouter.post('/api/platform/ideas/:id/notes', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) {
    return;
  }

  const description = (req.body.description as string)?.trim();
  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  const note = await createIdeaNote(req.params.id, user.id, description);
  return res.status(201).json(note);
});
