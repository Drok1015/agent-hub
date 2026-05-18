# Agent Hub 需求文档

> 版本号：1.0.0  
> 创建日期：2026-05-18  
> 最后更新：2026-05-18

---

## 1. 项目概述

### 1.1 产品定位

Agent Hub 是一个轻量级的 Agent 协作中枢服务器，为分布式 Agent 系统提供中心化通信与协作能力。

### 1.2 目标用户

- 需要在多台机器上部署 Agent 的开发团队
- 需要实现 Agent 间实时通信的自动化系统
- 需要任务分发与结果回收的协作场景

### 1.3 核心价值

- **轻松接入**：Agent 通过 SDK 一行代码接入
- **实时通信**：WebSocket 双向通信，延迟 < 100ms
- **任务协作**：支持任务分发、状态跟踪、结果回收
- **零运维**：SQLite 单文件数据库，开箱即用

---

## 2. 功能需求

### 2.1 Agent 注册与认证

| ID | 需求描述 | 优先级 |
|----|----------|--------|
| FR-001 | 系统应允许 Agent 通过 HTTP API 注册，注册时系统应生成唯一的 Agent ID 和 JWT Token | P0 |
| FR-002 | 系统应要求 Agent 在所有 HTTP 请求中携带 JWT Token 进行身份验证 | P0 |
| FR-003 | 系统应要求 Agent 在 WebSocket 连接时通过 query 参数传递 JWT Token 进行身份验证 | P0 |
| FR-004 | 系统应支持管理员吊销指定 Agent 的 Token，吊销后该 Token 应立即失效 | P1 |
| FR-005 | 系统应支持 Agent 更新自身的能力标签（capabilities）和元数据（metadata） | P1 |
| FR-006 | 系统应支持管理员注销（删除）Agent，注销后该 Agent 无法再进行任何操作 | P2 |

### 2.2 Agent 状态管理

| ID | 需求描述 | 优先级 |
|----|----------|--------|
| FR-010 | 系统应实时跟踪每个 Agent 的在线状态（online/offline/busy） | P0 |
| FR-011 | 系统应通过心跳机制检测 Agent 连接状态，当 90 秒未收到心跳时应标记为 offline | P0 |
| FR-012 | 系统应通过 WebSocket 向所有在线 Agent 广播其他 Agent 的上线/下线事件 | P1 |
| FR-013 | 系统应记录每个 Agent 的最后活跃时间戳 | P1 |

### 2.3 实时通信

| ID | 需求描述 | 优先级 |
|----|----------|--------|
| FR-020 | 系统应支持 Agent 通过 WebSocket 发送点对点消息给指定 Agent | P0 |
| FR-021 | 系统应支持 Agent 通过 WebSocket 广播消息给所有订阅同一频道的 Agent | P0 |
| FR-022 | 系统应支持 Agent 订阅/取消订阅特定频道 | P1 |
| FR-023 | 系统应持久化所有消息到数据库，包含发送者、接收者、频道、类型、内容和时间戳 | P0 |
| FR-024 | 系统应支持 Agent 查询历史消息，支持按发送者、接收者、任务 ID、频道、时间范围过滤 | P1 |

### 2.4 任务管理

| ID | 需求描述 | 优先级 |
|----|----------|--------|
| FR-030 | 系统应允许 Agent 创建任务，创建时需指定任务标题、描述、优先级、执行者（可选）、任务参数和超时时间 | P0 |
| FR-031 | 系统应支持任务状态流转：pending → assigned → running → completed/failed/cancelled | P0 |
| FR-032 | 系统应通过 WebSocket 向被指派的 Agent 推送任务分配事件 | P0 |
| FR-033 | 系统应支持 Agent 更新任务状态，包括标记为运行中、完成（带结果）或失败（带错误信息） | P0 |
| FR-034 | 系统应支持 Agent 取消任务，取消后应通过 WebSocket 通知执行者 | P1 |
| FR-035 | 系统应支持查询任务列表，支持按状态、执行者、分页过滤 | P1 |
| FR-036 | 系统应支持 Agent 查询任务详情 | P1 |
| FR-037 | 系统应检测任务超时，当任务超过设定的 timeout_ms 未完成时应标记为 failed | P2 |

### 2.5 共享状态

| ID | 需求描述 | 优先级 |
|----|----------|--------|
| FR-040 | 系统应支持 Agent 读取共享状态，状态以 key-value 形式存储 | P1 |
| FR-041 | 系统应支持 Agent 写入共享状态，写入时应记录更新者和更新时间 | P1 |
| FR-042 | 系统应支持 Agent 删除共享状态 | P2 |
| FR-043 | 系统应列出所有共享状态的 key | P2 |
| FR-044 | 系统应通过 WebSocket 向所有 Agent 广播共享状态变更事件 | P1 |

### 2.6 心跳与重连

| ID | 需求描述 | 优先级 |
|----|----------|--------|
| FR-050 | 系统应要求客户端每 30 秒发送一次心跳消息 | P0 |
| FR-051 | 系统应收到心跳后返回 heartbeat_ack 确认，确认中应包含服务器当前时间 | P0 |
| FR-052 | 系统应支持客户端断线后自动重连，重连间隔应采用指数退避策略（1s → 2s → 4s → 8s → 16s → 30s 最大） | P1 |

---

## 3. 非功能需求

### 3.1 性能需求

| ID | 需求描述 | 目标值 |
|----|----------|--------|
| NFR-001 | 系统应支持的同时在线 Agent 数量 | ≥ 10 个 |
| NFR-002 | WebSocket 消息端到端延迟应小于 | < 100ms |
| NFR-003 | HTTP API 响应时间（P95）应小于 | < 200ms |
| NFR-004 | 单节点应能支持的 WebSocket 并发连接数 | ≥ 100 个 |

### 3.2 安全需求

| ID | 需求描述 |
|----|----------|
| NFR-010 | 所有外部通信应使用加密传输（HTTPS + WSS） |
| NFR-011 | JWT Token 应使用 HS256 或 RS256 算法签名 |
| NFR-012 | 系统应存储 Token 的哈希值而非明文，用于吊销检查 |
| NFR-013 | 系统应拒绝所有未通过 JWT 验证的 HTTP 请求和 WebSocket 连接 |

### 3.3 可用性需求

| ID | 需求描述 | 目标值 |
|----|----------|--------|
| NFR-020 | 系统单机部署时，年可用性应达到 | ≥ 99% |
| NFR-021 | 系统应支持进程崩溃后自动重启（通过 PM2） | 自动恢复 |
| NFR-022 | 数据库应采用 WAL 模式，支持并发读写 | 无锁读取 |

### 3.4 可维护性需求

| ID | 需求描述 |
|----|----------|
| NFR-030 | 系统应使用 TypeScript 严格模式编写，所有类型应显式声明 |
| NFR-031 | 系统应使用 ESLint + Prettier 进行代码风格统一 |
| NFR-032 | 核心模块应有单元测试覆盖 |
| NFR-033 | 系统应输出结构化日志，支持按级别过滤（debug/info/warn/error） |

---

## 4. 约束条件

### 4.1 技术约束

| ID | 约束描述 |
|----|----------|
| C-001 | 后端运行时必须使用 Node.js 20+ LTS 版本 |
| C-002 | HTTP 框架必须使用 Fastify 5.x |
| C-003 | WebSocket 实现必须使用 ws 8.x 库 |
| C-004 | 数据库必须使用 SQLite 3.x，ORM 使用 Drizzle ORM 0.30+ |
| C-005 | 鉴权必须使用 jose 库实现 JWT |
| C-006 | 进程管理必须使用 PM2 5.x |

### 4.2 部署约束

| ID | 约束描述 |
|----|----------|
| C-010 | 系统应支持单机部署，所有服务运行在同一台服务器上 |
| C-011 | 数据库应为单文件（hub.db），便于备份和迁移 |
| C-012 | 系统应支持通过环境变量配置所有运行时参数 |

### 4.3 规模约束

| ID | 约束描述 | 目标值 |
|----|----------|--------|
| C-020 | 设计支持的并发在线 Agent 数量 | 2-10 个 |
| C-021 | 设计支持的每日任务处理量 | ≤ 1000 个 |
| C-022 | 设计支持的消息存储保留期 | 30 天 |

---

## 5. 接口需求

### 5.1 HTTP API

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 注册 Agent | POST | /api/v1/agents | 注册新 Agent 并获取 Token |
| 获取 Agent 列表 | GET | /api/v1/agents | 获取所有 Agent 列表 |
| 获取单个 Agent | GET | /api/v1/agents/:id | 获取指定 Agent 详情 |
| 更新 Agent | PATCH | /api/v1/agents/:id | 更新 Agent 信息 |
| 注销 Agent | DELETE | /api/v1/agents/:id | 删除 Agent |
| 创建任务 | POST | /api/v1/tasks | 创建新任务 |
| 查询任务列表 | GET | /api/v1/tasks | 查询任务列表（支持过滤） |
| 获取任务详情 | GET | /api/v1/tasks/:id | 获取任务详情 |
| 更新任务状态 | PATCH | /api/v1/tasks/:id | 更新任务状态 |
| 取消任务 | POST | /api/v1/tasks/:id/cancel | 取消任务 |
| 获取消息历史 | GET | /api/v1/messages | 查询历史消息 |
| 读取共享状态 | GET | /api/v1/state/:key | 读取指定 key 的状态 |
| 写入共享状态 | PUT | /api/v1/state/:key | 写入状态 |
| 删除共享状态 | DELETE | /api/v1/state/:key | 删除状态 |
| 列出所有状态键 | GET | /api/v1/state | 列出所有 key |

### 5.2 WebSocket 消息

#### 客户端 → 服务端

- `heartbeat` - 心跳
- `send` - 发送消息
- `task_update` - 更新任务状态
- `broadcast` - 广播消息
- `subscribe` - 订阅频道
- `unsubscribe` - 取消订阅

#### 服务端 → 客户端

- `heartbeat_ack` - 心跳确认
- `message` - 收到消息
- `task_assigned` - 被分配任务
- `task_cancelled` - 任务被取消
- `agent_online` - Agent 上线
- `agent_offline` - Agent 离线
- `state_changed` - 共享状态变更
- `error` - 错误通知

---

## 6. 数据需求

### 6.1 数据模型

| 表名 | 说明 | 主要字段 |
|------|------|----------|
| agents | Agent 注册表 | id, name, token_hash, status, capabilities, metadata, last_seen |
| tasks | 任务表 | id, title, description, status, priority, created_by, assigned_to, payload, result |
| messages | 消息表 | id, from_agent, to_agent, task_id, channel, type, content |
| agent_tokens | 令牌表 | id, agent_id, token, expires_at, revoked |

### 6.2 数据保留策略

| 数据类型 | 保留策略 |
|----------|----------|
| Agent 信息 | 永久保留，除非主动删除 |
| 任务记录 | 永久保留 |
| 消息记录 | 保留 30 天 |
| 吊销的 Token | 永久保留 |

---

## 7. 验收标准

### 7.1 Phase 1 验收

- [ ] 成功启动 Fastify 服务，HTTP API 可访问
- [ ] 成功创建 SQLite 数据库并执行迁移
- [ ] Agent 可注册并获取 JWT Token
- [ ] 可查询 Agent 列表和详情
- [ ] Token 验证中间件正常工作

### 7.2 Phase 2 验收

- [ ] Agent 可通过 WebSocket 建立连接
- [ ] 心跳机制正常工作，90 秒无心跳自动断开
- [ ] 点对点消息可正确路由到目标 Agent
- [ ] 广播消息可发送给所有订阅者
- [ ] Agent 上线/下线事件可正确广播

### 7.3 Phase 3 验收

- [ ] 可创建任务并指定执行者
- [ ] 任务分配事件可通过 WS 推送
- [ ] 任务状态可正确流转
- [ ] 任务超时可检测并标记失败

### 7.4 Phase 4 验收

- [ ] 消息可持久化到数据库
- [ ] 可按条件查询历史消息
- [ ] 共享状态可读写
- [ ] 状态变更可广播

### 7.5 Phase 5 验收

- [ ] SDK 可成功连接到 Agent Hub
- [ ] SDK 可接收任务和消息事件
- [ ] SDK 可自动重连
- [ ] 提供完整的 SDK 使用文档

### 7.6 Phase 6 验收

- [ ] 支持 HTTPS + WSS 部署
- [ ] PM2 配置正确，可自动重启
- [ ] 日志输出结构化，可配置级别
- [ ] 环境变量配置完整

---

## 附录 A：术语表

| 术语 | 定义 |
|------|------|
| Agent | 独立的智能体程序，可执行特定任务 |
| Hub | 中心化协作服务器 |
| JWT | JSON Web Token，用于身份验证 |
| WebSocket | 双向实时通信协议 |
| Channel | 消息频道，用于广播和订阅 |

## 附录 B：参考文档

- Fastify 官方文档：https://www.fastify.io/
- Drizzle ORM 文档：https://orm.drizzle.team/
- jose 库文档：https://github.com/panva/jose
- ws 库文档：https://github.com/websockets/ws
