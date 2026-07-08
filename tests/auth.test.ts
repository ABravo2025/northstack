import { beforeEach, describe, expect, it, vi } from 'vitest';

const users: any[] = [];
const sessions: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(async ({ where }: any) => users.find((user) => user.email === where.email)),
      create: vi.fn(async ({ data }: any) => {
        const user = { id: `user-${users.length + 1}`, ...data };
        users.push(user);
        return user;
      }),
    },
    session: {
      create: vi.fn(async ({ data }: any) => {
        const session = { id: `session-${sessions.length + 1}`, ...data, createdAt: new Date().toISOString() };
        sessions.push(session);
        return session;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const initialLength = sessions.length;
        for (let i = sessions.length - 1; i >= 0; i -= 1) {
          if (sessions[i].token === where.token) {
            sessions.splice(i, 1);
          }
        }
        return { count: initialLength - sessions.length };
      }),
      findUnique: vi.fn(async ({ where }: any) => sessions.find((session) => session.token === where.token)),
    },
  },
}));

import { loginUser, registerUser } from '../src/modules/auth/authService.js';

describe('auth service', () => {
  beforeEach(() => {
    users.length = 0;
    sessions.length = 0;
  });

  it('registers a new user and allows login', async () => {
    const registration = await registerUser({
      email: 'owner@example.com',
      password: 'StrongPassword123!',
      firstName: 'Alice',
      lastName: 'Smith',
      phone: '+1-555-0100',
    });

    expect(registration.success).toBe(true);
    expect(registration.user?.email).toBe('owner@example.com');

    const login = await loginUser({
      email: 'owner@example.com',
      password: 'StrongPassword123!',
    });

    expect(login.success).toBe(true);
    expect(login.session?.token).toBeTruthy();
  });

  it('rejects invalid credentials', async () => {
    const login = await loginUser({
      email: 'missing@example.com',
      password: 'wrong-password',
    });

    expect(login.success).toBe(false);
  });
});
