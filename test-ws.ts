import { WebSocket } from 'ws';

// 先用一个已知的 token 测试
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhZ2VudElkIjoiNWJhYWM1NDUtZTY1MS00NDMxLTljOWUtODg5MjM4YjgxZTNjIiwibmFtZSI6InRlc3QtYWdlbnQiLCJpYXQiOjE3NzkxMjQyNDQsImV4cCI6MTgxMDY2MDI0NCwiaXNzIjoiYWdlbnQtaHViIn0.07V0PGZPC1ysChkVo8-G3sfxIeyFqbDMHGnn0Gy64UU';

const ws = new WebSocket(`ws://localhost:3000/ws?token=${TOKEN}`);

ws.on('open', () => {
  console.log('✓ Connected to Agent Hub');
  
  // 发送心跳测试
  ws.send(JSON.stringify({
    type: 'heartbeat',
    id: 'test-1',
    timestamp: Date.now(),
    payload: {},
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('← Received:', msg.type, msg.payload);
  
  if (msg.type === 'heartbeat_ack') {
    console.log('✓ Heartbeat successful!');
    
    // 测试发送消息
    ws.send(JSON.stringify({
      type: 'send',
      id: 'test-2',
      timestamp: Date.now(),
      payload: {
        to: 'non-existent-agent',
        channel: 'direct',
        type: 'text',
        content: 'Hello!',
      },
    }));
  }
  
  if (msg.type === 'error') {
    console.log('✗ Error:', msg.payload.message);
    ws.close();
    process.exit(0);
  }
});

ws.on('close', () => {
  console.log('✓ Disconnected');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('✗ WebSocket error:', err.message);
  process.exit(1);
});

// 5 秒后关闭
setTimeout(() => {
  console.log('Test timeout, closing...');
  ws.close();
}, 5000);
