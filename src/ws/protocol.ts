// 客户端 → 服务端消息类型
export type ClientMessageType = 
  | 'heartbeat'
  | 'send'
  | 'task_update'
  | 'broadcast'
  | 'subscribe'
  | 'unsubscribe';

// 服务端 → 客户端消息类型
export type ServerMessageType =
  | 'heartbeat_ack'
  | 'message'
  | 'task_assigned'
  | 'task_cancelled'
  | 'agent_online'
  | 'agent_offline'
  | 'state_changed'
  | 'error';

export interface WSMessage<T extends string = string, P = any> {
  type: T;
  id: string;
  timestamp: number;
  payload: P;
}

// 客户端消息 payload 类型
export interface HeartbeatPayload {}

export interface SendPayload {
  to: string;
  channel: string;
  type: string;
  content: any;
}

export interface TaskUpdatePayload {
  taskId: string;
  status: string;
  result?: any;
  error?: string;
}

export interface BroadcastPayload {
  channel: string;
  type: string;
  content: any;
}

export interface SubscribePayload {
  channel: string;
}

export interface UnsubscribePayload {
  channel: string;
}

// 服务端消息 payload 类型
export interface HeartbeatAckPayload {
  serverTime: number;
}

export interface MessagePayload {
  from: string;
  channel: string;
  type: string;
  content: any;
  id: string;
  timestamp: number;
}

export interface TaskAssignedPayload {
  task: any;
}

export interface TaskCancelledPayload {
  taskId: string;
}

export interface AgentOnlinePayload {
  agentId: string;
  name: string;
}

export interface AgentOfflinePayload {
  agentId: string;
  name: string;
}

export interface StateChangedPayload {
  key: string;
  value: any;
  updatedBy: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}
