import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';

test('chat HTTP authentication, cooldown, mute authorization and moderation', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'arcadia-chat-'));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATABASE_PATH: path.join(temp, 'test.sqlite'),
      ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'test-admin-password', SESSION_SECRET: 'test-only-secret', ALLOWED_ORIGINS: '', DEBUG_ERRORS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await rm(temp, { recursive: true, force: true });
  });
  for (let i = 0; i < 100 && !logs.includes('ArcadiaItemWorkshop API:'); i++) {
    if (child.exitCode !== null) throw Error(logs);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.match(logs, /ArcadiaItemWorkshop API:/);
  const base = `http://127.0.0.1:${port}`;
  async function api(url, token = '', body, method = body === undefined ? 'GET' : 'POST') {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, ...await r.json() };
  }
  assert.equal((await api('/api/chat/messages')).status, 401);
  const admin = await api('/api/auth/login', '', { username: 'admin', password: 'test-admin-password' });
  const registered = await api('/api/auth/register', '', { username: 'visitor', password: 'visitor-password' });
  const user = await api('/api/auth/login', '', { username: 'visitor', password: 'visitor-password' });
  assert.equal((await fetch(base + '/admin/chat')).status, 200);
  const mute = `/api/admin/chat/users/${registered.user.id}/mute`;
  assert.equal((await api(mute, user.token, { action: 'mute', duration: '1d' })).status, 401);
  assert.equal((await api('/api/admin/chat/messages', user.token)).status, 401);
  assert.equal((await api(mute, admin.token, { action: 'mute', duration: '0m' })).status, 400);
  const first = await api('/api/chat/messages', user.token, { content: 'hello' });
  assert.equal(first.status, 201);
  assert.equal((await api('/api/chat/messages', user.token, { content: 'too soon' })).status, 429);
  for (let i = 0; i < 2; i++) assert.equal((await api('/api/chat/messages', admin.token, { content: 'admin' })).status, 201);
  assert.equal((await api(mute, admin.token, { action: 'mute', duration: '1d', reason: 'test' })).status, 200);
  assert.equal((await api('/api/chat/messages', user.token, { content: 'muted' })).status, 403);
  assert.ok((await api('/api/chat/messages', user.token)).mutedUntil);
  assert.equal((await api('/api/admin/users', admin.token)).users.find(u => u.id === registered.user.id).chat_muted, true);
  assert.equal((await api(mute, admin.token, { action: 'unmute' })).status, 200);
  assert.equal((await api(`/api/admin/chat/users/${admin.user.id}/mute`, admin.token, { action: 'mute', duration: '1d' })).status, 403);
  assert.equal((await api('/api/chat/activity', user.token, {})).status, 200);
  assert.equal((await api('/api/chat/messages', user.token)).messages.find(m => m.id === first.message.id).active, true);
  const messageUrl = `/api/admin/chat/messages/${first.message.id}`;
  assert.equal((await api(messageUrl, admin.token, { status: 'hidden' })).status, 200);
  assert.equal((await api('/api/chat/messages', user.token)).messages.some(m => m.id === first.message.id), false);
  assert.equal((await api('/api/admin/chat/messages?status=hidden', admin.token)).total, 1);
  assert.equal((await api(messageUrl, admin.token, { status: 'published' })).status, 200);
  assert.equal((await api(messageUrl, admin.token, undefined, 'DELETE')).status, 200);
});
