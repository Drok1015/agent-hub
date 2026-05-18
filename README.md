# Agent Hub

> 中心化 Agent 协作平台 — 让任意机器上的 Agent 轻松加入、实时通信、协同工作

## 特性

- ✅ Agent 注册与在线状态管理
- ✅ 双向实时通信（WebSocket）
- ✅ 任务分发与结果回收
- ✅ 共享数据存储
- ✅ 消息历史持久化
- ✅ 自动重连与心跳检测
- ✅ JWT 鉴权与安全通信

## 技术栈

| 组件 | 选型 | 版本 |
|------|------|------|
| 运行时 | Node.js | 20+ LTS |
| HTTP 框架 | Fastify | 5.x |
| WebSocket | ws | 8.x |
| 数据库 | SQLite | 3.x |
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

## Agent SDK

### 安装

```bash
npm install @agent-hub/sdk
```

### 使用示例

```typescript
import { AgentClient } from '@agent-hub/sdk';

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
│   ├── index.ts              # 入口文件
│   ├── config.ts             # 配置管理
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema
│   │   ├── migrate.ts        # 数据库迁移
│   │   └── index.ts          # DB 连接
│   ├── auth/
│   │   ├── jwt.ts            # JWT 签发与验证
│   │   └── middleware.ts     # 鉴权中间件
│   ├── routes/
│   │   ├── agents.ts         # Agent 路由
│   │   ├── tasks.ts          # 任务路由
│   │   └── messages.ts       # 消息和状态路由
│   ├── ws/
│   │   ├── handler.ts        # WebSocket 消息处理
│   │   ├── connection.ts     # 连接管理
│   │   └── protocol.ts       # 协议定义
│   └── utils/
│       ├── logger.ts         # 日志工具
│       └── errors.ts         # 错误码定义
├── sdk/                      # Agent SDK
│   ├── src/
│   │   ├── client.ts         # AgentClient 核心类
│   │   ├── types.ts          # 类型定义
│   │   └── index.ts          # 导出
│   └── package.json
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
