# Agent Hub 设计文档

> 中心化 Agent 协作平台 — 让任意机器上的 Agent 轻松加入、实时通信、协同工作

---

## 1. 项目概述

### 1.1 定位

Agent Hub 是一个轻量级的 Agent 协作中枢服务器，提供：

- Agent 注册与在线状态管理
- 双向实时通信（WebSocket）
- 任务分发与结果回收
- 共享数据存储
- 消息历史持久化

### 1.2 技术栈

| 组件 | 选型 | 版本 | 理由 |
|------|------|------|------|
| 运行时 | Node.js | 20+ LTS | 生态成熟 |
| HTTP 框架 | Fastify | 5.x | 高性能，schema 校验内置 |
| WebSocket | ws | 8.x | 轻量、无额外依赖 |
| 数据库 | SQLite | 3.x | 零运维，单文件部署 |
| DB 驱动 | better-sqlite3 | 11.x | 同步 API，性能极佳 |
| ORM | Drizzle ORM | 0.30+ | 类型安全，迁移方便 |
| 鉴权 | jose (JWT) | 5.x | 标准 JWT，Ed25519/RS256 |
| 进程管理 | PM2 | 5.x | 自动重启、日志 |
| 构建 | tsx | 4.x | 开发热重载 |

### 1.3 规模预期

- 同时在线 Agent：2-10 个
- 部署方式：单机部署，后期可扩展
- 数据库：SQLite 文件，后期可迁移到 PostgreSQL

---

## 2. 系统架构

### 2.1 架构图

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

### 2.2 模块划分

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

## 3. 数据库设计

### 3.1 ER 关系

```
agents 1 ──── N tasks (assigned_to)
agents 1 ──── N messages (from_agent / to_agent)
agents 1 ──── N agent_capabilities
tasks  1 ──── N messages (task_id)
```

### 3.2 表结构

#### agents — Agent 注册表

```sql
CREATE TABLE agents (
  id          TEXT PRIMARY KEY,           -- UUID
  name        TEXT NOT NULL UNIQUE,       -- Agent 名称，唯一
  token_hash  TEXT NOT NULL,              -- JWT token 的 SHA-256 哈希
  status      TEXT NOT NULL DEFAULT 'offline',  -- online / offline / busy
  capabilities TEXT DEFAULT '[]',         -- JSON 数组：能力标签
  metadata    TEXT DEFAULT '{}',          -- JSON 对象：自定义元数据
  last_seen   INTEGER,                   -- 最后活跃时间戳 (unix ms)
  created_at  INTEGER NOT NULL,          -- 创建时间
  updated_at  INTEGER NOT NULL           -- 更新时间
);
```

#### tasks — 任务表

```sql
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,           -- UUID
  title       TEXT NOT NULL,             -- 任务标题
  description TEXT DEFAULT '',           -- 任务描述
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending / assigned / running / completed / failed / cancelled
  priority    INTEGER DEFAULT 0,         -- 优先级：0=低 1=中 2=高 3=紧急
  created_by  TEXT NOT NULL,             -- 创建者 agent_id
  assigned_to TEXT,                      -- 执行者 agent_id（可空）
  payload     TEXT DEFAULT '{}',         -- JSON：任务参数
  result      TEXT,                      -- JSON：执行结果
  error       TEXT,                      -- 错误信息
  timeout_ms  INTEGER DEFAULT 300000,    -- 超时时间（默认 5 分钟）
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  started_at  INTEGER,                  -- 开始执行时间
  completed_at INTEGER                  -- 完成时间
);
```

#### messages — 消息表

```sql
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,           -- UUID
  from_agent  TEXT NOT NULL,             -- 发送者 agent_id
  to_agent    TEXT,                      -- 接收者 agent_id（null = 广播）
  task_id     TEXT,                      -- 关联任务（可空）
  channel     TEXT NOT NULL DEFAULT 'direct',  -- direct / task / broadcast / system
  type        TEXT NOT NULL DEFAULT 'text',    -- text / file / data / action
  content     TEXT NOT NULL,             -- 消息内容（JSON 字符串）
  created_at  INTEGER NOT NULL
);
```

#### agent_tokens — 鉴权令牌表

```sql
CREATE TABLE agent_tokens (
  id          TEXT PRIMARY KEY,           -- UUID
  agent_id    TEXT NOT NULL REFERENCES agents(id),
  token       TEXT NOT NULL,             -- JWT 原文（用于吊销检查）
  name        TEXT DEFAULT '',           -- 令牌名称（如 "laptop" / "server-1"）
  expires_at  INTEGER,                  -- 过期时间（null = 永不过期）
  revoked     INTEGER DEFAULT 0,        -- 是否已吊销
  created_at  INTEGER NOT NULL
);
```

### 3.3 索引

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

---

## 4. API 设计

### 4.1 通用约定

- 基础路径：`/api/v1`
- 认证：`Authorization: Bearer <jwt_token>`
- 内容类型：`application/json`
- 时间戳：Unix 毫秒
- ID 格式：UUID v4

#### 响应格式

```json
{
  "ok": true,
  "data": { ... },
  "error": null
}
```

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

### 4.2 Agent 管理

#### POST /api/v1/agents — 注册新 Agent

```
Request:
{
  "name": "code-reviewer",
  "capabilities": ["code-review", "security"],
  "metadata": { "version": "1.0", "os": "darwin" }
}

Response 201:
{
  "ok": true,
  "data": {
    "id": "uuid",
    "name": "code-reviewer",
    "token": "eyJhbGci...",       // 仅此处返回，后续需自行保存
    "capabilities": ["code-review", "security"],
    "status": "offline",
    "createdAt": 1716000000000
  }
}
```

#### GET /api/v1/agents — 获取所有 Agent 列表

```
Response 200:
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "name": "code-reviewer",
      "status": "online",
      "capabilities": ["code-review"],
      "lastSeen": 1716000000000
    }
  ]
}
```

#### GET /api/v1/agents/:id — 获取单个 Agent

#### PATCH /api/v1/agents/:id — 更新 Agent 信息

```
Request:
{
  "capabilities": ["code-review", "security", "testing"],
  "metadata": { "version": "1.1" }
}
```

#### DELETE /api/v1/agents/:id — 注销 Agent

### 4.3 任务管理

#### POST /api/v1/tasks — 创建任务

```
Request:
{
  "title": "Review PR #42",
  "description": "Review the auth module changes",
  "priority": 2,
  "assignedTo": "agent-uuid",      // 可空，不指定则进入任务池
  "payload": {
    "repo": "https://github.com/org/repo",
    "pr": 42
  },
  "timeoutMs": 600000
}

Response 201:
{
  "ok": true,
  "data": {
    "id": "task-uuid",
    "title": "Review PR #42",
    "status": "pending",
    "createdAt": 1716000000000
  }
}
```

#### GET /api/v1/tasks — 查询任务列表

```
Query Params:
  status=pending          # 按状态过滤
  assignedTo=agent-uuid   # 按执行者过滤
  limit=20                # 分页
  offset=0
```

#### GET /api/v1/tasks/:id — 获取任务详情

#### PATCH /api/v1/tasks/:id — 更新任务状态

```
// Agent 接受任务
{ "status": "running" }

// Agent 完成任务
{
  "status": "completed",
  "result": { "score": 95, "issues": [] }
}

// Agent 报告失败
{
  "status": "failed",
  "error": "Timeout connecting to repo"
}
```

#### POST /api/v1/tasks/:id/cancel — 取消任务

### 4.4 消息历史

#### GET /api/v1/messages — 获取消息历史

```
Query Params:
  from=agent-uuid         # 发送者
  to=agent-uuid           # 接收者
  taskId=task-uuid        # 关联任务
  channel=direct          # 通道类型
  limit=50
  offset=0
  since=1716000000000     # 起始时间戳
```

### 4.5 共享状态

#### GET /api/v1/state/:key — 读取共享状态

```
Response 200:
{
  "ok": true,
  "data": {
    "key": "current-sprint",
    "value": { "name": "Sprint 42", "goal": "Ship auth" },
    "updatedAt": 1716000000000,
    "updatedBy": "agent-uuid"
  }
}
```

#### PUT /api/v1/state/:key — 写入共享状态

```
Request:
{
  "value": { "name": "Sprint 42", "goal": "Ship auth" }
}
```

#### DELETE /api/v1/state/:key — 删除共享状态

#### GET /api/v1/state — 列出所有共享状态键

---

## 5. WebSocket 协议

### 5.1 连接

```
WSS 连接地址: wss://{host}/ws?token={jwt_token}
```

连接时通过 query 参数传递 JWT token。服务端验证后建立连接。

### 5.2 消息格式

所有 WS 消息为 JSON，顶层结构：

```json
{
  "type": "message_type",
  "id": "msg-uuid",          // 消息唯一 ID（客户端生成）
  "timestamp": 1716000000000,
  "payload": { ... }
}
```

### 5.3 消息类型

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

- 客户端每 **30 秒** 发送 `heartbeat`
- 服务端返回 `heartbeat_ack`
- 服务端 **90 秒** 未收到心跳，标记 Agent 为 offline 并通知其他 Agent
- 断线后客户端自动重连，重连间隔：1s → 2s → 4s → 8s → 16s → 30s（最大）

### 5.5 连接管理

```typescript
interface Connection {
  agentId: string;
  socket: WebSocket;
  lastHeartbeat: number;
  subscriptions: Set<string>;  // 订阅的频道
}
```

服务端维护 `Map<string, Connection>` 映射 agentId → 连接。

---

## 6. 鉴权流程

### 6.1 注册获取 Token

```
1. Agent 调用 POST /api/v1/agents 注册
2. 服务端生成 JWT（payload: { agentId, name }）
3. Token 返回给 Agent（仅此一次）
4. Agent 保存 token，后续所有请求携带
```

### 6.2 JWT 配置

```typescript
{
  algorithm: 'HS256',        // 或 RS256（生产环境推荐）
  expiresIn: '365d',        // 长期有效，支持手动吊销
  issuer: 'agent-hub'
}
```

### 6.3 Token 吊销

```
DELETE /api/v1/agents/:id/tokens/:tokenId
```

吊销后该 token 无法通过 WS 认证和 HTTP 鉴权。

---

## 7. Agent SDK 设计

提供 npm 包 `@agent-hub/sdk`，让其他 Agent 一行代码接入。

### 7.1 安装

```bash
npm install @agent-hub/sdk
```

### 7.2 接入示例

```typescript
import { AgentClient } from '@agent-hub/sdk';

// 初始化（自动连接）
const client = new AgentClient({
  server: 'wss://hub.example.com',
  token: 'your-jwt-token',
  name: 'my-code-reviewer',
  reconnect: true,              // 自动重连
  heartbeatInterval: 30000,     // 心跳间隔
});

// 等待连接就绪
await client.connect();

// 监听任务
client.on('task:assigned', async (task) => {
  console.log(`收到任务: ${task.title}`);

  // 执行任务
  const result = await reviewCode(task.payload);

  // 上报结果
  await client.completeTask(task.id, result);
});

// 监听消息
client.on('message', async (msg) => {
  console.log(`收到来自 ${msg.from} 的消息:`, msg.content);
});

// 发送消息
await client.send('target-agent-id', {
  type: 'text',
  content: '任务已完成，请查看结果'
});

// 广播
await client.broadcast('general', {
  type: 'text',
  content: '我是新上线的 Agent，负责代码审查'
});

// 读写共享状态
await client.setState('review-config', { maxIssues: 10 });
const config = await client.getState('review-config');

// 主动查询
const agents = await client.listAgents();
const tasks = await client.listTasks({ status: 'pending' });
```

### 7.3 SDK 核心类

```typescript
class AgentClient extends EventEmitter {
  constructor(config: AgentConfig);
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // 消息
  send(to: string, message: MessagePayload): Promise<void>;
  broadcast(channel: string, message: MessagePayload): Promise<void>;

  // 任务
  completeTask(taskId: string, result: any): Promise<void>;
  failTask(taskId: string, error: string): Promise<void>;

  // 共享状态
  getState(key: string): Promise<any>;
  setState(key: string, value: any): Promise<void>;

  // 查询
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

interface AgentConfig {
  server: string;            // WSS 地址
  token: string;             // JWT token
  name?: string;             // Agent 名称（仅注册时需要）
  capabilities?: string[];   // 能力标签
  reconnect?: boolean;       // 自动重连
  heartbeatInterval?: number; // 心跳间隔 ms
}
```

---

## 8. 开发任务清单

### Phase 1：基础骨架（优先）

- [ ] 项目初始化（package.json, tsconfig, 快速开发脚本）
- [ ] Drizzle schema 定义 + 数据库迁移
- [ ] Fastify 服务启动 + 路由注册
- [ ] JWT 签发与验证模块
- [ ] Agent 注册 API（POST /api/v1/agents）
- [ ] Agent 列表/详情 API

### Phase 2：WebSocket 核心

- [ ] WebSocket 服务初始化（基于 ws）
- [ ] WS 连接鉴权（JWT 校验）
- [ ] 心跳机制（ping/pong + 超时检测）
- [ ] 消息路由（点对点 + 广播）
- [ ] 连接管理（Agent 上下线通知）

### Phase 3：任务系统

- [ ] 任务 CRUD API
- [ ] 任务状态机（pending → assigned → running → completed/failed）
- [ ] WS 推送任务分配事件
- [ ] 任务超时处理

### Phase 4：数据层

- [ ] 消息持久化 + 历史查询 API
- [ ] 共享状态 CRUD API
- [ ] 共享状态变更 WS 广播

### Phase 5：Agent SDK

- [ ] 创建 `@agent-hub/sdk` 包结构
- [ ] AgentClient 核心类实现
- [ ] 事件系统
- [ ] 自动重连逻辑
- [ ] 使用文档 + 接入示例

### Phase 6：生产化

- [ ] HTTPS + WSS（TLS 证书）
- [ ] PM2 配置
- [ ] 日志系统（structured logging）
- [ ] 环境变量配置
- [ ] .env.example + README

---

## 9. 环境配置

### .env.example

```bash
# 服务端口
PORT=3000

# JWT 密钥（至少 32 字符，生产环境用随机生成值）
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

---

## 10. 开发约定

### 10.1 代码规范

- TypeScript strict 模式
- ESLint + Prettier
- 函数 < 50 行，文件 < 800 行
- 错误显式处理，不吞错误

### 10.2 Git 规范

- 分支：`main` (生产) / `develop` (开发) / `feature/*`
- 提交格式：`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

### 10.3 测试要求

- 核心模块单元测试
- API 集成测试
- WS 连接测试

---

## 11. 后期扩展方向（不在本期范围）

- [ ] Agent 能力匹配：自动将任务分配给最合适的 Agent
- [ ] 任务队列：优先级队列 + Worker 模式
- [ ] 文件传输：大文件分片上传
- [ ] 多服务器集群：Redis pub/sub 做跨实例消息
- [ ] Web 管理面板：可视化查看 Agent 状态和任务
- [ ] Webhook 回调：任务完成时通知外部系统
