import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { agents, agentTokens, tasks, messages } from '../db/schema';
import { signToken, verifyToken, hashToken } from '../auth/jwt';
import { Config } from '../config';
import { getDatabase } from '../db';
import { ConnectionManager } from '../ws/connection';

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['assigned', 'cancelled'],
  assigned: ['running', 'cancelled'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
};

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, data }) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { message } }) }], isError: true };
}

async function auth(token: string | undefined, jwtSecret: string) {
  if (!token) throw new Error('Token required. Call register_agent first.');
  return verifyToken(token, jwtSecret);
}

export function registerAllTools(
  server: McpServer,
  config: Config,
  connectionManager: ConnectionManager
) {
  const db = getDatabase();

  // ── Agent Tools ──────────────────────────────────────────

  server.registerTool('register_agent', {
    description: 'Register a new agent with the Agent Hub. Returns agent ID and JWT token for subsequent calls.',
    inputSchema: {
      name: z.string().describe('Unique agent name'),
      capabilities: z.array(z.string()).optional().describe('Agent capabilities (e.g. ["coding", "testing"])'),
      metadata: z.record(z.any()).optional().describe('Arbitrary metadata'),
    },
  }, async ({ name, capabilities = [], metadata = {} }) => {
    try {
      const existing = db.select().from(agents).where(eq(agents.name, name)).get();
      if (existing) return fail(`Agent "${name}" already exists`);

      const now = Date.now();
      const agentId = uuidv4();
      const token = await signToken({ agentId, name }, config.jwtSecret, config.jwtExpiresIn);

      db.insert(agents).values({
        id: agentId, name, tokenHash: hashToken(token), status: 'offline',
        capabilities: JSON.stringify(capabilities), metadata: JSON.stringify(metadata),
        lastSeen: null, createdAt: now, updatedAt: now,
      }).run();

      db.insert(agentTokens).values({
        id: uuidv4(), agentId, token, name: 'default', expiresAt: null, revoked: 0, createdAt: now,
      }).run();

      return ok({ id: agentId, name, token, capabilities, status: 'offline', createdAt: now });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('list_agents', {
    description: 'List all registered agents on the hub.',
    inputSchema: { token: z.string().describe('Your JWT token') },
  }, async ({ token: t }) => {
    try {
      await auth(t, config.jwtSecret);
      const all = db.select().from(agents).all();
      return ok(all.map(a => ({
        id: a.id, name: a.name, status: a.status,
        capabilities: JSON.parse(a.capabilities || '[]'), lastSeen: a.lastSeen, createdAt: a.createdAt,
      })));
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('get_agent', {
    description: 'Get details of a specific agent.',
    inputSchema: {
      agent_id: z.string().describe('Agent ID'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ agent_id, token: t }) => {
    try {
      await auth(t, config.jwtSecret);
      const agent = db.select().from(agents).where(eq(agents.id, agent_id)).get();
      if (!agent) return fail('Agent not found');
      return ok({
        id: agent.id, name: agent.name, status: agent.status,
        capabilities: JSON.parse(agent.capabilities || '[]'),
        metadata: JSON.parse(agent.metadata || '{}'),
        lastSeen: agent.lastSeen, createdAt: agent.createdAt, updatedAt: agent.updatedAt,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('update_agent', {
    description: 'Update your own agent capabilities or metadata.',
    inputSchema: {
      capabilities: z.array(z.string()).optional().describe('New capabilities'),
      metadata: z.record(z.any()).optional().describe('New metadata'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ capabilities, metadata, token: t }) => {
    try {
      const payload = await auth(t, config.jwtSecret);
      const agent = db.select().from(agents).where(eq(agents.id, payload.agentId)).get();
      if (!agent) return fail('Agent not found');

      const now = Date.now();
      const updateData: Record<string, unknown> = { updatedAt: now };
      if (capabilities) updateData.capabilities = JSON.stringify(capabilities);
      if (metadata) updateData.metadata = JSON.stringify(metadata);

      db.update(agents).set(updateData).where(eq(agents.id, payload.agentId)).run();
      return ok({ id: agent.id, name: agent.name, capabilities, metadata, updatedAt: now });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('deregister_agent', {
    description: 'Permanently remove your agent from the hub.',
    inputSchema: { token: z.string().describe('Your JWT token') },
  }, async ({ token: t }) => {
    try {
      const payload = await auth(t, config.jwtSecret);
      const agent = db.select().from(agents).where(eq(agents.id, payload.agentId)).get();
      if (!agent) return fail('Agent not found');

      db.delete(agentTokens).where(eq(agentTokens.agentId, payload.agentId)).run();
      db.delete(agents).where(eq(agents.id, payload.agentId)).run();
      return ok(null);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  // ── Task Tools ───────────────────────────────────────────

  server.registerTool('create_task', {
    description: 'Create a new task. Optionally assign to a specific agent.',
    inputSchema: {
      title: z.string().describe('Task title'),
      description: z.string().optional().describe('Task description'),
      priority: z.number().int().optional().describe('Priority (0=low, higher=more urgent)'),
      assigned_to: z.string().optional().describe('Agent ID to assign to'),
      payload: z.record(z.any()).optional().describe('Task payload data'),
      timeout_ms: z.number().int().optional().describe('Timeout in milliseconds'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ title, description = '', priority = 0, assigned_to, payload = {}, timeout_ms = 300000, token: t }) => {
    try {
      const creator = await auth(t, config.jwtSecret);
      const now = Date.now();
      const taskId = uuidv4();

      let status = 'pending';
      if (assigned_to) {
        const assignee = db.select().from(agents).where(eq(agents.id, assigned_to)).get();
        if (!assignee) return fail(`Agent ${assigned_to} not found`);
        status = 'assigned';
      }

      db.insert(tasks).values({
        id: taskId, title, description, status, priority, createdBy: creator.agentId,
        assignedTo: assigned_to || null, payload: JSON.stringify(payload), timeoutMs: timeout_ms,
        createdAt: now, updatedAt: now,
      }).run();

      if (assigned_to && status === 'assigned') {
        const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
        connectionManager.send(assigned_to, {
          type: 'task_assigned', id: uuidv4(), timestamp: now,
          payload: { task: { id: task!.id, title: task!.title, description: task!.description, status: task!.status, priority: task!.priority, payload: JSON.parse(task!.payload || '{}'), timeoutMs: task!.timeoutMs, createdAt: task!.createdAt } },
        });
      }

      return ok({ id: taskId, title, description, status, priority, assignedTo: assigned_to, createdAt: now });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('list_tasks', {
    description: 'List tasks with optional filters.',
    inputSchema: {
      status: z.string().optional().describe('Filter by status'),
      assigned_to: z.string().optional().describe('Filter by assigned agent'),
      created_by: z.string().optional().describe('Filter by creator'),
      limit: z.number().int().optional().describe('Max results (default 50)'),
      offset: z.number().int().optional().describe('Offset (default 0)'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ status, assigned_to, created_by, limit = 50, offset = 0, token: t }) => {
    try {
      await auth(t, config.jwtSecret);
      let query = db.select().from(tasks);
      const conditions = [];
      if (status) conditions.push(eq(tasks.status, status));
      if (assigned_to) conditions.push(eq(tasks.assignedTo, assigned_to));
      if (created_by) conditions.push(eq(tasks.createdBy, created_by));
      if (conditions.length > 0) {
        // @ts-ignore
        query = query.where(and(...conditions));
      }
      const all = query.orderBy(desc(tasks.createdAt)).limit(limit).offset(offset).all();
      return ok(all.map(task => ({
        id: task.id, title: task.title, description: task.description, status: task.status,
        priority: task.priority, createdBy: task.createdBy, assignedTo: task.assignedTo,
        createdAt: task.createdAt, startedAt: task.startedAt, completedAt: task.completedAt,
      })));
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('get_task', {
    description: 'Get full details of a specific task.',
    inputSchema: {
      task_id: z.string().describe('Task ID'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ task_id, token: t }) => {
    try {
      await auth(t, config.jwtSecret);
      const task = db.select().from(tasks).where(eq(tasks.id, task_id)).get();
      if (!task) return fail('Task not found');
      return ok({
        id: task.id, title: task.title, description: task.description, status: task.status,
        priority: task.priority, createdBy: task.createdBy, assignedTo: task.assignedTo,
        payload: JSON.parse(task.payload || '{}'),
        result: task.result ? JSON.parse(task.result) : null,
        error: task.error, timeoutMs: task.timeoutMs,
        createdAt: task.createdAt, updatedAt: task.updatedAt,
        startedAt: task.startedAt, completedAt: task.completedAt,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('update_task', {
    description: 'Update task status, result, or error. Status transitions: pending→assigned|cancelled, assigned→running|cancelled, running→completed|failed.',
    inputSchema: {
      task_id: z.string().describe('Task ID'),
      status: z.string().optional().describe('New status'),
      result: z.any().optional().describe('Task result data'),
      error: z.string().optional().describe('Error message if failed'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ task_id, status, result, error, token: t }) => {
    try {
      await auth(t, config.jwtSecret);
      const task = db.select().from(tasks).where(eq(tasks.id, task_id)).get();
      if (!task) return fail('Task not found');

      if (status) {
        const valid = VALID_STATUS_TRANSITIONS[task.status] || [];
        if (!valid.includes(status)) return fail(`Cannot transition from ${task.status} to ${status}`);
      }

      const now = Date.now();
      const updateData: Record<string, unknown> = { updatedAt: now };
      if (status) {
        updateData.status = status;
        if (status === 'running' && !task.startedAt) updateData.startedAt = now;
        if (['completed', 'failed', 'cancelled'].includes(status)) updateData.completedAt = now;
      }
      if (result !== undefined) updateData.result = JSON.stringify(result);
      if (error !== undefined) updateData.error = error;

      db.update(tasks).set(updateData).where(eq(tasks.id, task_id)).run();
      const updated = db.select().from(tasks).where(eq(tasks.id, task_id)).get();
      return ok({
        id: updated!.id, status: updated!.status,
        result: updated!.result ? JSON.parse(updated!.result) : null,
        error: updated!.error, updatedAt: now,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('cancel_task', {
    description: 'Cancel a task. Only works for pending, assigned, or running tasks.',
    inputSchema: {
      task_id: z.string().describe('Task ID'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ task_id, token: t }) => {
    try {
      await auth(t, config.jwtSecret);
      const task = db.select().from(tasks).where(eq(tasks.id, task_id)).get();
      if (!task) return fail('Task not found');
      if (!['pending', 'assigned', 'running'].includes(task.status)) {
        return fail(`Cannot cancel task in ${task.status} status`);
      }

      const now = Date.now();
      db.update(tasks).set({ status: 'cancelled', completedAt: now, updatedAt: now }).where(eq(tasks.id, task_id)).run();

      if (task.assignedTo) {
        connectionManager.send(task.assignedTo, {
          type: 'task_cancelled', id: uuidv4(), timestamp: now, payload: { taskId: task_id },
        });
      }
      return ok(null);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  // ── Message Tools ────────────────────────────────────────

  server.registerTool('send_message', {
    description: 'Send a message to another agent.',
    inputSchema: {
      to_agent: z.string().describe('Target agent ID'),
      content: z.any().describe('Message content (any JSON value)'),
      channel: z.string().optional().describe('Channel name (default: "direct")'),
      type: z.string().optional().describe('Message type (default: "text")'),
      task_id: z.string().optional().describe('Related task ID'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ to_agent, content, channel = 'direct', type = 'text', task_id, token: t }) => {
    try {
      const sender = await auth(t, config.jwtSecret);
      const target = db.select().from(agents).where(eq(agents.id, to_agent)).get();
      if (!target) return fail(`Agent ${to_agent} not found`);

      const now = Date.now();
      const messageId = uuidv4();
      db.insert(messages).values({
        id: messageId, fromAgent: sender.agentId, toAgent: to_agent,
        taskId: task_id || null, channel, type, content: JSON.stringify(content), createdAt: now,
      }).run();

      connectionManager.send(to_agent, {
        type: 'message', id: messageId, timestamp: now,
        payload: { from: sender.agentId, channel, type, content },
      });

      return ok({ id: messageId, fromAgent: sender.agentId, toAgent: to_agent, channel, type, content, createdAt: now });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('get_messages', {
    description: 'Query message history with filters.',
    inputSchema: {
      from: z.string().optional().describe('Filter by sender agent ID'),
      to: z.string().optional().describe('Filter by recipient agent ID'),
      task_id: z.string().optional().describe('Filter by task ID'),
      channel: z.string().optional().describe('Filter by channel'),
      since: z.number().int().optional().describe('Filter by timestamp (ms)'),
      limit: z.number().int().optional().describe('Max results (default 50)'),
      offset: z.number().int().optional().describe('Offset (default 0)'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ from, to, task_id, channel, since, limit = 50, offset = 0, token: t }) => {
    try {
      await auth(t, config.jwtSecret);
      let query = db.select().from(messages);
      const conditions = [];
      if (from) conditions.push(eq(messages.fromAgent, from));
      if (to) conditions.push(eq(messages.toAgent, to));
      if (task_id) conditions.push(eq(messages.taskId, task_id));
      if (channel) conditions.push(eq(messages.channel, channel));
      if (since) conditions.push(eq(messages.createdAt, since));
      if (conditions.length > 0) {
        // @ts-ignore
        query = query.where(and(...conditions));
      }
      const all = query.orderBy(desc(messages.createdAt)).limit(limit).offset(offset).all();
      return ok(all.map(m => ({
        id: m.id, fromAgent: m.fromAgent, toAgent: m.toAgent, taskId: m.taskId,
        channel: m.channel, type: m.type, content: JSON.parse(m.content), createdAt: m.createdAt,
      })));
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('broadcast_message', {
    description: 'Broadcast a message to all agents subscribed to a channel.',
    inputSchema: {
      content: z.any().describe('Message content'),
      channel: z.string().describe('Channel name'),
      type: z.string().optional().describe('Message type (default: "text")'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ content, channel, type = 'text', token: t }) => {
    try {
      const sender = await auth(t, config.jwtSecret);
      const now = Date.now();
      const messageId = uuidv4();
      db.insert(messages).values({
        id: messageId, fromAgent: sender.agentId, toAgent: null,
        taskId: null, channel, type, content: JSON.stringify(content), createdAt: now,
      }).run();

      connectionManager.broadcastToChannel(channel, {
        type: 'message', id: messageId, timestamp: now,
        payload: { from: sender.agentId, channel, type, content },
      });

      return ok({ id: messageId, fromAgent: sender.agentId, channel, type, content, createdAt: now });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  // ── State Tools ──────────────────────────────────────────

  server.registerTool('set_state', {
    description: 'Write a shared state value. Broadcasts change to all connected agents.',
    inputSchema: {
      key: z.string().describe('State key'),
      value: z.any().describe('State value (any JSON)'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ key, value, token: t }) => {
    try {
      const payload = await auth(t, config.jwtSecret);
      const now = Date.now();

      connectionManager.broadcast({
        type: 'state_changed', id: uuidv4(), timestamp: now,
        payload: { key, value, updatedBy: payload.agentId },
      });

      return ok({ key, value, updatedBy: payload.agentId, updatedAt: now });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });

  server.registerTool('get_state', {
    description: 'Read a shared state value by key.',
    inputSchema: {
      key: z.string().describe('State key'),
      token: z.string().describe('Your JWT token'),
    },
  }, async ({ key, token: t }) => {
    try {
      await auth(t, config.jwtSecret);
      return ok({ key, message: 'Shared state is in-memory only. Use set_state to write values.' });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Unknown error');
    }
  });
}
