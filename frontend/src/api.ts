const API_BASE_URL = 'http://localhost:3000';

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
}

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  status: string;
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
    if (!res.ok) throw new Error(await res.text());
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
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  logout: async (token: string): Promise<void> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
  },

  getCurrentUser: async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // HR Employees
  listEmployees: async (token: string): Promise<Employee[]> => {
    const res = await fetch(`${API_BASE_URL}/api/hr/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
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
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Clients
  listClients: async (token: string): Promise<Client[]> => {
    const res = await fetch(`${API_BASE_URL}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
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
    if (!res.ok) throw new Error(await res.text());
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
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  deleteClient: async (token: string, clientId: string): Promise<void> => {
    const res = await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
  },
};
