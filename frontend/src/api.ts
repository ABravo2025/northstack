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
  status: string;
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
  status: string;
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
    const res = await fetch(`${API_BASE_URL}/api/tenants/register`, {
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
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
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
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  acceptInvitation: async (token: string, invitationToken: string): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE_URL}/api/invitations/${invitationToken}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  logout: async (token: string): Promise<void> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  getCurrentUser: async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
    return res.json();
  },

  // HR Employees
  listEmployees: async (token: string): Promise<Employee[]> => {
    const res = await fetch(`${API_BASE_URL}/api/hr/employees`, {
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
    },
  ): Promise<Employee> => {
    const res = await fetch(`${API_BASE_URL}/api/hr/employees`, {
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
    const res = await fetch(`${API_BASE_URL}/api/hr/employees/${employeeId}`, {
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
    const res = await fetch(`${API_BASE_URL}/api/hr/employees/${employeeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  inviteEmployee: async (token: string, employeeId: string): Promise<{ invitation: Invitation }> => {
    const res = await fetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/invite`, {
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
    const res = await fetch(`${API_BASE_URL}/api/hr/custom-fields?entityType=${entityType}`, {
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
    const res = await fetch(`${API_BASE_URL}/api/hr/custom-fields`, {
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
    const res = await fetch(`${API_BASE_URL}/api/hr/custom-fields/${definitionId}`, {
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

  createEmployeeCustomFieldValue: async (
    token: string,
    employeeId: string,
    data: { customFieldDefinitionId: string; value: string },
  ): Promise<CustomFieldValue> => {
    const res = await fetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/custom-fields`, {
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
    const res = await fetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/custom-fields/${valueId}`, {
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
    const res = await fetch(`${API_BASE_URL}/api/hr/employees/${employeeId}/custom-fields/${valueId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },

  // Clients
  listClients: async (token: string): Promise<Client[]> => {
    const res = await fetch(`${API_BASE_URL}/api/clients`, {
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
    const res = await fetch(`${API_BASE_URL}/api/clients`, {
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
    const res = await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
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
    const res = await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await throwApiError(res);
  },
};
