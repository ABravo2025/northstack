import { AsyncLocalStorage } from 'node:async_hooks';
import type { ActivitySource } from '@prisma/client';

// Per-request "where did this action come from" (spec-mcp-server.md §6.1). Set once at the edge of
// a non-UI entry point — the Private API router today, the MCP endpoint later — and read by
// activityLogService.recordActivity, so every service's create/update/delete gets attributed
// without threading a new parameter through every service signature. No context (the normal SPA
// traffic, crons, webhooks) means `ui`, the column default.
export interface RequestContext {
  source: ActivitySource;
  // What the Activity Log shows next to the user: the API key's name, or the AI client's name
  // ("Claude", "ChatGPT") for MCP. Null when there's nothing more specific to show.
  sourceClientName: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

// For a context only known after authentication (a support session, Admin Center v2 stage 5): sets
// it for the rest of the current request's async chain.
export function enterRequestContext(context: RequestContext): void {
  storage.enterWith(context);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
