# Current Process Flow

- Última actualización: 2026-07-06

This document describes the current onboarding and application flow for Northstack.

## Public access flow

```mermaid
flowchart TD
  A[Public Access] --> B[Login Page]
  B --> C{Has account?}
  C -->|Yes| D[Authenticate via /api/auth/login]
  C -->|No| E[Register page]
  D --> F{Valid token?}
  F -->|Yes| G[Dashboard]
  F -->|No| H[Show auth error]

  E --> I[Create account via /api/auth/register]
  I --> J{Success?}
  J -->|Yes| D
  J -->|No| K[Show registration error]

  B --> L[Create New Tenant button]
  L --> M[Create Tenant page]
  M --> N[POST /api/tenants]
  N --> O[Create Tenant + Owner + Session]
  O --> G

  G --> P[HR Tab]
  P --> Q[List employees via /api/hr/employees]
  P --> R[Create employee via /api/hr/employees]

  G --> S[Clients Tab]
  S --> T[List clients via /api/clients]
  S --> U[Create client via /api/clients]
  S --> V[Update client via PATCH /api/clients/:id]
  S --> W[Delete client via DELETE /api/clients/:id]
```

## Key points

- `Create New Tenant` is currently available from the public login screen.
- Tenant creation performs:
  - tenant creation
  - owner user creation
  - session creation
- After creating a tenant, the user lands directly in the dashboard.
- The dashboard currently supports:
  - employee listing and creation
  - client listing, creation, update and deletion
  - custom fields for both employees and clients

## Invitation flow (new, 2026-07-06)

The open `POST /api/tenants/join` (any authenticated user could attach to any tenant just by knowing its `tenantId`) was removed as an insecure pattern. It's replaced by an invitation flow:

```mermaid
flowchart TD
  A[Tenant owner/admin] --> B[POST /api/tenants/invitations]
  B --> C[Invitation created: email + role + token, expires in 7 days]
  C --> D[Admin shares link/token manually - no email service yet]
  D --> E[Invited user registers or logs in]
  E --> F[POST /api/invitations/:token/accept]
  F --> G{Token valid, not expired, email matches?}
  G -->|Yes| H[User attached to tenant with invited role]
  G -->|No| I[Show error]
```

- Sending the invitation is manual for now (no email provider integrated) — flagged as a future improvement, evaluated and deliberately postponed.
- Not yet exposed in the frontend (backend-only so far).

## Frontend implementation status

- `frontend/` (Vite + React) implements this flow: `LoginPage`, `RegisterPage`, `CreateTenantPage`, `DashboardPage`.
- Not yet browser-tested end-to-end as part of this doc update — pending a follow-up session.

## Current UI behavior

- Public login page:
  - `Login`
  - `Register`
  - `Create New Tenant`
- Dashboard:
  - `Employees` tab
  - `Clients` tab

## Proposed controlled onboarding

This model separates the public flow into two branches:
- **Signup branch** for new accounts
- **Login branch** for returning users

Tenant creation can occur through multiple channels:
- self-service signup by the client
- internal onboarding by our company users
- API-driven onboarding from an external integration

Clients created under a tenant can also be added:
- through the tenant UI
- through an API integration

The system must distinguish between two user roles:
- **Company user:** internal staff / admins who can create tenants, manage onboarding, and control tenant setup.
- **Tenant user:** regular client users who belong to an existing tenant and manage tenant-level data.

### Proposed process flow

```mermaid
flowchart TD
  A[Public Access] --> B{Existing user?}
  B -->|Yes| C[Login page]
  B -->|No| D[Signup page]

  C --> E[POST /api/auth/login]
  D --> F[POST /api/auth/register]

  E --> G{Valid token?}
  F --> G
  G --> H[Dashboard]
  G --> I[Show auth error]

  H --> J{User role?}
  J -->|Company user| K[Admin portal]
  J -->|Tenant user| L[Tenant dashboard]

  K --> M[Create tenant via internal admin]
  K --> N[Create tenant via API]
  K --> O[Possibly create tenant via self-service signup]

  L --> P[Create clients via UI]
  L --> Q[Create clients via API]
  L --> R[View tenant Employees / Clients / Payments]
```

## Why this change matters

- it makes signup and login behavior explicit and separate
- it supports tenant creation by the client, by our team, or by an API
- it supports tenant client creation through both UI and API
- it keeps role-based access clear for company users vs tenant users

## Future roadmap note

- later, the public signup branch can evolve into a dedicated free/subscription account flow
- tenant creation should still be managed through controlled onramps, with self-service as a supported channel when desired
