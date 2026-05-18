export interface AgentConfig {
  server: string;
  token: string;
  name?: string;
  capabilities?: string[];
  reconnect?: boolean;
  heartbeatInterval?: number;
}

export interface Agent {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
  lastSeen?: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  createdBy: string;
  assignedTo?: string;
  payload?: any;
  result?: any;
  error?: string;
  timeoutMs?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface Message {
  id: string;
  from: string;
  channel: string;
  type: string;
  content: any;
  timestamp: number;
}

export interface StateChange {
  key: string;
  value: any;
  updatedBy: string;
}

export type EventHandler<T = any> = (data: T) => void;

export interface Events {
  connected: () => void;
  disconnected: (reason: string) => void;
  'task:assigned': (task: Task) => void;
  'task:cancelled': (taskId: string) => void;
  message: (msg: Message) => void;
  'agent:online': (agent: Agent) => void;
  'agent:offline': (agentId: string) => void;
  'state:changed': (change: StateChange) => void;
  error: (err: Error) => void;
}
