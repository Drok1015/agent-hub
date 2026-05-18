import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { AgentConfig, Agent, Task, Message, StateChange, Events } from './types';

export class AgentClient extends EventEmitter {
  private config: Required<AgentConfig>;
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private manualDisconnect = false;

  constructor(config: AgentConfig) {
    super();
    this.config = {
      server: config.server,
      token: config.token,
      name: config.name || '',
      capabilities: config.capabilities || [],
      reconnect: config.reconnect !== false,
      heartbeatInterval: config.heartbeatInterval || 30000,
    };
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const url = `${this.config.server.replace('http', 'ws')}/ws?token=${this.config.token}`;
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.manualDisconnect = false;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            this.handleMessage(msg);
          } catch (err) {
            this.emit('error', new Error(`Failed to parse message: ${err}`));
          }
        });

        this.ws.on('close', (code, reason) => {
          this.connected = false;
          this.stopHeartbeat();
          
          if (!this.manualDisconnect && this.config.reconnect) {
            this.scheduleReconnect();
          } else {
            this.emit('disconnected', reason.toString());
          }
        });

        this.ws.on('error', (err) => {
          this.emit('error', err);
          if (!this.connected) {
            reject(err);
          }
        });

      } catch (err) {
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.stopReconnect();
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  async send(to: string, message: { channel?: string; type?: string; content: any }): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    this.ws.send(JSON.stringify({
      type: 'send',
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        to,
        channel: message.channel || 'direct',
        type: message.type || 'text',
        content: message.content,
      },
    }));
  }

  async broadcast(channel: string, message: { type?: string; content: any }): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    this.ws.send(JSON.stringify({
      type: 'broadcast',
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        channel,
        type: message.type || 'text',
        content: message.content,
      },
    }));
  }

  async subscribe(channel: string): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      id: this.generateId(),
      timestamp: Date.now(),
      payload: { channel },
    }));
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    this.ws.send(JSON.stringify({
      type: 'unsubscribe',
      id: this.generateId(),
      timestamp: Date.now(),
      payload: { channel },
    }));
  }

  async completeTask(taskId: string, result: any): Promise<void> {
    await this.updateTask(taskId, 'completed', result);
  }

  async failTask(taskId: string, error: string): Promise<void> {
    await this.updateTask(taskId, 'failed', undefined, error);
  }

  private async updateTask(taskId: string, status: string, result?: any, error?: string): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    this.ws.send(JSON.stringify({
      type: 'task_update',
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        taskId,
        status,
        result,
        error,
      },
    }));
  }

  async getState(key: string): Promise<any> {
    const response = await this.httpGet(`/api/v1/state/${key}`);
    return response.data;
  }

  async setState(key: string, value: any): Promise<void> {
    await this.httpPut(`/api/v1/state/${key}`, { value });
  }

  async listAgents(): Promise<Agent[]> {
    const response = await this.httpGet('/api/v1/agents');
    return response.data;
  }

  async listTasks(filters?: { status?: string; assignedTo?: string; limit?: number; offset?: number }): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const query = params.toString();
    const response = await this.httpGet(`/api/v1/tasks${query ? `?${query}` : ''}`);
    return response.data;
  }

  private handleMessage(msg: any) {
    const { type, payload } = msg;

    switch (type) {
      case 'heartbeat_ack':
        // Heartbeat acknowledged
        break;

      case 'task_assigned':
        this.emit('task:assigned', payload.task);
        break;

      case 'task_cancelled':
        this.emit('task:cancelled', payload.taskId);
        break;

      case 'message':
        this.emit('message', {
          id: payload.id,
          from: payload.from,
          channel: payload.channel,
          type: payload.type,
          content: payload.content,
          timestamp: payload.timestamp,
        });
        break;

      case 'agent_online':
        this.emit('agent:online', {
          id: payload.agentId,
          name: payload.name,
          status: 'online',
          capabilities: [],
        });
        break;

      case 'agent_offline':
        this.emit('agent:offline', payload.agentId);
        break;

      case 'state_changed':
        this.emit('state:changed', {
          key: payload.key,
          value: payload.value,
          updatedBy: payload.updatedBy,
        });
        break;

      case 'error':
        this.emit('error', new Error(payload.message));
        break;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.connected) {
        this.ws.send(JSON.stringify({
          type: 'heartbeat',
          id: this.generateId(),
          timestamp: Date.now(),
          payload: {},
        }));
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    this.stopReconnect();
    
    const delays = [1000, 2000, 4000, 8000, 16000, 30000];
    const delay = delays[Math.min(this.reconnectAttempts, delays.length - 1)];
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect will be rescheduled
      });
    }, delay);
  }

  private stopReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async httpGet(path: string): Promise<any> {
    const url = `${this.config.server}${path}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async httpPut(path: string, body: any): Promise<void> {
    const url = `${this.config.server}${path}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  on<Event extends keyof Events>(event: Event, handler: Events[Event]): this {
    super.on(event, handler as any);
    return this;
  }
}
