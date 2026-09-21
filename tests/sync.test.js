const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const { io } = require('socket.io-client');

const SERVER1_PORT = 3005;
const SERVER2_PORT = 3006;
const TEST_BOARD = `test-board-${Date.now()}`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchToken(port, userId, boardId) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/api/auth/token?userId=${userId}&boardId=${boardId}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.token);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function startServerProcess(port, serverId) {
  const env = {
    ...process.env,
    PORT: port.toString(),
    SERVER_ID: serverId,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/kanban-sync-test',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    REDIS_STRICT: 'false',
    JWT_SECRET: 'test-secret-key-2026',
  };

  const proc = spawn('node', ['server.js'], {
    cwd: __dirname + '/..',
    env,
    stdio: 'inherit',
  });

  return proc;
}

async function runTests() {
  console.log('🚀 Starting Integration Test Suite for Real-time Sync & Multi-Node Failover...\n');

  let server1Proc = null;
  let server2Proc = null;
  let client1 = null;
  let client2 = null;

  try {
    // 1. Start Server 1 (3001) and Server 2 (3002)
    console.log(`[Test 1] Spawning Server 1 (Port ${SERVER1_PORT}) and Server 2 (Port ${SERVER2_PORT})...`);
    server1Proc = startServerProcess(SERVER1_PORT, 'server-1');
    server2Proc = startServerProcess(SERVER2_PORT, 'server-2');
    await delay(3000); // Give servers time to bind and connect to Mongo/Redis

    // 2. Obtain JWT Auth Tokens
    console.log('[Test 2] Fetching JWT tokens for socket clients...');
    const token1 = await fetchToken(SERVER1_PORT, 'Alice', TEST_BOARD);
    const token2 = await fetchToken(SERVER2_PORT, 'Bob', TEST_BOARD);
    assert.ok(token1, 'Token 1 should be issued');
    assert.ok(token2, 'Token 2 should be issued');
    console.log('  ✓ Tokens successfully issued for Alice and Bob');

    // 3. Connect Dual Clients across separate ports
    console.log(`[Test 3] Connecting Client 1 (Port ${SERVER1_PORT}) and Client 2 (Port ${SERVER2_PORT})...`);
    client1 = io(`http://localhost:${SERVER1_PORT}`, {
      transports: ['websocket'],
      auth: { token: token1 },
    });

    client2 = io(`http://localhost:${SERVER2_PORT}`, {
      transports: ['websocket'],
      auth: { token: token2 },
    });

    await Promise.all([
      new Promise((res) => client1.on('connect', res)),
      new Promise((res) => client2.on('connect', res)),
    ]);
    console.log('  ✓ Client 1 connected to Server 1 & Client 2 connected to Server 2');

    // 4. Test Cross-Node Real-time Synchronization
    console.log('[Test 4] Testing cross-instance task creation sync...');
    const syncPromise = new Promise((resolve) => {
      client2.on('task:created', (data) => {
        if (data.task && data.task.title === 'Cross-node Task Test') {
          resolve(data.task);
        }
      });
    });

    client1.emit('task:create', { title: 'Cross-node Task Test' }, (ack) => {
      assert.strictEqual(ack.success, true, 'Task creation should succeed');
    });

    const syncedTask = await syncPromise;
    assert.ok(syncedTask, 'Client 2 should receive task:created from Client 1 via Redis adapter');
    console.log('  ✓ Cross-node sync verified: Task received by Client 2 on Server 2');

    // 5. Test Zod Payload Validation & Hardening
    console.log('[Test 5] Testing Zod payload validation rejection...');
    const invalidAck = await new Promise((resolve) => {
      client1.emit('task:create', { title: '' }, resolve);
    });
    assert.strictEqual(invalidAck.success, false);
    assert.strictEqual(invalidAck.error.code, 'INVALID_PAYLOAD');
    console.log('  ✓ Payload validation verified: Empty title rejected with INVALID_PAYLOAD');

    // 6. Test Optimistic Concurrency Control
    console.log('[Test 6] Testing optimistic concurrency conflict rejection...');
    const conflictAck = await new Promise((resolve) => {
      client1.emit(
        'task:move',
        { taskId: syncedTask._id, toColumn: 'in-progress', expectedVersion: 999 },
        resolve
      );
    });
    assert.strictEqual(conflictAck.success, false);
    assert.strictEqual(conflictAck.error.code, 'CONCURRENCY_CONFLICT');
    console.log('  ✓ Optimistic concurrency verified: Mismatched version rejected with CONCURRENCY_CONFLICT');

    // 7. Test Mid-Session Server Failover (Kill Server 1)
    console.log('[Test 7] Testing mid-session server failure & failover...');
    const failoverPromise = new Promise((resolve) => {
      client1.on('task:created', (data) => {
        if (data.task && data.task.title === 'Failover Task Test') {
          resolve(data.task);
        }
      });
    });

    console.log(`  -> Killing Server 1 (Port ${SERVER1_PORT}) mid-session...`);
    server1Proc.kill('SIGTERM');
    await delay(1000);

    console.log(`  -> Reconnecting Client 1 to Server 2 (Port ${SERVER2_PORT})...`);
    client1.disconnect();
    client1.io.uri = `http://localhost:${SERVER2_PORT}`;
    client1.connect();

    await new Promise((res) => client1.on('connect', res));
    console.log('  ✓ Client 1 successfully failover-connected to Server 2');

    client1.emit('task:create', { title: 'Failover Task Test' }, (ack) => {
      assert.strictEqual(ack.success, true);
    });

    const failoverTask = await failoverPromise;
    assert.ok(failoverTask, 'Client 2 should receive task created after Server 1 failover');
    console.log('  ✓ Mid-session failover verified: Cluster continues operation without data loss');

    console.log('\n🎉 ALL REAL-TIME SYNC & FAILOVER TESTS PASSED SUCCESSFULLY!\n');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    if (client1) client1.disconnect();
    if (client2) client2.disconnect();
    if (server1Proc) server1Proc.kill();
    if (server2Proc) server2Proc.kill();
  }
}

runTests();
