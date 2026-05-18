import { FastifyInstance } from 'fastify';
import { ConnectionManager } from './connection';
import { setupWebSocket } from './handler';
import { Config } from '../config';
import { createLogger } from '../utils/logger';

export function initWebSocketServer(
  fastify: FastifyInstance,
  config: Config
): ConnectionManager {
  const logger = createLogger(config.logLevel);
  const connectionManager = new ConnectionManager();
  
  // 设置 WebSocket 路由
  setupWebSocket(fastify, config, connectionManager);
  logger.info('WebSocket handler registered');
  
  // 启动心跳检查定时器
  const heartbeatInterval = parseInt(config.heartbeatTimeout) / 3; // 30 秒检查一次
  logger.info(`Starting heartbeat checker every ${heartbeatInterval / 1000}s`);
  
  const interval = setInterval(() => {
    const timeout = parseInt(config.heartbeatTimeout);
    const offlineAgents = connectionManager.checkHeartbeats(timeout);
    
    for (const agentId of offlineAgents) {
      logger.warn(`Agent ${agentId} heartbeat timeout, marked as offline`);
    }
  }, heartbeatInterval);
  
  // 清理定时器
  fastify.addHook('onClose', () => {
    clearInterval(interval);
  });
  
  return connectionManager;
}
