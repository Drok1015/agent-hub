import 'dotenv/config';
import Fastify from 'fastify';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config';
import { initDatabase } from './db';
import { createLogger } from './utils/logger';
import { registerAgentsRoutes } from './routes/agents';
import { registerTasksRoutes } from './routes/tasks';
import { registerMessagesRoutes, registerStateRoutes } from './routes/messages';
import { ConnectionManager } from './ws/connection';
import { setupWebSocket } from './ws/handler';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  
  logger.info('Starting Agent Hub...', { port: config.port, logLevel: config.logLevel });
  
  // 初始化数据库
  const db = initDatabase(config);
  logger.info('Database initialized', { path: config.dbPath });
  
  // 创建 Fastify 实例
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
    },
  });
  
  // 错误处理
  fastify.setErrorHandler((error, request, reply) => {
    logger.error('Request error', { error: error.message, code: (error as any).code });
    
    const statusCode = (error as any).statusCode || 500;
    reply.status(statusCode).send({
      ok: false,
      data: null,
      error: {
        code: (error as any).code || 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  });
  
  // 注册 HTTP 路由
  await registerAgentsRoutes(fastify, config);
  logger.info('HTTP routes registered');
  
  const connectionManager = new ConnectionManager();
  
  // 注册任务路由
  await registerTasksRoutes(fastify, config, connectionManager);
  logger.info('Task routes registered');
  
  // 注册消息路由
  await registerMessagesRoutes(fastify, config);
  logger.info('Message routes registered');
  
  // 注册共享状态路由
  await registerStateRoutes(fastify, config, connectionManager);
  logger.info('State routes registered');
  
  // 启动 HTTP 服务
  try {
    await fastify.listen({ port: parseInt(config.port), host: '0.0.0.0' });
    logger.info(`Agent Hub is running on port ${config.port}`);
    
    // 创建 WebSocket 服务器
    const wss = new WebSocketServer({ 
      noServer: true,
      maxPayload: 1048576,
    });
    
    // 处理 HTTP upgrade 请求
    fastify.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      
      if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
    
    // 处理 WebSocket 连接
    wss.on('connection', async (ws, req) => {
      await setupWebSocket(ws, req, connectionManager, config, db, logger);
    });
    
    logger.info('WebSocket server initialized at /ws');
    
    // 启动心跳检查
    const heartbeatInterval = parseInt(config.heartbeatTimeout) / 3;
    const interval = setInterval(() => {
      const timeout = parseInt(config.heartbeatTimeout);
      const offlineAgents = connectionManager.checkHeartbeats(timeout);
      
      for (const agentId of offlineAgents) {
        logger.warn(`Agent ${agentId} heartbeat timeout, marked as offline`);
      }
    }, heartbeatInterval);
    
    fastify.server.on('close', () => {
      clearInterval(interval);
      wss.close();
    });
    
  } catch (err) {
    logger.error('Failed to start server', err);
  }
}

main();
