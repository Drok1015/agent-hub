# Agent Hub 开发任务清单

> 项目：Agent Hub  
> 创建日期：2026-05-18  
> 预计周期：4-6 周

---

## Phase 1：基础骨架（预计 3-5 天）

### 1.1 项目初始化
- [ ] **创建 package.json**
  - 定义项目名称、版本、描述
  - 配置脚本：dev, build, start, db:migrate, test, lint, format
  - 添加依赖：fastify, ws, better-sqlite3, drizzle-orm, jose, zod

- [ ] **创建 tsconfig.json**
  - 启用 strict 模式
  - 配置路径别名：@/* 映射到 src/*
  - 设置输出目录：dist/

- [ ] **创建开发启动脚本**
  - 使用 tsx 实现热重载
  - 配置 .env 加载

- [ ] **创建 .gitignore**
  - 排除：node_modules, dist, data/*.db, .env, logs/

- [ ] **创建 .env.example**
  - 包含所有必需的环境变量模板

**验收标准**: `npm run dev` 可启动空白 Fastify 服务

---

### 1.2 数据库 Schema 定义
- [ ] **创建 src/db/schema.ts**
  - 定义 agents 表（id, name, token_hash, status, capabilities, metadata, timestamps）
  - 定义 tasks 表（id, title, description, status, priority, assigned_to, payload, result, timestamps）
  - 定义 messages 表（id, from_agent, to_agent, task_id, channel, type, content, created_at）
  - 定义 agent_tokens 表（id, agent_id, token, name, expires_at, revoked, created_at）

- [ ] **创建 drizzle.config.ts**
  - 配置数据库路径
  - 配置迁移文件输出目录

- [ ] **创建 drizzle/0000_init.sql**
  - 生成初始迁移 SQL
  - 包含所有表和索引定义

**验收标准**: 执行 `npm run db:migrate` 可创建 hub.db 并生成所有表

---

### 1.3 数据库连接初始化
- [ ] **创建 src/db/index.ts**
  - 初始化 better-sqlite3 连接
  - 启用 WAL 模式
  - 导出 drizzle 实例

- [ ] **创建 src/db/migrate.ts**
  - 实现迁移执行逻辑
  - 支持幂等执行

**验收标准**: 其他模块可通过 `import db from '@/db'` 使用数据库

---

### 1.4 配置与日志模块
- [ ] **创建 src/config.ts**
  - 从环境变量加载配置
  - 提供默认值
  - 使用 Zod 进行 schema 校验

- [ ] **创建 src/utils/logger.ts**
  - 实现结构化日志
  - 支持 debug/info/warn/error 级别
  - 输出格式：JSON 或 Pretty（根据环境）

**验收标准**: 可在其他模块中使用 logger.info() 等输出日志

---

### 1.5 JWT 鉴权模块
- [ ] **创建 src/auth/jwt.ts**
  - 实现 signToken(payload, secret, expiresIn)
  - 实现 verifyToken(token, secret)
  - 实现 hashToken(token) 用于存储哈希

- [ ] **创建 src/auth/middleware.ts**
  - 实现 Fastify 中间件：验证 Authorization header
  - 实现 WS 连接验证：验证 query 参数 token
  - 错误时返回 401 INVALID_TOKEN

**验收标准**: 可签发和验证 JWT，中间件可拦截未授权请求

---

### 1.6 Agent 注册 API
- [ ] **创建 src/routes/agents.ts**
  - POST /api/v1/agents：注册 Agent
    - 生成 UUID 和 JWT
    - 存储 agent 信息和 token 哈希
    - 返回 token（仅此一次）

- [ ] **实现输入校验**
  - name: 必填，唯一
  - capabilities: 可选，数组
  - metadata: 可选，对象

**验收标准**: 调用 API 可注册 Agent 并获得 JWT token

---

### 1.7 Agent 查询 API
- [ ] **GET /api/v1/agents**
  - 返回所有 Agent 列表（不包含敏感信息）

- [ ] **GET /api/v1/agents/:id**
  - 返回单个 Agent 详情

- [ ] **PATCH /api/v1/agents/:id**
  - 更新 capabilities 和 metadata
  - 仅允许 Agent 更新自己的信息

**验收标准**: 可查询 Agent 列表和详情，可更新自身信息

---

### 1.8 Agent 注销 API
- [ ] **DELETE /api/v1/agents/:id**
  - 删除 Agent 记录
  - 吊销所有关联的 token
  - 关闭该 Agent 的 WebSocket 连接

**验收标准**: 注销后 Agent 无法再进行任何操作

---

### Phase 1 验收
- [ ] Fastify 服务可启动，监听端口可配置
- [ ] 数据库迁移成功，4 张表创建完成
- [ ] Agent 可注册并获得 JWT token
- [ ] 可查询 Agent 列表和详情
- [ ] Token 验证中间件正常工作
- [ ] 所有 API 通过鉴权保护

---

## Phase 2：WebSocket 核心（预计 5-7 天）

### 2.1 WebSocket 服务初始化
- [ ] **创建 src/ws/server.ts**
  - 使用 ws 库创建 WebSocket.Server
  - 绑定到 HTTP 服务器的同一端口
  - 路径：/ws

- [ ] **集成到主入口**
  - 在 src/index.ts 中启动 WS 服务
  - 确保 HTTP 和 WS 共享同一端口

**验收标准**: 可建立 WebSocket 连接到 /ws

---

### 2.2 WS 连接鉴权
- [ ] **实现 Token 验证**
  - 从 query 参数解析 token
  - 调用 verifyToken 验证
  - 失败则关闭连接

- [ ] **提取 agentId**
  - 验证成功后从 payload 提取 agentId
  - 关联到 WebSocket 实例

**验收标准**: 只有携带有效 token 的连接才能建立

---

### 2.3 连接管理器
- [ ] **创建 src/ws/connection.ts**
  - 实现 ConnectionManager 类
  - 维护 Map<agentId, Connection>
  - Connection 包含：socket, lastHeartbeat, subscriptions

- [ ] **实现基本方法**
  - add(agentId, socket)
  - remove(agentId)
  - get(agentId)
  - broadcast(message, excludeAgentId?)

**验收标准**: 可正确管理所有连接，支持广播

---

### 2.4 心跳机制
- [ ] **实现客户端心跳协议**
  - 定义 heartbeat 消息格式：{ type: 'heartbeat', id, timestamp }
  - 定义 heartbeat_ack 响应：{ type: 'heartbeat_ack', serverTime }

- [ ] **服务端心跳处理**
  - 收到 heartbeat 更新 lastHeartbeat
  - 返回 heartbeat_ack
  - 定时检查超时（90 秒）

- [ ] **超时处理**
  - 标记 Agent 为 offline
  - 关闭连接
  - 广播 agent_offline 事件

**验收标准**: 心跳正常工作，超时自动断开并通知

---

### 2.5 消息路由
- [ ] **创建 src/ws/handler.ts**
  - 实现消息分发器
  - 根据 type 路由到不同处理器

- [ ] **实现 send 处理器**
  - 点对点消息：发送给指定 to_agent
  - 支持 channel, type, content
  - 持久化到 messages 表

- [ ] **实现 broadcast 处理器**
  - 广播到指定 channel 的所有订阅者
  - 支持频道过滤

- [ ] **实现 subscribe/unsubscribe**
  - 管理 Connection.subscriptions
  - 广播时根据订阅过滤

**验收标准**: 点对点消息和广播消息可正确路由

---

### 2.6 Agent 上下线通知
- [ ] **上线通知**
  - 连接建立后广播 agent_online
  - 包含 agentId 和 name

- [ ] **下线通知**
  - 心跳超时或断开时广播 agent_offline
  - 包含 agentId 和 name

**验收标准**: Agent 上线/下线事件可实时通知所有在线 Agent

---

### 2.7 消息持久化
- [ ] **集成消息存储**
  - 所有收到的消息写入 messages 表
  - 包含 from_agent, to_agent, channel, type, content, created_at

- [ ] **优化写入性能**
  - 使用事务批量写入
  - 异步写入避免阻塞

**验收标准**: 消息可正确持久化，可通过 API 查询

---

### Phase 2 验收
- [ ] WebSocket 服务可启动并接受连接
- [ ] 连接时需通过 JWT 鉴权
- [ ] 心跳机制正常工作（30 秒心跳，90 秒超时）
- [ ] 点对点消息可正确路由
- [ ] 广播消息可发送给订阅者
- [ ] Agent 上下线事件可广播
- [ ] 消息持久化到数据库

---

## Phase 3：任务系统（预计 5-7 天）

### 3.1 任务 CRUD API
- [ ] **创建 src/routes/tasks.ts**
  - POST /api/v1/tasks：创建任务
  - GET /api/v1/tasks：查询列表（支持过滤）
  - GET /api/v1/tasks/:id：获取详情
  - PATCH /api/v1/tasks/:id：更新状态
  - POST /api/v1/tasks/:id/cancel：取消任务

**验收标准**: 所有 CRUD 接口可正常工作

---

### 3.2 任务创建
- [ ] **实现任务创建逻辑**
  - 生成 UUID
  - 验证输入：title（必填）, description, priority, assignedTo, payload, timeoutMs
  - 默认状态：pending
  - 如果指定 assignedTo，状态变为 assigned

- [ ] **任务分配通知**
  - 如果指定 assignedTo，通过 WS 推送 task_assigned 事件

**验收标准**: 可创建任务，指定执行者时自动推送通知

---

### 3.3 任务状态机
- [ ] **定义状态流转**
  ```
  pending → assigned → running → completed
                                 → failed
                → cancelled
  ```

- [ ] **实现状态校验**
  - 验证状态流转合法性
  - 非法流转返回错误

- [ ] **实现状态更新**
  - 更新 tasks 表
  - 记录 started_at / completed_at
  - 保存 result 或 error

**验收标准**: 状态流转正确，时间戳自动记录

---

### 3.4 任务执行流程
- [ ] **Agent 接受任务**
  - 收到 task_assigned 事件
  - 调用 PATCH /tasks/:id 更新为 running

- [ ] **完成任务**
  - 调用 PATCH 更新为 completed
  - 携带 result payload

- [ ] **报告失败**
  - 调用 PATCH 更新为 failed
  - 携带 error 信息

**验收标准**: 完整任务流程可执行

---

### 3.5 任务取消
- [ ] **实现取消逻辑**
  - 检查任务状态（只有 pending/assigned/running 可取消）
  - 更新状态为 cancelled
  - 通过 WS 推送 task_cancelled 给执行者

**验收标准**: 任务取消后执行者收到通知

---

### 3.6 任务查询
- [ ] **实现过滤查询**
  - status 过滤
  - assignedTo 过滤
  - createdBy 过滤
  - limit / offset 分页

**验收标准**: 可按条件查询任务列表

---

### 3.7 任务超时处理
- [ ] **实现超时检测**
  - 定时扫描 tasks 表
  - 检查 started_at + timeout_ms < now 且 status = running
  - 自动标记为 failed

- [ ] **超时通知**
  - 通过 WS 通知执行者
  - 记录 error 信息

**验收标准**: 超时任务自动标记失败

---

### Phase 3 验收
- [ ] 任务 CRUD API 全部可用
- [ ] 任务状态机正确流转
- [ ] 任务分配通过 WS 推送
- [ ] 任务取消通知执行者
- [ ] 任务超时自动检测并标记失败

---

## Phase 4：数据层（预计 3-5 天）

### 4.1 消息历史 API
- [ ] **创建 src/routes/messages.ts**
  - GET /api/v1/messages
  - 支持过滤：from, to, taskId, channel, since
  - 支持分页：limit, offset
  - 按 created_at 降序排序

**验收标准**: 可按条件查询历史消息

---

### 4.2 共享状态 API
- [ ] **创建 src/routes/state.ts**
  - GET /api/v1/state/:key：读取状态
  - PUT /api/v1/state/:key：写入状态
  - DELETE /api/v1/state/:key：删除状态
  - GET /api/v1/state：列出所有 key

- [ ] **实现状态存储**
  - 使用独立的状态表或内存存储
  - 记录 value, updatedBy, updatedAt

**验收标准**: 共享状态 CRUD 正常工作

---

### 4.3 状态变更广播
- [ ] **集成 WS 广播**
  - 状态变更时广播 state_changed 事件
  - 包含 key, value, updatedBy

**验收标准**: 状态变更实时通知所有 Agent

---

### 4.4 消息清理策略
- [ ] **实现定期清理**
  - 删除超过 30 天的消息
  - 使用 cron job 或定时任务

**验收标准**: 旧消息自动清理

---

### Phase 4 验收
- [ ] 消息历史 API 支持多种过滤条件
- [ ] 共享状态 CRUD 可用
- [ ] 状态变更实时广播
- [ ] 消息清理策略生效

---

## Phase 5：Agent SDK（预计 5-7 天）

### 5.1 SDK 包结构
- [ ] **创建 sdk/ 目录**
  - 独立的 package.json
  - tsconfig.json
  - 源代码目录：src/

- [ ] **配置构建脚本**
  - 编译到 dist/
  - 生成 .d.ts 类型声明
  - 发布到 npm

**验收标准**: SDK 可独立构建和发布

---

### 5.2 AgentClient 核心类
- [ ] **创建 sdk/src/client.ts**
  - 构造函数：接收 AgentConfig
  - connect()：建立 WS 连接
  - disconnect()：断开连接

- [ ] **实现 HTTP 客户端**
  - 封装 fetch 调用
  - 自动添加 Authorization header
  - 错误处理

**验收标准**: 可实例化并连接

---

### 5.3 事件系统
- [ ] **继承 EventEmitter**
  - connected
  - disconnected
  - task:assigned
  - task:cancelled
  - message
  - agent:online
  - agent:offline
  - state:changed
  - error

- [ ] **实现事件分发**
  - 收到 WS 消息后触发对应事件
  - 传递解析后的 payload

**验收标准**: 可监听并接收各类事件

---

### 5.4 消息发送
- [ ] **实现 send(to, message)**
  - 构造 send 消息
  - 通过 WS 发送

- [ ] **实现 broadcast(channel, message)**
  - 构造 broadcast 消息
  - 通过 WS 发送

**验收标准**: 可发送点对点和广播消息

---

### 5.5 任务操作
- [ ] **实现 completeTask(taskId, result)**
  - 调用 HTTP API 更新状态

- [ ] **实现 failTask(taskId, error)**
  - 调用 HTTP API 更新状态

**验收标准**: 可上报任务结果

---

### 5.6 共享状态操作
- [ ] **实现 getState(key)**
  - 调用 HTTP GET

- [ ] **实现 setState(key, value)**
  - 调用 HTTP PUT

**验收标准**: 可读写共享状态

---

### 5.7 查询接口
- [ ] **实现 listAgents()**
  - 调用 GET /agents

- [ ] **实现 listTasks(filters)**
  - 调用 GET /tasks

**验收标准**: 可查询 Agent 和任务列表

---

### 5.8 自动重连
- [ ] **实现重连逻辑**
  - 断线后自动重连
  - 指数退避：1s → 2s → 4s → 8s → 16s → 30s
  - 重连成功后触发 connected 事件

**验收标准**: 断线后自动重连成功

---

### 5.9 心跳管理
- [ ] **实现定时心跳**
  - 每 30 秒发送 heartbeat
  - 可配置 heartbeatInterval

- [ ] **实现心跳确认处理**
  - 收到 heartbeat_ack 更新本地时间

**验收标准**: 心跳正常发送

---

### 5.10 SDK 文档
- [ ] **编写 README.md**
  - 安装说明
  - 快速开始
  - API 参考
  - 示例代码

- [ ] **提供示例项目**
  - 创建一个简单的 Agent 示例
  - 展示如何接入 Agent Hub

**验收标准**: 开发者可根据文档快速接入

---

### Phase 5 验收
- [ ] SDK 包可构建并发布
- [ ] AgentClient 可连接和断开
- [ ] 事件系统正常工作
- [ ] 可发送消息和广播
- [ ] 可操作任务和状态
- [ ] 自动重连机制生效
- [ ] 提供完整使用文档

---

## Phase 6：生产化（预计 3-5 天）

### 6.1 HTTPS + WSS
- [ ] **配置 TLS 证书**
  - 使用 Let's Encrypt 或自有证书
  - 配置证书路径

- [ ] **配置 Nginx 反向代理**
  - TLS 终止
  - WebSocket 升级支持
  - 转发到 Node.js 服务

**验收标准**: 可通过 HTTPS/WSS 访问

---

### 6.2 PM2 配置
- [ ] **创建 ecosystem.config.js**
  - 配置应用名称、脚本、实例数
  - 配置日志路径
  - 配置内存限制和重启策略

- [ ] **配置开机自启**
  - pm2 startup
  - pm2 save

**验收标准**: 服务崩溃自动重启，开机自启

---

### 6.3 日志系统
- [ ] **实现结构化日志**
  - JSON 格式输出
  - 包含时间戳、级别、模块、消息、额外数据

- [ ] **日志分级**
  - 支持通过 LOG_LEVEL 环境变量控制
  - debug / info / warn / error

- [ ] **日志轮转**
  - 配置 PM2 日志轮转
  - 或使用 logrotate

**验收标准**: 日志输出规范，支持查询和分析

---

### 6.4 环境变量配置
- [ ] **完善 .env.example**
  - 包含所有配置项
  - 提供合理默认值
  - 添加注释说明

- [ ] **配置校验**
  - 启动时校验必需的环境变量
  - 缺失时报错并退出

**验收标准**: 环境变量配置完整，启动时自动校验

---

### 6.5 健康检查
- [ ] **实现健康检查端点**
  - GET /health
  - 返回服务状态、数据库连接、WebSocket 状态

- [ ] **配置监控**
  - 集成 Prometheus 指标（可选）
  - 或简单监控脚本

**验收标准**: 可通过健康检查端点监控服务状态

---

### 6.6 备份策略
- [ ] **数据库备份**
  - 定期备份 hub.db
  - 保留最近 7 天的备份

- [ ] **备份脚本**
  - 编写 crontab 脚本
  - 压缩并存储到安全位置

**验收标准**: 数据库定期备份，可恢复

---

### Phase 6 验收
- [ ] 支持 HTTPS + WSS 安全访问
- [ ] PM2 配置正确，自动重启
- [ ] 日志结构化输出，支持分级
- [ ] 环境变量配置完整
- [ ] 健康检查端点可用
- [ ] 数据库备份策略生效

---

## 总计任务统计

| Phase | 任务数 | 预计周期 | 优先级 |
|-------|--------|----------|--------|
| Phase 1 | 20 | 3-5 天 | P0 |
| Phase 2 | 15 | 5-7 天 | P0 |
| Phase 3 | 15 | 5-7 天 | P1 |
| Phase 4 | 8 | 3-5 天 | P1 |
| Phase 5 | 20 | 5-7 天 | P2 |
| Phase 6 | 10 | 3-5 天 | P2 |
| **总计** | **88** | **24-36 天** | - |

---

## 开发里程碑

### M1：基础功能完成（Week 2）
- Phase 1 完成
- 可注册 Agent 并通过 HTTP API 交互

### M2：实时通信完成（Week 4）
- Phase 2 完成
- Agent 可通过 WebSocket 实时通信

### M3：任务系统完成（Week 6）
- Phase 3 完成
- 可创建、分配、执行任务

### M4：SDK 发布（Week 8）
- Phase 5 完成
- 发布 @agent-hub/sdk 到 npm

### M5：生产部署（Week 9）
- Phase 6 完成
- 上线运行

---

## 风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| WebSocket 性能瓶颈 | 低 | 高 | 压力测试，优化连接管理 |
| SQLite 并发限制 | 中 | 中 | 使用 WAL 模式，监控性能 |
| JWT 安全问题 | 低 | 高 | 使用 RS256，定期轮换密钥 |
| 重连风暴 | 中 | 中 | 实现随机延迟，避免同时重连 |
| 消息丢失 | 低 | 高 | 确保先持久化再发送 |

---

## 备注

- 每个 Phase 完成后应进行代码审查
- 核心模块应有单元测试覆盖
- 每周末同步进度到项目管理工具
- 遇到技术难点及时组织讨论
