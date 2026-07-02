# Run Test Guide

## Environment check

- The project uses `DATABASE_URL` in `.env` for Neon Postgres.
- The current `.env` file contains a Postgres connection string with `sslmode=require` and Neon-compatible parameters.
- Do not commit `.env` to version control.

## Run test commands

| Step | Command | Description | Notes |
| --- | --- | --- | --- |
| Install dependencies | `npm install` | Install project packages and Prisma dependencies | Run once after changes to `package.json` |
| Generate Prisma client | `npx prisma generate` | Generate Prisma client types from `prisma/schema.prisma` | Required before build or runtime if schema changes |
| Build project | `npm run build` | Compile TypeScript sources | Verifies code compiles successfully |
| Run tests | `npm test` | Execute the test suite with Vitest | Includes auth, HR and permission tests |

## Notes for Vercel

- Set `DATABASE_URL` in Vercel Environment Variables.
- Use `npm run build` as the build command.
- If Prisma generation is not automatic, use `npm run prisma:generate && npm run build`.
