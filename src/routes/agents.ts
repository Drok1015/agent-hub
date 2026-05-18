import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { agents, agentTokens } from '../db/schema';
import { signToken, hashToken } from '../auth/jwt';
import { authMiddleware } from '../auth/middleware';
import { errors, createError } from '../utils/errors';
import { Config } from '../config';
import { getDatabase } from '../db';

interface RegisterBody {
  name: string;
  capabilities?: string[];
  metadata?: Record<string, any>;
}

export async function registerAgentsRoutes(
  fastify: FastifyInstance,
  config: Config
) {
  const db = getDatabase();
  
  // POST /api/v1/agents - 注册 Agent
  fastify.post<{ Body: RegisterBody }>('/api/v1/agents', async (request, reply) => {
    const { name, capabilities = [], metadata = {} } = request.body;
    
    if (!name) {
      throw createError(errors.INVALID_REQUEST, 'Agent name is required');
    }
    
    // 检查是否已存在
    const existing = db.select().from(agents).where(eq(agents.name, name)).get();
    if (existing) {
      throw createError(errors.AGENT_EXISTS);
    }
    
    const now = Date.now();
    const agentId = uuidv4();
    
    // 生成 JWT
    const token = await signToken(
      { agentId, name },
      config.jwtSecret,
      config.jwtExpiresIn
    );
    
    // 存储 Agent 和 Token
    db.insert(agents).values({
      id: agentId,
      name,
      tokenHash: hashToken(token),
      status: 'offline',
      capabilities: JSON.stringify(capabilities),
      metadata: JSON.stringify(metadata),
      lastSeen: null,
      createdAt: now,
      updatedAt: now,
    }).run();
    
    db.insert(agentTokens).values({
      id: uuidv4(),
      agentId,
      token,
      name: 'default',
      expiresAt: null,
      revoked: 0,
      createdAt: now,
    }).run();
    
    return reply.status(201).send({
      ok: true,
      data: {
        id: agentId,
        name,
        token,
        capabilities,
        status: 'offline',
        createdAt: now,
      },
    });
  });
  
  // GET /api/v1/agents - 获取所有 Agent 列表
  fastify.get('/api/v1/agents', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async () => {
    const allAgents = db.select().from(agents).all();
    
    return {
      ok: true,
      data: allAgents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        capabilities: JSON.parse(agent.capabilities || '[]'),
        lastSeen: agent.lastSeen,
        createdAt: agent.createdAt,
      })),
    };
  });
  
  // GET /api/v1/agents/:id - 获取单个 Agent
  fastify.get<{ Params: { id: string } }>('/api/v1/agents/:id', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { id } = request.params;
    
    const agent = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!agent) {
      throw createError(errors.AGENT_NOT_FOUND);
    }
    
    return {
      ok: true,
      data: {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        capabilities: JSON.parse(agent.capabilities || '[]'),
        metadata: JSON.parse(agent.metadata || '{}'),
        lastSeen: agent.lastSeen,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      },
    };
  });
  
  // PATCH /api/v1/agents/:id - 更新 Agent
  fastify.patch<{ Params: { id: string }; Body: { capabilities?: string[]; metadata?: Record<string, any> } }>('/api/v1/agents/:id', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { id } = request.params;
    const { capabilities, metadata } = request.body;
    
    const agent = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!agent) {
      throw createError(errors.AGENT_NOT_FOUND);
    }
    
    // 验证：只能更新自己的信息
    if (request.user?.agentId !== id) {
      throw createError(errors.UNAUTHORIZED);
    }
    
    const now = Date.now();
    const updateData: Record<string, any> = { updatedAt: now };
    
    if (capabilities) {
      updateData.capabilities = JSON.stringify(capabilities);
    }
    if (metadata) {
      updateData.metadata = JSON.stringify(metadata);
    }
    
    db.update(agents).set(updateData).where(eq(agents.id, id)).run();
    
    return {
      ok: true,
      data: {
        id: agent.id,
        name: agent.name,
        capabilities: capabilities ?? JSON.parse(agent.capabilities || '[]'),
        metadata: metadata ?? JSON.parse(agent.metadata || '{}'),
        updatedAt: now,
      },
    };
  });
  
  // DELETE /api/v1/agents/:id - 注销 Agent
  fastify.delete<{ Params: { id: string } }>('/api/v1/agents/:id', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { id } = request.params;
    
    const agent = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!agent) {
      throw createError(errors.AGENT_NOT_FOUND);
    }
    
    // 验证：只能删除自己的账号
    if (request.user?.agentId !== id) {
      throw createError(errors.UNAUTHORIZED);
    }
    
    // 删除 Agent 和关联的 tokens
    db.delete(agentTokens).where(eq(agentTokens.agentId, id)).run();
    db.delete(agents).where(eq(agents.id, id)).run();
    
    return {
      ok: true,
      data: null,
    };
  });
}
