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
  
  const db = initDatabase(config);
  logger.info('Database initialized', { path: config.dbPath });
  
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
    },
  });
  
  fastify.setErrorHandler((error: any, request, reply) => {
    logger.error('Request error', { error: error.message, code: error.code });
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      ok: false,
      data: null,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  });
  
  await registerAgentsRoutes(fastify, config);
  logger.info('HTTP routes registered');
  
  const connectionManager = new ConnectionManager();
  
  await registerTasksRoutes(fastify, config, connectionManager);
  logger.info('Task routes registered');
  
  await registerMessagesRoutes(fastify, config);
  logger.info('Message routes registered');
  
  await registerStateRoutes(fastify, config, connectionManager);
  logger.info('State routes registered');
  
  try {
    await fastify.listen({ port: parseInt(config.port), host: '0.0.0.0' });
    logger.info(`Agent Hub is running on port ${config.port}`);
    
    const wss = new WebSocketServer({ 
      noServer: true,
      maxPayload: 1048576,
    });
    
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
    
    wss.on('connection', async (ws, req) => {
      await setupWebSocket(ws, req, connectionManager, config, db, logger);
    });
    
    logger.info('WebSocket server initialized at /ws');
    
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
