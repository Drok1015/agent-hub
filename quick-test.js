import { AgentClient } from './sdk/src/index.js';

async function main() {
  console.log('=== Agent Hub Quick Test ===\n');
  
  // 1. 注册一个新 Agent
  console.log('1. Registering new agent...');
  const registerRes = await fetch('http://localhost:3000/api/v1/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'test-agent-' + Date.now(),
      capabilities: ['testing', 'demo'],
      metadata: { version: '1.0' },
    }),
  });
  
  const registerData = await registerRes.json();
  if (!registerData.ok) {
    console.error('Registration failed:', registerData.error);
    return;
  }
  
  const { id: agentId, name, token } = registerData.data;
  console.log(`✓ Registered agent: ${name} (${agentId})`);
  console.log(`  Token: ${token.substring(0, 20)}...\n`);
  
  // 2. 使用 SDK 连接
  console.log('2. Connecting with SDK...');
  const client = new AgentClient({
    server: 'http://localhost:3000',
    token,
    name,
    reconnect: false,
  });
  
  // 设置事件监听
  client.on('connected', () => {
    console.log('✓ Connected to Agent Hub\n');
  });
  
  client.on('agent:online', (agent) => {
    console.log(`→ Agent online: ${agent.name}`);
  });
  
  client.on('agent:offline', (agentId) => {
    console.log(`→ Agent offline: ${agentId}`);
  });
  
  client.on('message', (msg) => {
    console.log(`→ Message from ${msg.from}:`, msg.content);
  });
  
  client.on('task:assigned', async (task) => {
    console.log(`→ Task assigned: ${task.title}`);
    console.log(`  Completing task...`);
    await client.completeTask(task.id, { result: 'done!' });
  });
  
  client.on('error', (err) => {
    console.error('Error:', err.message);
  });
  
  // 连接
  await client.connect();
  
  // 3. 查询 Agent 列表
  console.log('3. Listing agents...');
  const agents = await client.listAgents();
  console.log(`✓ Found ${agents.length} agent(s)\n`);
  
  // 4. 创建任务
  console.log('4. Creating task...');
  const tasks = await client.listTasks({ status: 'pending', limit: 1 });
  console.log(`✓ Found ${tasks.length} pending task(s)\n`);
  
  // 5. 测试共享状态
  console.log('5. Testing shared state...');
  await client.setState('test-key', { value: 'hello', timestamp: Date.now() });
  const state = await client.getState('test-key');
  console.log(`✓ State:`, state, '\n');
  
  // 6. 断开连接
  console.log('6. Disconnecting...');
  await client.disconnect();
  console.log('✓ Disconnected\n');
  
  console.log('=== Test Complete ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
