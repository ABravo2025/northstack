# Current Process Flow

- Última actualización: 2026-07-08 (sin cambios de flujo; se hardeneó seguridad por debajo: hash de contraseñas con scrypt, política de contraseñas, y verificación de tenant ownership en custom fields)

This document describes the current onboarding and application flow for Northstack.

## Public access flow

```mermaid
flowchart TD
  A[Public Access] --> B[Login Page]
  B --> C{Has account?}
  C -->|Yes| D[Authenticate via /api/auth/login]
  C -->|No| E[Register page: company + owner data]
  D --> F{Valid token?}
  F -->|Yes| G[Dashboard]
  F -->|No| H[Show auth error]

  E --> I[POST /api/tenants/register]
  I --> J[Create Tenant + Owner User + Session, in one step]
  J --> G

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

- Registration is a **single step**: the Register page asks for company (tenant) data and owner user data together, and `POST /api/tenants/register` creates the Tenant + owner User + Session atomically. This avoids ever creating a "tenant-less" user outside of the invitation flow (see below).
- `POST /api/auth/register` (bare user, no tenant) still exists for the invitation-acceptance path: someone accepting an invite who doesn't have an account yet registers first, then accepts.
- After registering, the user lands directly in the dashboard.
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

- `frontend/` (Vite + React) implements this flow: `LoginPage`, `RegisterPage` (company + owner data in one form), `DashboardPage`.
- `CreateTenantPage` was removed — it was dead code built against the deleted `createTenantWithOwner` shape and was never wired into `App.tsx`.
- Verified end-to-end via `curl` against the running backend (`POST /api/tenants/register`); not yet clicked through in an actual browser session.
- `frontend/tsconfig.json` is missing `jsx` config, so `npm run build` fails for the frontend (pre-existing, doesn't affect the Vite dev server).

## Current UI behavior

- Public login page:
  - `Login`
  - `Register` (company + owner data)
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
