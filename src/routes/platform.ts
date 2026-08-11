import type { TenantStatus } from '@prisma/client';
import { requirePlatformRole } from '../lib/platformAuth.js';
import {
  getTenantDetail,
  listTenants,
  listTenantUsers,
  type SortOrder,
  type TenantSortField,
  type TenantUserSortField,
} from '../modules/platform/platformTenantService.js';
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
