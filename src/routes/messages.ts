import { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { messages, agents } from '../db/schema';
import { authMiddleware } from '../auth/middleware';
import { errors, createError } from '../utils/errors';
import { Config } from '../config';
import { getDatabase } from '../db';
import { ConnectionManager } from '../ws/connection';

interface SharedState {
  key: string;
  value: any;
  updatedBy: string;
  updatedAt: number;
}

// 内存存储共享状态
const sharedStates: Map<string, SharedState> = new Map();

export async function registerMessagesRoutes(
  fastify: FastifyInstance,
  config: Config
) {
  const db = getDatabase();
  
  // GET /api/v1/messages - 获取消息历史
  fastify.get('/api/v1/messages', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { from, to, taskId, channel, since, limit = '50', offset = '0' } = request.query as any;
    
    let conditions = [];
    
    if (from) {
      conditions.push(eq(messages.fromAgent, from));
    }
    if (to) {
      conditions.push(eq(messages.toAgent, to));
    }
    if (taskId) {
      conditions.push(eq(messages.taskId, taskId));
    }
    if (channel) {
      conditions.push(eq(messages.channel, channel));
    }
    if (since) {
      conditions.push(eq(messages.createdAt, parseInt(since)));
    }
    
    let query = db.select().from(messages);
    if (conditions.length > 0) {
      // @ts-ignore
      query = query.where(and(...conditions));
    }
    
    const allMessages = query
      .orderBy(desc(messages.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset))
      .all();
    
    return {
      ok: true,
      data: allMessages.map((msg) => ({
        id: msg.id,
        fromAgent: msg.fromAgent,
        toAgent: msg.toAgent,
        taskId: msg.taskId,
        channel: msg.channel,
        type: msg.type,
        content: JSON.parse(msg.content),
        createdAt: msg.createdAt,
      })),
    };
  });
}

export async function registerStateRoutes(
  fastify: FastifyInstance,
  config: Config,
  connectionManager: ConnectionManager
) {
  const db = getDatabase();
  
  // GET /api/v1/state/:key - 读取共享状态
  fastify.get<{ Params: { key: string } }>('/api/v1/state/:key', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { key } = request.params;
    const state = sharedStates.get(key);
    
    if (!state) {
      throw createError(errors.AGENT_NOT_FOUND, `State key "${key}" not found`);
    }
    
    return {
      ok: true,
      data: state,
    };
  });
  
  // PUT /api/v1/state/:key - 写入共享状态
  fastify.put<{ Params: { key: string }; Body: { value: any } }>('/api/v1/state/:key', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { key } = request.params;
    const { value } = request.body;
    const updatedBy = request.user!.agentId;
    const now = Date.now();
    
    const state: SharedState = {
      key,
      value,
      updatedBy,
      updatedAt: now,
    };
    
    sharedStates.set(key, state);
    
    // 广播状态变更
    connectionManager.broadcast({
      type: 'state_changed',
      id: uuidv4(),
      timestamp: now,
      payload: {
        key,
        value,
        updatedBy,
      },
    });
    
    return {
      ok: true,
      data: state,
    };
  });
  
  // DELETE /api/v1/state/:key - 删除共享状态
  fastify.delete<{ Params: { key: string } }>('/api/v1/state/:key', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { key } = request.params;
    sharedStates.delete(key);
    
    return {
      ok: true,
      data: null,
    };
  });
  
  // GET /api/v1/state - 列出所有共享状态键
  fastify.get('/api/v1/state', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async () => {
    const keys = Array.from(sharedStates.keys());
    
    return {
      ok: true,
      data: keys.map((key) => {
        const state = sharedStates.get(key)!;
        return {
          key: state.key,
          updatedAt: state.updatedAt,
          updatedBy: state.updatedBy,
        };
      }),
    };
  });
}
