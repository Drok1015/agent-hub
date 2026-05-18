import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  tokenHash: text('token_hash').notNull(),
  status: text('status').notNull().default('offline'),
  capabilities: text('capabilities').default('[]'),
  metadata: text('metadata').default('{}'),
  lastSeen: integer('last_seen'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').default(''),
  status: text('status').notNull().default('pending'),
  priority: integer('priority').default(0),
  createdBy: text('created_by').notNull(),
  assignedTo: text('assigned_to'),
  payload: text('payload').default('{}'),
  result: text('result'),
  error: text('error'),
  timeoutMs: integer('timeout_ms').default(300000),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  fromAgent: text('from_agent').notNull(),
  toAgent: text('to_agent'),
  taskId: text('task_id'),
  channel: text('channel').notNull().default('direct'),
  type: text('type').notNull().default('text'),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const agentTokens = sqliteTable('agent_tokens', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  token: text('token').notNull(),
  name: text('name').default(''),
  expiresAt: integer('expires_at'),
  revoked: integer('revoked').default(0),
  createdAt: integer('created_at').notNull(),
});
