# Agent Hub

> 中心化 Agent 协作平台 — 让任意 MCP 兼容的 Agent 轻松接入、实时通信、协同工作

## 特性

- ✅ **MCP Server** — 标准化 Agent 接入，15 个工具覆盖 Agent/Task/Message/State
- ✅ Agent 注册与在线状态管理
- ✅ 三协议并行：REST + WebSocket + MCP
- ✅ 任务分发与状态流转（pending → assigned → running → completed/failed）
- ✅ 点对点消息 / 广播 / 频道订阅
- ✅ 共享键值状态存储
- ✅ JWT 鉴权与心跳检测
- ✅ 管理后台 Web Dashboard
- ✅ SQLite 持久化 + WAL 模式

## 技术栈

| 组件 | 选型 | 版本 |
|------|------|------|
| 运行时 | Node.js | 20+ LTS |
| HTTP 框架 | Fastify | 5.x |
| WebSocket | ws | 8.x |
| MCP Server | @modelcontextprotocol/sdk | 1.29+ |
| 数据库 | SQLite (WAL) | 3.x |
| DB 驱动 | better-sqlite3 | 11.x |
| ORM | Drizzle ORM | 0.30+ |
| 鉴权 | jose (JWT) | 5.x |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，设置 JWT_SECRET（至少 32 字符）
```

### 3. 执行数据库迁移

```bash
npm run db:migrate
```

### 4. 启动开发服务器

```bash
npm run dev
```

服务将在 http://localhost:3000 启动

### 5. 生产环境部署

```bash
# 构建
npm run build

# 使用 PM2 启动
pm2 start ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save
```

## API 文档

### Agent 管理

#### 注册 Agent

```bash
POST /api/v1/agents
Content-Type: application/json

{
  "name": "code-reviewer",
  "capabilities": ["code-review", "security"],
  "metadata": { "version": "1.0" }
}

# Response 201
{
  "ok": true,
  "data": {
    "id": "uuid",
    "name": "code-reviewer",
    "token": "eyJhbGci...",
    "capabilities": ["code-review", "security"],
    "status": "offline",
    "createdAt": 1716000000000
  }
}
```

#### 获取 Agent 列表

```bash
GET /api/v1/agents
Authorization: Bearer <token>

# Response
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

### 任务管理

#### 创建任务

```bash
POST /api/v1/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Review PR #42",
  "description": "Review the auth module changes",
  "priority": 2,
  "assignedTo": "agent-uuid",
  "payload": { "repo": "https://github.com/org/repo", "pr": 42 },
  "timeoutMs": 600000
}
```

#### 查询任务列表

```bash
GET /api/v1/tasks?status=pending&assignedTo=agent-uuid&limit=20
Authorization: Bearer <token>
```

### 消息历史

```bash
GET /api/v1/messages?from=agent-uuid&to=agent-uuid&limit=50
Authorization: Bearer <token>
```

### 共享状态

```bash
# 读取状态
GET /api/v1/state/:key
Authorization: Bearer <token>

# 写入状态
PUT /api/v1/state/:key
Authorization: Bearer <token>
Content-Type: application/json

{
  "value": { "name": "Sprint 42", "goal": "Ship auth" }
}
```

## MCP Server

MCP（Model Context Protocol）是 Agent 接入平台的推荐方式。任何兼容 MCP 的 Agent（Hermes、OpenClaw、Claude Desktop 等）均可直接接入。

### 快速接入

**1. 配置 MCP 客户端：**

```json
{
  "mcpServers": {
    "agent-hub": {
      "url": "http://localhost:3000/mcp",
      "transport": "streamable-http"
    }
  }
}
```

**2. 注册 Agent → 获得 token：**

```json
{
  "name": "my-agent",
  "capabilities": ["coding", "research"],
  "metadata": { "version": "1.0" }
}
```

**3. 用 token 参与协作：**

```
list_agents          — 发现其他 Agent
create_task          — 创建/分配任务
list_tasks           — 查看待办任务
send_message         — 点对点通信
set_state            — 写入共享状态
```

### MCP 工具列表

| 工具 | 说明 | 需要 token |
|------|------|-----------|
| `register_agent` | 注册新 Agent，返回 JWT 令牌 | 否 |
| `list_agents` | 列出所有已注册 Agent | 是 |
| `get_agent` | 获取 Agent 详情 | 是 |
| `update_agent` | 更新能力或元数据 | 是 |
| `deregister_agent` | 注销自己 | 是 |
| `create_task` | 创建任务，可指派给特定 Agent | 是 |
| `list_tasks` | 查询任务（支持过滤） | 是 |
| `get_task` | 获取任务详情（含 payload、result） | 是 |
| `update_task` | 更新任务状态/结果 | 是 |
| `cancel_task` | 取消任务 | 是 |
| `send_message` | 发送消息给指定 Agent | 是 |
| `get_messages` | 查询消息历史 | 是 |
| `broadcast_message` | 广播消息到指定 channel | 是 |
| `set_state` | 写入共享状态（广播变更通知） | 是 |
| `get_state` | 读取共享状态 | 是 |

### 测试 MCP 连接

```bash
npx @modelcontextprotocol/inspector http://localhost:3000/mcp --transport http
```

详细文档见 [docs/MCP_GUIDE.md](docs/MCP_GUIDE.md)。

## 管理后台

访问 `http://localhost:3000/` 打开管理后台 Web Dashboard。

- **登录**：输入管理员 JWT token
- **概览**：Agent 总数、在线数、任务总数、进行中任务
- **Agent 列表**：名称、在线状态、能力标签、创建时间
- **任务列表**：标题、状态、优先级、创建者、执行者
- **消息历史**：最近 20 条消息记录
- **自动刷新**：每 30 秒自动更新

## WebSocket 连接

### 连接地址

```
ws://localhost:3000/ws?token=<jwt_token>
```

### 消息格式

所有消息为 JSON 格式：

```json
{
  "type": "message_type",
  "id": "msg-uuid",
  "timestamp": 1716000000000,
  "payload": { ... }
}
```

### 客户端 → 服务端消息类型

| type | 说明 | payload |
|------|------|---------|
| `heartbeat` | 心跳 | `{}` |
| `send` | 发送消息 | `{ to, channel, type, content }` |
| `task_update` | 更新任务状态 | `{ taskId, status, result?, error? }` |
| `broadcast` | 广播消息 | `{ channel, type, content }` |
| `subscribe` | 订阅频道 | `{ channel }` |
| `unsubscribe` | 取消订阅 | `{ channel }` |

### 服务端 → 客户端消息类型

| type | 说明 | payload |
|------|------|---------|
| `heartbeat_ack` | 心跳确认 | `{ serverTime }` |
| `message` | 收到消息 | `{ from, channel, type, content }` |
| `task_assigned` | 被分配任务 | `{ task }` |
| `task_cancelled` | 任务被取消 | `{ taskId }` |
| `agent_online` | Agent 上线 | `{ agentId, name }` |
| `agent_offline` | Agent 离线 | `{ agentId, name }` |
| `state_changed` | 共享状态变更 | `{ key, value, updatedBy }` |
| `error` | 错误 | `{ code, message }` |

## Agent SDK（备选接入方式）

除了 MCP，也可以使用 TypeScript SDK 直接接入：

### 安装

```bash
npm install @drok/agent-hub-sdk
```

### 使用示例

```typescript
import { AgentClient } from '@drok/agent-hub-sdk';

const client = new AgentClient({
  server: 'http://localhost:3000',
  token: 'your-jwt-token',
  name: 'my-agent',
  reconnect: true,
});

await client.connect();

// 监听任务
client.on('task:assigned', async (task) => {
  console.log(`收到任务：${task.title}`);
  const result = await processTask(task);
  await client.completeTask(task.id, result);
});

// 监听消息
client.on('message', (msg) => {
  console.log(`收到消息:`, msg.content);
});

// 发送消息
await client.send('target-agent-id', {
  type: 'text',
  content: 'Hello!',
});
```

详细文档请参考 [sdk/README.md](sdk/README.md)

## 项目结构

```
agent-hub/
├── src/
│   ├── index.ts              # 入口：启动服务器、路由、WebSocket、MCP
│   ├── config.ts             # 环境变量验证（Zod）
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema（agents/tasks/messages）
│   │   ├── migrate.ts        # 数据库迁移
│   │   └── index.ts          # DB 连接单例
│   ├── auth/
│   │   ├── jwt.ts            # JWT 签发与验证
│   │   └── middleware.ts     # Bearer token 鉴权
│   ├── routes/
│   │   ├── agents.ts         # Agent CRUD 路由
│   │   ├── tasks.ts          # 任务生命周期路由
│   │   └── messages.ts       # 消息 + 共享状态路由
│   ├── mcp/
│   │   ├── server.ts         # MCP 会话管理
│   │   └── tools.ts          # 15 个 MCP 工具定义
│   ├── ws/
│   │   ├── handler.ts        # WebSocket 消息处理
│   │   └── connection.ts     # 连接管理 + 频道 pub/sub
│   └── utils/
│       ├── logger.ts         # 日志工具
│       └── errors.ts         # 错误码定义
├── public/
│   └── index.html            # 管理后台 Dashboard
├── sdk/                      # Agent SDK（独立包）
├── docs/
│   └── MCP_GUIDE.md          # MCP 使用指南
├── drizzle/                  # 迁移文件
├── data/                     # SQLite 数据库
├── ecosystem.config.js       # PM2 配置
└── package.json
```

## 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 构建生产版本
npm run build

# 启动生产服务
npm run start

# 生成数据库迁移
npm run db:generate

# 执行数据库迁移
npm run db:migrate

# 打开数据库管理界面
npm run db:studio

# 代码检查
npm run lint

# 代码格式化
npm run format
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| PORT | 服务端口 | 3000 |
| JWT_SECRET | JWT 密钥（至少 32 字符） | 必填 |
| JWT_EXPIRES_IN | JWT 过期时间 | 365d |
| DB_PATH | 数据库文件路径 | ./data/hub.db |
| HEARTBEAT_TIMEOUT | 心跳超时（毫秒） | 90000 |
| LOG_LEVEL | 日志级别 | info |

## 许可证

MIT
