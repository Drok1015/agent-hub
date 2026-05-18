import { FastifyInstance } from 'fastify';
import { eq, and, desc, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { tasks, agents } from '../db/schema';
import { authMiddleware } from '../auth/middleware';
import { errors, createError } from '../utils/errors';
import { Config } from '../config';
import { getDatabase } from '../db';
import { ConnectionManager } from '../ws/connection';

interface CreateTaskBody {
  title: string;
  description?: string;
  priority?: number;
  assignedTo?: string;
  payload?: Record<string, any>;
  timeoutMs?: number;
}

interface UpdateTaskBody {
  status?: string;
  result?: any;
  error?: string;
}

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['assigned', 'cancelled'],
  assigned: ['running', 'cancelled'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
};

export async function registerTasksRoutes(
  fastify: FastifyInstance,
  config: Config,
  connectionManager: ConnectionManager
) {
  const db = getDatabase();
  
  // POST /api/v1/tasks - 创建任务
  fastify.post<{ Body: CreateTaskBody }>('/api/v1/tasks', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request, reply) => {
    const { title, description = '', priority = 0, assignedTo, payload = {}, timeoutMs = 300000 } = request.body;
    
    if (!title) {
      throw createError(errors.INVALID_REQUEST, 'Task title is required');
    }
    
    const now = Date.now();
    const taskId = uuidv4();
    const createdBy = request.user!.agentId;
    
    // 如果指定了执行者，验证是否存在
    let status = 'pending';
    if (assignedTo) {
      const assignee = db.select().from(agents).where(eq(agents.id, assignedTo)).get();
      if (!assignee) {
        throw createError(errors.AGENT_NOT_FOUND, `Agent ${assignedTo} not found`);
      }
      status = 'assigned';
    }
    
    // 创建任务
    db.insert(tasks).values({
      id: taskId,
      title,
      description,
      status,
      priority,
      createdBy,
      assignedTo: assignedTo || null,
      payload: JSON.stringify(payload),
      timeoutMs,
      createdAt: now,
      updatedAt: now,
    }).run();
    
    // 如果分配了任务，通过 WS 通知执行者
    if (assignedTo && status === 'assigned') {
      const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      const sent = connectionManager.send(assignedTo, {
        type: 'task_assigned',
        id: uuidv4(),
        timestamp: now,
        payload: {
          task: {
            id: task!.id,
            title: task!.title,
            description: task!.description,
            status: task!.status,
            priority: task!.priority,
            payload: JSON.parse(task!.payload || '{}'),
            timeoutMs: task!.timeoutMs,
            createdAt: task!.createdAt,
          },
        },
      });
      
      if (!sent) {
        console.log(`Task assigned to ${assignedTo} but agent is offline`);
      }
    }
    
    return reply.status(201).send({
      ok: true,
      data: {
        id: taskId,
        title,
        description,
        status,
        priority,
        assignedTo,
        createdAt: now,
      },
    });
  });
  
  // GET /api/v1/tasks - 查询任务列表
  fastify.get('/api/v1/tasks', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { status, assignedTo, createdBy, limit = '50', offset = '0' } = request.query as any;
    
    let query = db.select().from(tasks);
    let conditions = [];
    
    if (status) {
      conditions.push(eq(tasks.status, status));
    }
    if (assignedTo) {
      conditions.push(eq(tasks.assignedTo, assignedTo));
    }
    if (createdBy) {
      conditions.push(eq(tasks.createdBy, createdBy));
    }
    
    if (conditions.length > 0) {
      // @ts-ignore - Drizzle type issue
      query = query.where(and(...conditions));
    }
    
    const allTasks = query
      .orderBy(desc(tasks.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset))
      .all();
    
    return {
      ok: true,
      data: allTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        createdBy: task.createdBy,
        assignedTo: task.assignedTo,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
      })),
    };
  });
  
  // GET /api/v1/tasks/:id - 获取任务详情
  fastify.get<{ Params: { id: string } }>('/api/v1/tasks/:id', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { id } = request.params;
    
    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!task) {
      throw createError(errors.TASK_NOT_FOUND);
    }
    
    return {
      ok: true,
      data: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        createdBy: task.createdBy,
        assignedTo: task.assignedTo,
        payload: JSON.parse(task.payload || '{}'),
        result: task.result ? JSON.parse(task.result) : null,
        error: task.error,
        timeoutMs: task.timeoutMs,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
      },
    };
  });
  
  // PATCH /api/v1/tasks/:id - 更新任务状态
  fastify.patch<{ Params: { id: string }; Body: UpdateTaskBody }>('/api/v1/tasks/:id', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { id } = request.params;
    const { status, result, error } = request.body;
    
    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!task) {
      throw createError(errors.TASK_NOT_FOUND);
    }
    
    // 验证状态流转
    if (status) {
      const validTransitions = VALID_STATUS_TRANSITIONS[task.status] || [];
      if (!validTransitions.includes(status)) {
        throw createError(errors.INVALID_STATUS_TRANSITION, `Cannot transition from ${task.status} to ${status}`);
      }
    }
    
    const now = Date.now();
    const updateData: Record<string, any> = { updatedAt: now };
    
    if (status) {
      updateData.status = status;
      
      if (status === 'running' && !task.startedAt) {
        updateData.startedAt = now;
      }
      
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        updateData.completedAt = now;
      }
    }
    
    if (result !== undefined) {
      updateData.result = JSON.stringify(result);
    }
    
    if (error !== undefined) {
      updateData.error = error;
    }
    
    db.update(tasks).set(updateData).where(eq(tasks.id, id)).run();
    
    const updatedTask = db.select().from(tasks).where(eq(tasks.id, id)).get();
    
    return {
      ok: true,
      data: {
        id: updatedTask!.id,
        status: updatedTask!.status,
        result: updatedTask!.result ? JSON.parse(updatedTask!.result) : null,
        error: updatedTask!.error,
        updatedAt: now,
      },
    };
  });
  
  // POST /api/v1/tasks/:id/cancel - 取消任务
  fastify.post<{ Params: { id: string } }>('/api/v1/tasks/:id/cancel', { preHandler: [(req, reply) => authMiddleware(req, reply, config)] }, async (request) => {
    const { id } = request.params;
    
    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!task) {
      throw createError(errors.TASK_NOT_FOUND);
    }
    
    // 检查是否可以取消
    if (!['pending', 'assigned', 'running'].includes(task.status)) {
      throw createError(errors.INVALID_STATUS_TRANSITION, `Cannot cancel task in ${task.status} status`);
    }
    
    const now = Date.now();
    db.update(tasks).set({
      status: 'cancelled',
      completedAt: now,
      updatedAt: now,
    }).where(eq(tasks.id, id)).run();
    
    // 通知执行者
    if (task.assignedTo) {
      connectionManager.send(task.assignedTo, {
        type: 'task_cancelled',
        id: uuidv4(),
        timestamp: now,
        payload: {
          taskId: id,
        },
      });
    }
    
    return {
      ok: true,
      data: null,
    };
  });
}
