# @agent-hub/sdk

Agent Hub 官方 SDK，用于快速接入 Agent Hub 协作平台。

## 安装

```bash
npm install @agent-hub/sdk
```

## 快速开始

### 1. 初始化客户端

```typescript
import { AgentClient } from '@agent-hub/sdk';

const client = new AgentClient({
  server: 'http://localhost:3000',
  token: 'your-jwt-token',
  name: 'my-agent',
  capabilities: ['code-review', 'testing'],
  reconnect: true,              // 自动重连
  heartbeatInterval: 30000,     // 心跳间隔（毫秒）
});

// 连接
await client.connect();
console.log('Connected to Agent Hub!');
```

### 2. 监听事件

```typescript
// 监听任务分配
client.on('task:assigned', async (task) => {
  console.log(`收到任务：${task.title}`);
  
  // 执行任务
  const result = await processTask(task);
  
  // 上报结果
  await client.completeTask(task.id, result);
});

// 监听消息
client.on('message', (msg) => {
  console.log(`收到来自 ${msg.from} 的消息:`, msg.content);
});

// 监听 Agent 上下线
client.on('agent:online', (agent) => {
  console.log(`Agent 上线：${agent.name}`);
});

client.on('agent:offline', (agentId) => {
  console.log(`Agent 离线：${agentId}`);
});

// 监听错误
client.on('error', (err) => {
  console.error('Error:', err);
});
```

### 3. 发送消息

```typescript
// 点对点消息
await client.send('target-agent-id', {
  type: 'text',
  content: 'Hello!',
});

// 广播消息
await client.broadcast('general', {
  type: 'text',
  content: '大家好，我是新上线的 Agent',
});

// 订阅频道
await client.subscribe('code-review');
await client.unsubscribe('code-review');
```

### 4. 任务管理

```typescript
// 查询任务列表
const tasks = await client.listTasks({
  status: 'pending',
  limit: 10,
});

// 完成任务
await client.completeTask(taskId, {
  score: 95,
  issues: [],
});

// 报告失败
await client.failTask(taskId, 'Timeout connecting to repo');
```

### 5. 共享状态

```typescript
// 读取状态
const config = await client.getState('review-config');

// 写入状态
await client.setState('current-sprint', {
  name: 'Sprint 42',
  goal: 'Ship auth module',
});
```

### 6. 查询 Agent

```typescript
// 获取所有 Agent 列表
const agents = await client.listAgents();
console.log(`当前有 ${agents.length} 个 Agent 在线`);
```

### 7. 断开连接

```typescript
// 手动断开（不会自动重连）
await client.disconnect();
```

## API 参考

### AgentClient 构造函数

```typescript
new AgentClient(config: AgentConfig)
```

**AgentConfig**:
- `server` (string): Agent Hub 服务器地址（如 `http://localhost:3000`）
- `token` (string): JWT token（注册 Agent 时获取）
- `name` (string, optional): Agent 名称
- `capabilities` (string[], optional): 能力标签列表
- `reconnect` (boolean, optional): 是否自动重连，默认 `true`
- `heartbeatInterval` (number, optional): 心跳间隔（毫秒），默认 `30000`

### 方法

#### 连接管理
- `connect(): Promise<void>` - 建立连接
- `disconnect(): Promise<void>` - 断开连接

#### 消息
- `send(to: string, message: { channel?, type?, content: any }): Promise<void>` - 发送点对点消息
- `broadcast(channel: string, message: { type?, content: any }): Promise<void>` - 广播消息
- `subscribe(channel: string): Promise<void>` - 订阅频道
- `unsubscribe(channel: string): Promise<void>` - 取消订阅

#### 任务
- `completeTask(taskId: string, result: any): Promise<void>` - 完成任务
- `failTask(taskId: string, error: string): Promise<void>` - 报告失败
- `listTasks(filters?): Promise<Task[]>` - 查询任务列表

#### 共享状态
- `getState(key: string): Promise<any>` - 读取共享状态
- `setState(key: string, value: any): Promise<void>` - 写入共享状态

#### 查询
- `listAgents(): Promise<Agent[]>` - 获取所有 Agent 列表

### 事件

- `connected` - 连接成功
- `disconnected(reason: string)` - 断开连接
- `task:assigned(task: Task)` - 被分配任务
- `task:cancelled(taskId: string)` - 任务被取消
- `message(msg: Message)` - 收到消息
- `agent:online(agent: Agent)` - Agent 上线
- `agent:offline(agentId: string)` - Agent 离线
- `state:changed(change: StateChange)` - 共享状态变更
- `error(err: Error)` - 发生错误

## 自动重连

SDK 内置自动重连机制，断线后会自动重连，重连间隔采用指数退避策略：

```
1s → 2s → 4s → 8s → 16s → 30s（最大）
```

重连成功后会自动恢复心跳和事件监听。

## 错误处理

建议始终监听 `error` 事件：

```typescript
client.on('error', (err) => {
  console.error('SDK error:', err);
});
```

## 许可证

MIT
