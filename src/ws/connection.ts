import WebSocket from 'ws';

export interface Connection {
  agentId: string;
  name: string;
  socket: WebSocket;
  lastHeartbeat: number;
  subscriptions: Set<string>;
}

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();

  add(agentId: string, name: string, socket: WebSocket): Connection {
    const conn: Connection = {
      agentId,
      name,
      socket,
      lastHeartbeat: Date.now(),
      subscriptions: new Set(),
    };
    this.connections.set(agentId, conn);
    return conn;
  }

  remove(agentId: string): void {
    this.connections.delete(agentId);
  }

  get(agentId: string): Connection | undefined {
    return this.connections.get(agentId);
  }

  getAll(): Connection[] {
    return Array.from(this.connections.values());
  }

  send(agentId: string, message: any): boolean {
    const conn = this.connections.get(agentId);
    if (!conn || conn.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    
    try {
      conn.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Failed to send message to ${agentId}:`, error);
      return false;
    }
  }

  broadcast(message: any, excludeAgentId?: string): void {
    const msg = JSON.stringify(message);
    for (const [agentId, conn] of this.connections) {
      if (excludeAgentId && agentId === excludeAgentId) continue;
      if (conn.socket.readyState === WebSocket.OPEN) {
        conn.socket.send(msg);
      }
    }
  }

  broadcastToChannel(channel: string, message: any, excludeAgentId?: string): void {
    const msg = JSON.stringify(message);
    for (const [agentId, conn] of this.connections) {
      if (excludeAgentId && agentId === excludeAgentId) continue;
      if (conn.subscriptions.has(channel) && conn.socket.readyState === WebSocket.OPEN) {
        conn.socket.send(msg);
      }
    }
  }

  checkHeartbeats(timeout: number): string[] {
    const offline: string[] = [];
    const now = Date.now();
    
    for (const [agentId, conn] of this.connections) {
      if (now - conn.lastHeartbeat > timeout) {
        offline.push(agentId);
        try {
          conn.socket.terminate();
        } catch (e) {
          // Ignore terminate errors
        }
        this.connections.delete(agentId);
      }
    }
    
    return offline;
  }

  updateHeartbeat(agentId: string): void {
    const conn = this.connections.get(agentId);
    if (conn) {
      conn.lastHeartbeat = Date.now();
    }
  }

  subscribe(agentId: string, channel: string): void {
    const conn = this.connections.get(agentId);
    if (conn) {
      conn.subscriptions.add(channel);
    }
  }

  unsubscribe(agentId: string, channel: string): void {
    const conn = this.connections.get(agentId);
    if (conn) {
      conn.subscriptions.delete(channel);
    }
  }
}
