// In production the frontend and backend are served from the same Vercel
// deployment, so requests can be relative (''). Locally, Vite serves the
// frontend on its own port, so we point at the Express dev server directly
// unless VITE_API_BASE_URL overrides it.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

export class ApiError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    // fetch() itself throws on network failures (server unreachable, DNS,
    // CORS) before there's ever a Response to inspect — distinguish that
    // from a normal 4xx/5xx, which throwApiError already handles.
    throw new ApiError("Can't reach the server. Check your connection and try again.");
  }
}

async function throwApiError(res: Response): Promise<never> {
  let message = res.statusText || 'Request failed';
  let field: string | undefined;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
    if (body?.field) field = body.field;
  } catch {
    // response body wasn't JSON, fall back to statusText
  }
  throw new ApiError(message, field);
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId?: string;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
  session?: {
    token: string;
  };
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  statusId: string;
  statusDefn?: { id: string; name: string; color: string | null };
  managerId?: string | null;
  manager?: { id: string; firstName: string; lastName: string } | null;
  ptoPolicies?: EmployeePtoPolicyAssignment[];
  userId?: string | null;
  customFieldVals?: {
    id: string;
    customFieldDefinitionId: string;
    value: string;
  }[];
}

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  statusId: string;
  statusDefn?: { id: string; name: string; color: string | null };
  customFieldVals?: {
    id: string;
    customFieldDefinitionId: string;
    value: string;
  }[];
}

interface CustomFieldDefinition {
  id: string;
  name: string;
  entityType: string;
  fieldType: string;
  options: string | null;
  required: boolean;
  isActive: boolean;
}

interface StatusDefinition {
  id: string;
  entityType: string;
  name: string;
  color: string | null;
  order: number;
  isDefault: boolean;
  isActive: boolean;
}

interface PtoPolicy {
  id: string;
  name: string;
  color: string | null;
  accrualMethod: 'fixed_annual' | 'monthly';
  daysPerYear: number;
  isPaid: boolean;
  requiresApproval: boolean;
  isActive: boolean;
}

interface EmployeePtoPolicyAssignment {
  id: string;
  employeeId: string;
  ptoPolicyId: string;
  assignedAt: string;
  ptoPolicy: PtoPolicy;
}

interface Invitation {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  employeeId?: string | null;
  expiresAt: string;
}

interface CustomFieldValue {
  id: string;
  customFieldDefinitionId: string;
  entityType?: string;
  entityId?: string;
  value: string;
}

interface TenantUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
}

interface TenantInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export const api = {
  // Auth
  registerTenant: async (data: {
    tenantName: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerPhone: string;
  }): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  login: async (data: {
    email: string;
    password: string;
  }): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  register: async (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone: string;
  }): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  getInvitation: async (
    invitationToken: string,
  ): Promise<{ email: string; role: string; status: string; expiresAt: string }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/invitations/${invitationToken}`);
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  acceptInvitation: async (token: string, invitationToken: string): Promise<AuthResponse> => {
    const res = await apiFetch(`${API_BASE_URL}/api/invitations/${invitationToken}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  logout: async (token: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  getCurrentUser: async (token: string) => {
    const res = await apiFetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateProfile: async (
    token: string,
    data: { firstName: string; lastName: string; phone: string },
  ): Promise<{ user: TenantUser }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  changePassword: async (
    token: string,
    data: { currentPassword: string; newPassword: string },
  ): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/users/me/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
  },

  // Company / tenant users
  listTenantUsers: async (token: string): Promise<TenantUser[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateTenantUser: async (
    token: string,
    userId: string,
    data: { role?: string; status?: string },
  ): Promise<{ user: TenantUser }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  listTenantInvitations: async (token: string): Promise<TenantInvitation[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/invitations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createTenantInvitation: async (
    token: string,
    data: { email: string; role: string },
  ): Promise<{ invitation: Invitation }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  cancelInvitation: async (token: string, invitationId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/tenants/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  // HR Employees
  listEmployees: async (token: string): Promise<Employee[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createEmployee: async (
    token: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      department: string;
      managerId?: string | null;
    },
  ): Promise<Employee> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateEmployee: async (
    token: string,
    employeeId: string,
    data: Partial<Employee>,
  ): Promise<Employee> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deleteEmployee: async (token: string, employeeId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  inviteEmployee: async (token: string, employeeId: string): Promise<{ invitation: Invitation }> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/invite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Custom fields
  listCustomFieldDefinitions: async (
    token: string,
    entityType: 'employee' | 'client',
  ): Promise<CustomFieldDefinition[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/custom-fields?entityType=${entityType}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createCustomFieldDefinition: async (
    token: string,
    data: {
      name: string;
      entityType: 'employee' | 'client';
      fieldType: string;
      options?: string;
      required?: boolean;
    },
  ): Promise<CustomFieldDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/custom-fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  setCustomFieldDefinitionActive: async (
    token: string,
    definitionId: string,
    isActive: boolean,
  ): Promise<CustomFieldDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/custom-fields/${definitionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // Status definitions
  listStatusDefinitions: async (
    token: string,
    entityType: 'employee' | 'client',
  ): Promise<StatusDefinition[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/status-definitions?entityType=${entityType}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createStatusDefinition: async (
    token: string,
    data: { entityType: 'employee' | 'client'; name: string; color?: string; order?: number; isDefault?: boolean },
  ): Promise<StatusDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/status-definitions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateStatusDefinition: async (
    token: string,
    definitionId: string,
    data: { name?: string; color?: string; order?: number; isDefault?: boolean; isActive?: boolean },
  ): Promise<StatusDefinition> => {
    const res = await apiFetch(`${API_BASE_URL}/api/status-definitions/${definitionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // PTO policies
  listPtoPolicies: async (token: string): Promise<PtoPolicy[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pto-policies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createPtoPolicy: async (
    token: string,
    data: {
      name: string;
      color?: string;
      accrualMethod?: 'fixed_annual' | 'monthly';
      daysPerYear: number;
      isPaid?: boolean;
      requiresApproval?: boolean;
    },
  ): Promise<PtoPolicy> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pto-policies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updatePtoPolicy: async (
    token: string,
    policyId: string,
    data: {
      name?: string;
      color?: string;
      accrualMethod?: 'fixed_annual' | 'monthly';
      daysPerYear?: number;
      isPaid?: boolean;
      requiresApproval?: boolean;
      isActive?: boolean;
    },
  ): Promise<PtoPolicy> => {
    const res = await apiFetch(`${API_BASE_URL}/api/pto-policies/${policyId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // PTO policy assignments (per employee)
  listEmployeePtoPolicies: async (token: string, employeeId: string): Promise<EmployeePtoPolicyAssignment[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/pto-policies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  assignPtoPolicyToEmployee: async (
    token: string,
    employeeId: string,
    ptoPolicyId: string,
  ): Promise<EmployeePtoPolicyAssignment> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/pto-policies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ptoPolicyId }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  unassignPtoPolicyFromEmployee: async (token: string, employeeId: string, ptoPolicyId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/pto-policies/${ptoPolicyId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  createEmployeeCustomFieldValue: async (
    token: string,
    employeeId: string,
    data: { customFieldDefinitionId: string; value: string },
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/custom-fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateEmployeeCustomFieldValue: async (
    token: string,
    employeeId: string,
    valueId: string,
    value: string,
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/custom-fields/${valueId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deleteEmployeeCustomFieldValue: async (
    token: string,
    employeeId: string,
    valueId: string,
  ): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/custom-fields/${valueId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  // Clients
  listClients: async (token: string): Promise<Client[]> => {
    const res = await apiFetch(`${API_BASE_URL}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  createClient: async (
    token: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      company: string;
    },
  ): Promise<Client> => {
    const res = await apiFetch(`${API_BASE_URL}/api/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateClient: async (
    token: string,
    clientId: string,
    data: Partial<Client>,
  ): Promise<Client> => {
    const res = await apiFetch(`${API_BASE_URL}/api/clients/${clientId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deleteClient: async (token: string, clientId: string): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/clients/${clientId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  createClientCustomFieldValue: async (
    token: string,
    clientId: string,
    data: { customFieldDefinitionId: string; value: string },
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/clients/${clientId}/custom-fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  updateClientCustomFieldValue: async (
    token: string,
    clientId: string,
    valueId: string,
    value: string,
  ): Promise<CustomFieldValue> => {
    const res = await apiFetch(`${API_BASE_URL}/api/clients/${clientId}/custom-fields/${valueId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  deleteClientCustomFieldValue: async (
    token: string,
    clientId: string,
    valueId: string,
  ): Promise<void> => {
    const res = await apiFetch(`${API_BASE_URL}/api/clients/${clientId}/custom-fields/${valueId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
