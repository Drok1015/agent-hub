import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Config } from '../config';
import { ConnectionManager } from '../ws/connection';
import { registerAllTools } from './tools';

interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, McpSession>();

function createSession(config: Config, connectionManager: ConnectionManager): McpSession {
  const server = new McpServer({
    name: 'agent-hub',
    version: '1.0.0',
  });

  registerAllTools(server, config, connectionManager);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  return { server, transport };
}

export function getMcpSession(sessionId: string): McpSession | undefined {
  return sessions.get(sessionId);
}

export function setMcpSession(sessionId: string, session: McpSession): void {
  sessions.set(sessionId, session);
}

export function deleteMcpSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export { createSession };
