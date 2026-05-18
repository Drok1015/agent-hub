import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken, hashToken } from '../auth/jwt';
import { ConnectionManager } from './connection';
import { Config } from '../config';
import { createLogger } from '../utils/logger';
import { getDatabase } from '../db';
import { agents, messages, agentTokens } from '../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

type Logger = ReturnType<typeof createLogger>;

export async function setupWebSocket(
  ws: WebSocket,
  req: IncomingMessage,
  connectionManager: ConnectionManager,
  config: Config,
  db: ReturnType<typeof getDatabase>,
  logger: Logger
) {
  // 从 query 参数获取 token
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  
  if (!token) {
    logger.warn('WS connection rejected: missing token');
    ws.close(4001, 'Missing token');
    return;
  }
  
  // 验证 token
  try {
    const payload = await verifyToken(token, config.jwtSecret);
    
    // 检查 token 是否被吊销
    const tokenRecord = db.select().from(agentTokens).where(eq(agentTokens.token, token)).get();
    if (tokenRecord?.revoked) {
      logger.warn(`WS connection rejected: token revoked for agent ${payload.agentId}`);
      ws.close(4002, 'Token revoked');
      return;
    }
    
    // 建立连接
    const conn = connectionManager.add(payload.agentId, payload.name, ws);
    logger.info(`Agent connected: ${payload.name} (${payload.agentId})`);
    
    // 更新 Agent 状态为 online
    db.update(agents).set({
      status: 'online',
      lastSeen: Date.now(),
      updatedAt: Date.now(),
    }).where(eq(agents.id, payload.agentId)).run();
    
    // 广播 agent_online 事件
    connectionManager.broadcast({
      type: 'agent_online',
      id: uuidv4(),
      timestamp: Date.now(),
      payload: {
        agentId: payload.agentId,
        name: payload.name,
      },
    }, payload.agentId);
    
    // 处理收到的消息
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleWSMessage(msg, payload.agentId, payload.name, connectionManager, db, logger, config);
      } catch (error) {
        logger.error('WS message parse error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          id: uuidv4(),
          timestamp: Date.now(),
          payload: {
            code: 'PARSE_ERROR',
            message: 'Invalid message format',
          },
        }));
      }
    });
    
    // 处理断开连接
    ws.on('close', () => {
      logger.info(`Agent disconnected: ${payload.name}`);
      handleDisconnect(payload.agentId, payload.name, connectionManager, db, logger);
    });
    
    // 发送连接成功确认
    ws.send(JSON.stringify({
      type: 'connected',
      id: uuidv4(),
      timestamp: Date.now(),
      payload: {
        agentId: payload.agentId,
        name: payload.name,
      },
    }));
    
  } catch (error) {
    logger.warn('WS connection rejected: invalid token', error);
    ws.close(4003, 'Invalid token');
  }
}

async function handleWSMessage(
  msg: any,
  agentId: string,
  name: string,
  connectionManager: ConnectionManager,
  db: ReturnType<typeof getDatabase>,
  logger: Logger,
  config: Config
) {
  const { type, payload } = msg;
  
  switch (type) {
    case 'heartbeat': {
      connectionManager.updateHeartbeat(agentId);
      connectionManager.send(agentId, {
        type: 'heartbeat_ack',
        id: uuidv4(),
        timestamp: Date.now(),
        payload: {
          serverTime: Date.now(),
        },
      });
      break;
    }
    
    case 'send': {
      // 点对点消息
      const { to, channel, type: msgType, content } = payload;
      
      // 持久化消息
      const messageId = uuidv4();
      const now = Date.now();
      db.insert(messages).values({
        id: messageId,
        fromAgent: agentId,
        toAgent: to,
        channel: channel || 'direct',
        type: msgType || 'text',
        content: JSON.stringify(content),
        createdAt: now,
      }).run();
      
      // 发送给目标 Agent
      const sent = connectionManager.send(to, {
        type: 'message',
        id: messageId,
        timestamp: now,
        payload: {
          from: agentId,
          channel: channel || 'direct',
          type: msgType || 'text',
          content,
          id: messageId,
          timestamp: now,
        },
      });
      
      if (!sent) {
        logger.warn(`Message to ${to} failed: agent offline`);
      }
      break;
    }
    
    case 'broadcast': {
      const { channel, type: msgType, content } = payload;
      const messageId = uuidv4();
      const now = Date.now();
      
      // 持久化消息
      db.insert(messages).values({
        id: messageId,
        fromAgent: agentId,
        toAgent: null,
        channel: channel || 'broadcast',
        type: msgType || 'text',
        content: JSON.stringify(content),
        createdAt: now,
      }).run();
      
      // 广播给频道订阅者
      connectionManager.broadcastToChannel(channel, {
        type: 'message',
        id: messageId,
        timestamp: now,
        payload: {
          from: agentId,
          channel,
          type: msgType || 'text',
          content,
          id: messageId,
          timestamp: now,
        },
      }, agentId);
      break;
    }
    
    case 'subscribe': {
      const { channel } = payload;
      connectionManager.subscribe(agentId, channel);
      logger.debug(`Agent ${name} subscribed to channel: ${channel}`);
      break;
    }
    
    case 'unsubscribe': {
      const { channel } = payload;
      connectionManager.unsubscribe(agentId, channel);
      logger.debug(`Agent ${name} unsubscribed from channel: ${channel}`);
      break;
    }
    
    default:
      logger.warn(`Unknown WS message type: ${type}`);
  }
}

function handleDisconnect(
  agentId: string,
  name: string,
  connectionManager: ConnectionManager,
  db: ReturnType<typeof getDatabase>,
  logger: Logger
) {
  connectionManager.remove(agentId);
  
  // 更新 Agent 状态为 offline
  db.update(agents).set({
    status: 'offline',
    lastSeen: Date.now(),
    updatedAt: Date.now(),
  }).where(eq(agents.id, agentId)).run();
  
  // 广播 agent_offline 事件
  connectionManager.broadcast({
    type: 'agent_offline',
    id: uuidv4(),
    timestamp: Date.now(),
    payload: {
      agentId,
      name,
    },
  });
  
  logger.info(`Agent offline: ${name} (${agentId})`);
}
