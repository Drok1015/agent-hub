# Agent Hub 技术设计文档

> 版本号：1.0.0  
> 创建日期：2026-05-18  
> 最后更新：2026-05-18

---

## 1. 系统架构

### 1.1 架构图

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Agent A    │  │   Agent B    │  │   Agent C    │
│  (机器 1)    │  │  (机器 2)    │  │  (机器 3)    │
│              │  │              │  │              │
│  SDK Client  │  │  SDK Client  │  │  SDK Client  │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       │    HTTPS + WSS  │                 │
       └─────────────────┼─────────────────┘
                         │
                ┌────────┴────────┐
                │   Agent Hub     │
                │   (Node.js)     │
                │                 │
                │  ┌───────────┐  │
                │  │ HTTP API  │  │  ← REST 接口
                │  │ :3000     │  │
                │  ├───────────┤  │
                │  │ WS Server │  │  ← 实时通道
                │  │ :3000     │  │
                │  ├───────────┤  │
                │  │  Router   │  │  ← 消息路由
                │  ├───────────┤  │
                │  │  Auth     │  │  ← JWT 鉴权
                │  ├───────────┤  │
                │  │  Store    │  │  ← 数据持久化
                │  └─────┬─────┘  │
                │        │        │
                │  ┌─────┴─────┐  │
                │  │  SQLite   │  │
                │  │  hub.db   │  │
                │  └───────────┘  │
                └─────────────────┘
```

### 1.2 技术栈

| 组件 | 选型 | 版本 | 理由 |
|------|------|------|------|
| 运行时 | Node.js | 20+ LTS | 生态成熟，性能优异 |
| HTTP 框架 | Fastify | 5.x | 高性能，内置 schema 校验 |
| WebSocket | ws | 8.x | 轻量、无额外依赖 |
| 数据库 | SQLite | 3.x | 零运维，单文件部署 |
| DB 驱动 | better-sqlite3 | 11.x | 同步 API，性能极佳 |
| ORM | Drizzle ORM | 0.30+ | 类型安全，迁移方便 |
| 鉴权 | jose | 5.x | 标准 JWT，支持 Ed25519/RS256 |
| 进程管理 | PM2 | 5.x | 自动重启、日志管理 |
| 构建 | tsx | 4.x | 开发热重载，零配置 |

### 1.3 目录结构

```
agent-hub/
├── src/
│   ├── index.ts              # 入口，启动 HTTP + WS
│   ├── config.ts             # 配置管理
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema 定义
│   │   ├── migrate.ts        # 数据库迁移脚本
│   │   └── index.ts          # DB 连接初始化
│   ├── auth/
│   │   ├── jwt.ts            # JWT 签发与验证
│   │   └── middleware.ts     # Fastify 鉴权中间件
│   ├── routes/
│   │   ├── agents.ts         # Agent CRUD 路由
│   │   ├── tasks.ts          # 任务管理路由
│   │   ├── messages.ts       # 消息历史路由
│   │   └── state.ts          # 共享状态路由
│   ├── ws/
│   │   ├── server.ts         # WebSocket 服务初始化
│   │   ├── handler.ts        # 消息处理与路由
│   │   ├── connection.ts     # 连接管理（心跳、重连）
│   │   └── protocol.ts       # WS 消息协议定义
│   └── utils/
│       ├── logger.ts         # 日志工具
│       └── errors.ts         # 错误码定义
├── sdk/                      # Agent SDK（独立包）
│   ├── src/
│   │   ├── index.ts          # SDK 入口
│   │   ├── client.ts         # AgentClient 核心类
│   │   ├── events.ts         # 事件定义
│   │   └── types.ts          # 类型定义
│   ├── package.json
│   └── tsconfig.json
├── drizzle/                  # 迁移文件目录
│   └── 0000_init.sql
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .env.example
└── README.md
```

---

## 2. 模块设计

### 2.1 核心模块

#### 2.1.1 配置模块 (config.ts)

```typescript
interface Config {
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  dbPath: string;
  heartbeatTimeout: number;
  logLevel: string;
}

// 从环境变量加载配置，提供默认值
export function loadConfig(): Config;
```

#### 2.1.2 日志模块 (logger.ts)

```typescript
interface Logger {
  debug(msg: string, data?: any): void;
  info(msg: string, data?: any): void;
  warn(msg: string, data?: any): void;
  error(msg: string, data?: any): void;
}

// 结构化日志输出，支持按级别过滤
export function createLogger(level: string): Logger;
```

#### 2.1.3 错误码定义 (errors.ts)

```typescript
interface AppError {
  code: string;
  message: string;
  statusCode: number;
}

// 预定义错误码
export const errors = {
  AGENT_NOT_FOUND: { code: 'AGENT_NOT_FOUND', message: 'Agent not found', statusCode: 404 },
  INVALID_TOKEN: { code: 'INVALID_TOKEN', message: 'Invalid token', statusCode: 401 },
  // ...
};
```

### 2.2 数据库模块

#### 2.2.1 Schema 定义 (db/schema.ts)

使用 Drizzle ORM 定义表结构，包含 agents、tasks、messages、agent_tokens 四张表。

#### 2.2.2 连接初始化 (db/index.ts)

```typescript
interface Database {
  select<T>(table: string): QueryBuilder<T>;
  insert<T>(table: string, data: T): void;
  update<T>(table: string, id: string, data: Partial<T>): void;
  delete(table: string, id: string): void;
}

export function initDatabase(config: Config): Database;
```

#### 2.2.3 迁移脚本 (db/migrate.ts)

执行 Drizzle 迁移，创建表和索引。

### 2.3 鉴权模块

#### 2.3.1 JWT 签发与验证 (auth/jwt.ts)

```typescript
interface JWTPayload {
  agentId: string;
  name: string;
  iat: number;
  exp: number;
}

export function signToken(payload: JWTPayload, secret: string): string;
export function verifyToken(token: string, secret: string): JWTPayload;
```

#### 2.3.2 鉴权中间件 (auth/middleware.ts)

Fastify 中间件，验证 HTTP 请求和 WebSocket 连接的 Token。

### 2.4 路由模块

#### 2.4.1 Agent 路由 (routes/agents.ts)

- POST /api/v1/agents - 注册
- GET /api/v1/agents - 列表
- GET /api/v1/agents/:id - 详情
- PATCH /api/v1/agents/:id - 更新
- DELETE /api/v1/agents/:id - 注销

#### 2.4.2 任务路由 (routes/tasks.ts)

- POST /api/v1/tasks - 创建
- GET /api/v1/tasks - 列表
- GET /api/v1/tasks/:id - 详情
- PATCH /api/v1/tasks/:id - 更新状态
- POST /api/v1/tasks/:id/cancel - 取消

#### 2.4.3 消息路由 (routes/messages.ts)

- GET /api/v1/messages - 历史查询

#### 2.4.4 状态路由 (routes/state.ts)

- GET /api/v1/state/:key - 读取
- PUT /api/v1/state/:key - 写入
- DELETE /api/v1/state/:key - 删除
- GET /api/v1/state - 列出所有 key

### 2.5 WebSocket 模块

#### 2.5.1 服务初始化 (ws/server.ts)

```typescript
interface WSServer {
  on(event: 'connection', handler: (socket: WebSocket, req: IncomingMessage) => void): void;
  close(): Promise<void>;
}

export function createWSServer(port: number): WSServer;
```

#### 2.5.2 消息处理 (ws/handler.ts)

处理各类 WS 消息：heartbeat、send、task_update、broadcast、subscribe、unsubscribe。

#### 2.5.3 连接管理 (ws/connection.ts)

```typescript
interface Connection {
  agentId: string;
  socket: WebSocket;
  lastHeartbeat: number;
  subscriptions: Set<string>;
}

// 管理所有连接：Map<agentId, Connection>
export class ConnectionManager {
  add(agentId: string, socket: WebSocket): void;
  remove(agentId: string): void;
  get(agentId: string): Connection | undefined;
  broadcast(message: any): void;
  checkHeartbeats(timeout: number): void;
}
```

#### 2.5.4 协议定义 (ws/protocol.ts)

定义 WS 消息的 JSON Schema，用于校验。

---

## 3. 数据库设计

### 3.1 ER 关系图

```
agents 1 ──── N tasks (assigned_to)
agents 1 ──── N messages (from_agent / to_agent)
agents 1 ──── N agent_capabilities
tasks  1 ──── N messages (task_id)
```

### 3.2 表结构

#### agents — Agent 注册表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL UNIQUE | Agent 名称 |
| token_hash | TEXT | NOT NULL | JWT token 的 SHA-256 哈希 |
| status | TEXT | NOT NULL DEFAULT 'offline' | online / offline / busy |
| capabilities | TEXT | DEFAULT '[]' | JSON 数组：能力标签 |
| metadata | TEXT | DEFAULT '{}' | JSON 对象：元数据 |
| last_seen | INTEGER | | 最后活跃时间戳 (unix ms) |
| created_at | INTEGER | NOT NULL | 创建时间 |
| updated_at | INTEGER | NOT NULL | 更新时间 |

#### tasks — 任务表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| title | TEXT | NOT NULL | 任务标题 |
| description | TEXT | DEFAULT '' | 任务描述 |
| status | TEXT | NOT NULL DEFAULT 'pending' | pending / assigned / running / completed / failed / cancelled |
| priority | INTEGER | DEFAULT 0 | 0=低 1=中 2=高 3=紧急 |
| created_by | TEXT | NOT NULL | 创建者 agent_id |
| assigned_to | TEXT | | 执行者 agent_id |
| payload | TEXT | DEFAULT '{}' | JSON：任务参数 |
| result | TEXT | | JSON：执行结果 |
| error | TEXT | | 错误信息 |
| timeout_ms | INTEGER | DEFAULT 300000 | 超时时间（默认 5 分钟） |
| created_at | INTEGER | NOT NULL | 创建时间 |
| updated_at | INTEGER | NOT NULL | 更新时间 |
| started_at | INTEGER | | 开始执行时间 |
| completed_at | INTEGER | | 完成时间 |

#### messages — 消息表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| from_agent | TEXT | NOT NULL | 发送者 agent_id |
| to_agent | TEXT | | 接收者 agent_id（null = 广播） |
| task_id | TEXT | | 关联任务 |
| channel | TEXT | NOT NULL DEFAULT 'direct' | direct / task / broadcast / system |
| type | TEXT | NOT NULL DEFAULT 'text' | text / file / data / action |
| content | TEXT | NOT NULL | 消息内容（JSON 字符串） |
| created_at | INTEGER | NOT NULL | 创建时间 |

#### agent_tokens — 鉴权令牌表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL REFERENCES agents(id) | Agent ID |
| token | TEXT | NOT NULL | JWT 原文（用于吊销检查） |
| name | TEXT | DEFAULT '' | 令牌名称 |
| expires_at | INTEGER | | 过期时间 |
| revoked | INTEGER | DEFAULT 0 | 是否已吊销 |
| created_at | INTEGER | NOT NULL | 创建时间 |

### 3.3 索引设计

```sql
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_messages_from ON messages(from_agent);
CREATE INDEX idx_messages_to ON messages(to_agent);
CREATE INDEX idx_messages_task ON messages(task_id);
CREATE INDEX idx_messages_channel ON messages(channel);
CREATE INDEX idx_messages_created ON messages(created_at);
```

### 3.4 Drizzle Schema 示例

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  tokenHash: text('token_hash').notNull(),
  status: text('status').notNull().default('offline'),
  capabilities: text('capabilities').default('[]'),
  metadata: text('metadata').default('{}'),
  lastSeen: integer('last_seen'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ... 其他表类似定义
```

---

## 4. API 设计

### 4.1 通用约定

- **基础路径**: `/api/v1`
- **认证**: `Authorization: Bearer <jwt_token>`
- **内容类型**: `application/json`
- **时间戳**: Unix 毫秒
- **ID 格式**: UUID v4

### 4.2 响应格式

**成功响应**:
```json
{
  "ok": true,
  "data": { ... },
  "error": null
}
```

**错误响应**:
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent with id xxx not found"
  }
}
```

### 4.3 详细接口定义

详见需求文档 5.1 节。

---

## 5. WebSocket 协议

### 5.1 连接建立

```
WSS 连接地址：wss://{host}/ws?token={jwt_token}
```

连接时通过 query 参数传递 JWT token。服务端验证后建立连接。

### 5.2 消息格式

所有 WS 消息为 JSON，顶层结构：

```json
{
  "type": "message_type",
  "id": "msg-uuid",
  "timestamp": 1716000000000,
  "payload": { ... }
}
```

### 5.3 消息类型定义

#### 客户端 → 服务端

| type | 说明 | payload |
|------|------|---------|
| `heartbeat` | 心跳 | `{}` |
| `send` | 发送消息 | `{ to, channel, type, content }` |
| `task_update` | 更新任务状态 | `{ taskId, status, result?, error? }` |
| `broadcast` | 广播消息 | `{ channel, type, content }` |
| `subscribe` | 订阅频道 | `{ channel }` |
| `unsubscribe` | 取消订阅 | `{ channel }` |

#### 服务端 → 客户端

| type | 说明 | payload |
|------|------|---------|
| `heartbeat_ack` | 心跳确认 | `{ serverTime }` |
| `message` | 收到消息 | `{ from, channel, type, content, id, timestamp }` |
| `task_assigned` | 被分配任务 | `{ task }` |
| `task_cancelled` | 任务被取消 | `{ taskId }` |
| `agent_online` | Agent 上线 | `{ agentId, name }` |
| `agent_offline` | Agent 离线 | `{ agentId, name }` |
| `state_changed` | 共享状态变更 | `{ key, value, updatedBy }` |
| `error` | 错误 | `{ code, message }` |

### 5.4 心跳机制

- **客户端**: 每 30 秒发送 `heartbeat`
- **服务端**: 返回 `heartbeat_ack`，包含 `{ serverTime }`
- **超时检测**: 90 秒未收到心跳，标记为 offline 并通知其他 Agent
- **重连策略**: 指数退避 1s → 2s → 4s → 8s → 16s → 30s（最大）

### 5.5 连接管理实现

```typescript
class ConnectionManager {
  private connections: Map<string, Connection> = new Map();

  add(agentId: string, socket: WebSocket): Connection {
    const conn: Connection = {
      agentId,
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

  broadcast(message: any, excludeAgentId?: string): void {
    const msg = JSON.stringify(message);
    for (const [agentId, conn] of this.connections) {
      if (excludeAgentId && agentId === excludeAgentId) continue;
      if (conn.socket.readyState === WebSocket.OPEN) {
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
        conn.socket.terminate();
        this.connections.delete(agentId);
      }
    }
    return offline;
  }
}
```

---

## 6. 鉴权设计

### 6.1 注册流程

```
1. Agent 调用 POST /api/v1/agents 注册
2. 服务端生成 JWT（payload: { agentId, name, iat, exp }）
3. Token 返回给 Agent（仅此一次）
4. Agent 保存 token，后续所有请求携带
5. 服务端存储 token 的 SHA-256 哈希到 agent_tokens 表
```

### 6.2 JWT 配置

```typescript
const jwtConfig = {
  algorithm: 'HS256',        // 生产环境推荐 RS256
  expiresIn: '365d',        // 长期有效
  issuer: 'agent-hub',
};
```

### 6.3 Token 吊销

```
DELETE /api/v1/agents/:id/tokens/:tokenId
```

吊销流程：
1. 在 agent_tokens 表中标记 `revoked = 1`
2. 后续请求验证时检查 revoked 字段
3. 已吊销的 token 拒绝所有请求

### 6.4 验证流程

```typescript
async function verifyRequest(token: string): Promise<JWTPayload> {
  // 1. JWT 签名验证
  const payload = jwt.verify(token, secret);
  
  // 2. 检查是否吊销
  const tokenRecord = await db.select('agent_tokens', { token });
  if (tokenRecord?.revoked) {
    throw new Error('Token revoked');
  }
  
  return payload;
}
```

---

## 7. Agent SDK 设计

### 7.1 包结构

```
sdk/
├── src/
│   ├── index.ts          # 导出 AgentClient
│   ├── client.ts         # 核心类实现
│   ├── events.ts         # 事件定义
│   └── types.ts          # 类型定义
├── package.json
└── tsconfig.json
```

### 7.2 核心类

```typescript
class AgentClient extends EventEmitter {
  private config: AgentConfig;
  private ws: WebSocket | null;
  private reconnectTimer: NodeJS.Timeout | null;
  private heartbeatTimer: NodeJS.Timeout | null;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.ws = null;
  }

  async connect(): Promise<void>;
  async disconnect(): Promise<void>;
  
  send(to: string, message: MessagePayload): Promise<void>;
  broadcast(channel: string, message: MessagePayload): Promise<void>;
  
  completeTask(taskId: string, result: any): Promise<void>;
  failTask(taskId: string, error: string): Promise<void>;
  
  getState(key: string): Promise<any>;
  setState(key: string, value: any): Promise<void>;
  
  listAgents(): Promise<Agent[]>;
  listTasks(filters?: TaskFilters): Promise<Task[]>;
  
  // 事件
  on(event: 'connected', handler: () => void): this;
  on(event: 'disconnected', handler: (reason: string) => void): this;
  on(event: 'task:assigned', handler: (task: Task) => void): this;
  on(event: 'task:cancelled', handler: (taskId: string) => void): this;
  on(event: 'message', handler: (msg: Message) => void): this;
  on(event: 'agent:online', handler: (agent: Agent) => void): this;
  on(event: 'agent:offline', handler: (agentId: string) => void): this;
  on(event: 'state:changed', handler: (change: StateChange) => void): this;
  on(event: 'error', handler: (err: Error) => void): this;
}
```

### 7.3 自动重连逻辑

```typescript
private reconnect(): void {
  const delays = [1000, 2000, 4000, 8000, 16000, 30000];
  let attempt = 0;

  const tryConnect = async () => {
    try {
      await this.connect();
      attempt = 0; // 重置
    } catch (err) {
      const delay = delays[Math.min(attempt, delays.length - 1)];
      attempt++;
      this.reconnectTimer = setTimeout(tryConnect, delay);
    }
  };

  tryConnect();
}
```

### 7.4 使用示例

```typescript
import { AgentClient } from '@agent-hub/sdk';

const client = new AgentClient({
  server: 'wss://hub.example.com',
  token: 'your-jwt-token',
  name: 'my-code-reviewer',
  reconnect: true,
  heartbeatInterval: 30000,
});

await client.connect();

client.on('task:assigned', async (task) => {
  const result = await reviewCode(task.payload);
  await client.completeTask(task.id, result);
});

client.on('message', (msg) => {
  console.log(`收到来自 ${msg.from} 的消息:`, msg.content);
});
```

---

## 8. 部署方案

### 8.1 环境配置

**.env.example**:
```bash
# 服务端口
PORT=3000

# JWT 密钥（至少 32 字符）
JWT_SECRET=change-me-to-a-random-secret

# JWT 过期时间
JWT_EXPIRES_IN=365d

# 数据库路径
DB_PATH=./data/hub.db

# 心跳超时（毫秒）
HEARTBEAT_TIMEOUT=90000

# 日志级别
LOG_LEVEL=info
```

### 8.2 PM2 配置

**ecosystem.config.js**:
```javascript
module.exports = {
  apps: [{
    name: 'agent-hub',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '500M',
    restart_delay: 4000,
    max_restarts: 10,
  }],
};
```

### 8.3 启动流程

```bash
# 1. 安装依赖
npm install

# 2. 执行数据库迁移
npm run db:migrate

# 3. 构建
npm run build

# 4. 启动
pm2 start ecosystem.config.js

# 5. 设置开机自启
pm2 startup
pm2 save
```

### 8.4 HTTPS/WSS 配置

使用反向代理（如 Nginx 或 Caddy）处理 TLS 终止：

**Nginx 示例**:
```nginx
server {
  listen 443 ssl;
  server_name hub.example.com;

  ssl_certificate /etc/ssl/certs/hub.crt;
  ssl_certificate_key /etc/ssl/private/hub.key;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

---

## 9. 测试策略

### 9.1 单元测试

- 核心工具函数（JWT、日志、错误处理）
- 数据库操作（CRUD）
- 消息路由逻辑

### 9.2 集成测试

- HTTP API 端点测试
- WebSocket 连接和消息传递
- 鉴权流程测试

### 9.3 端到端测试

- 完整任务流程：创建 → 分配 → 执行 → 完成
- 多 Agent 通信场景
- 断线重连场景

---

## 10. 监控与日志

### 10.1 日志级别

- **debug**: 详细调试信息（开发环境）
- **info**: 关键操作（连接、任务分配）
- **warn**: 警告（心跳超时、重试）
- **error**: 错误（鉴权失败、数据库错误）

### 10.2 监控指标

- 在线 Agent 数量
- WebSocket 连接数
- 任务处理量（按状态）
- 消息吞吐量
- API 响应时间（P95）

---

## 附录 A：开发环境搭建

### A.1 前置要求

- Node.js 20+
- npm 或 pnpm
- Git

### A.2 本地开发

```bash
# 克隆项目
git clone <repo-url>
cd agent-hub

# 安装依赖
npm install

# 复制环境变量
cp .env.example .env

# 启动开发服务器（热重载）
npm run dev

# 执行数据库迁移
npm run db:migrate

# 运行测试
npm test
```

### A.3 代码规范

```bash
# 代码检查
npm run lint

# 格式化
npm run format
```

---

## 附录 B：变更日志

| 版本 | 日期 | 变更描述 |
|------|------|----------|
| 1.0.0 | 2026-05-18 | 初始版本 |
