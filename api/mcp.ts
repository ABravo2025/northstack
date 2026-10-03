import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMcpRequest } from '../src/modules/integrations/mcp/server.js';

// Northstack's MCP server (spec-mcp-server.md §2b) — its own Vercel function, separate from
// api/index.ts (the app's API), so nothing that happens here can take the app down. It imports only
// the MCP module, which reaches Northstack exclusively over HTTP through the Private API.
// Served at /mcp via a rewrite in vercel.json.
export default function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> {
  return handleMcpRequest(req, res);
}
