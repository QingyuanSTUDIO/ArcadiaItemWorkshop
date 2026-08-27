import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, ValidationError, validateItem, validateReport } from './validation.js';
import { createRepository, openDatabase } from './database.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadEnvFile(path.join(ROOT, '.env'));
const PORT = parseInteger(process.env.PORT, 8787, 1, 65535);
// 监听所有网卡，便于测试阶段通过服务器公网 IP 访问；正式部署仍建议放在 Nginx/HTTPS 后面。
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY_BYTES = 128 * 1024;
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
const trustProxy = process.env.TRUST_PROXY === 'true';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const sessions = new Map();
const repository = createRepository(openDatabase(path.join(ROOT, 'data', 'workshop.sqlite')));
const hashPassword = value => crypto.createHash('sha256').update(String(value)).digest('hex');
if (ADMIN_PASSWORD && repository.listUsers().length === 0) {
  const now = new Date().toISOString();
  repository.createUser({ id: crypto.randomUUID(), username: process.env.ADMIN_USERNAME || 'admin', passwordHash: hashPassword(ADMIN_PASSWORD), role: 'admin', createdAt: now, updatedAt: now });
}

function loadEnvFile(filename) {
  try {
    const lines = fs.readFileSync(filename, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || match[1] in process.env) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('无法读取 .env：', error.message);
  }
}

function parseInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function corsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return '*';
  if (!allowedOrigins.size || allowedOrigins.has(origin)) return origin;
  return null;
}

function send(req, res, status, value, headers = {}) {
  const origin = corsOrigin(req);
  if (!origin) status = 403, value = { error: '当前来源未获准访问' };
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(status === 204 ? undefined : JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let stopped = false;
    req.on('data', chunk => {
      if (stopped) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        stopped = true;
        const error = new Error('请求体不能超过 128 KB');
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (stopped) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { const error = new Error('请求体不是合法 JSON'); error.statusCode = 400; reject(error); }
    });
    req.on('error', reject);
  });
}

function reporterHash(req) {
  const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const address = forwarded || req.socket.remoteAddress || 'unknown';
  const agent = String(req.headers['user-agent'] || 'unknown');
  return crypto.createHash('sha256').update(`${address}\n${agent}`).digest('hex');
}

function publicSummary(item) {
  const { entry, reportCount, ...summary } = item;
  return summary;
}

function cookieValue(req, name) {
  const pair = String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}
function isAdmin(req) {
  const token = cookieValue(req, 'arcadia_admin');
  const session = sessions.get(token);
  if (!session || session.expiry < Date.now()) { sessions.delete(token); return false; }
  return session.role === 'admin';
}
function requireAdmin(req, res) {
  if (!ADMIN_PASSWORD) { send(req, res, 503, { error: '服务端尚未设置 ADMIN_PASSWORD' }); return false; }
  if (!isAdmin(req)) { send(req, res, 401, { error: '需要管理员登录' }); return false; }
  return true;
}
function currentUser(req) { const token = cookieValue(req, 'arcadia_admin'); const session = sessions.get(token); return session && session.expiry > Date.now() ? repository.getUser(session.userId) : null; }
function requireUser(req, res) { const user = currentUser(req); if (!user) { send(req, res, 401, { error: '需要登录' }); return null; } return user; }
function isAdminUser(user) { return user?.role === 'admin'; }
function sendFile(res, filename, contentType) {
  try { res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(fs.readFileSync(filename)); }
  catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'OPTIONS') return send(req, res, 204, null);
    if (req.method === 'GET' && url.pathname === '/admin') return sendFile(res, path.join(ROOT, 'admin', 'index.html'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/admin/users') return sendFile(res, path.join(ROOT, 'admin', 'users.html'), 'text/html; charset=utf-8');
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const body = await readBody(req);
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      const account = repository.findUser(username);
      if (!account || hashPassword(body.password) !== account.password_hash) return send(req, res, 401, { error: '账号或密码错误' });
      const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { userId: account.id, role: account.role, expiry: Date.now() + 8 * 60 * 60 * 1000 });
      return send(req, res, 200, { ok: true }, { 'Set-Cookie': `arcadia_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readBody(req); const username = typeof body.username === 'string' ? body.username.trim() : '';
      if (!/^[\w-]{3,32}$/.test(username) || typeof body.password !== 'string' || body.password.length < 8) throw new ValidationError('用户名需为 3-32 位字母、数字、下划线或短横线，密码至少 8 位');
      if (repository.findUser(username)) return send(req, res, 409, { error: '用户名已存在' });
      const now = new Date().toISOString(); const user = repository.createUser({ id: crypto.randomUUID(), username, passwordHash: hashPassword(body.password), role: 'user', createdAt: now, updatedAt: now });
      return send(req, res, 201, { user });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(req); const account = repository.findUser(String(body.username || '').trim());
      if (!account || hashPassword(body.password) !== account.password_hash) return send(req, res, 401, { error: '账号或密码错误' });
      const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { userId: account.id, role: account.role, expiry: Date.now() + 8 * 60 * 60 * 1000 });
      return send(req, res, 200, { user: repository.getUser(account.id) }, { 'Set-Cookie': `arcadia_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
      sessions.delete(cookieValue(req, 'arcadia_admin'));
      return send(req, res, 200, { ok: true }, { 'Set-Cookie': 'arcadia_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (url.pathname.startsWith('/api/admin/')) {
      if (!requireAdmin(req, res)) return;
      if (req.method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'items') {
        const item = repository.adminGet(parts[3]);
        return item ? send(req, res, 200, { item }) : send(req, res, 404, { error: '条目不存在' });
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/items') {
        const filter = { query: (url.searchParams.get('q') || '').trim().slice(0, 100), status: url.searchParams.get('status') || '', limit: parseInteger(url.searchParams.get('limit'), 100, 1, 200), offset: parseInteger(url.searchParams.get('offset'), 0, 0, 1_000_000) };
        return send(req, res, 200, { total: repository.adminCount(filter), items: repository.adminList(filter) });
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/users') return send(req, res, 200, { users: repository.listUsers() });
      if (req.method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'users' && parts[4] === 'role') {
        const body = await readBody(req); if (!['user', 'admin'].includes(body.role)) throw new ValidationError('role 不合法');
        const user = repository.setUserRole(parts[3], body.role); return user ? send(req, res, 200, { user }) : send(req, res, 404, { error: '用户不存在' });
      }
      if (req.method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'items') {
        const id = parts[3];
        if (parts[4] === 'delete') return send(req, res, 200, { ok: repository.delete(id) });
        if (parts[4] === 'status') {
          const body = await readBody(req); if (!['published', 'hidden'].includes(body.status)) throw new ValidationError('status 不合法');
          const item = repository.setStatus(id, body.status); return item ? send(req, res, 200, { item }) : send(req, res, 404, { error: '条目不存在' });
        }
      }
      return send(req, res, 404, { error: '管理员接口不存在' });
    }
    if (url.pathname.startsWith('/api/worldbook')) {
      const user = requireUser(req, res); if (!user) return;
      const module = url.pathname.startsWith('/api/worldbook/workshop') ? 'workshop' : 'worldbook';
      if (module === 'worldbook' && !isAdminUser(user)) return send(req, res, 403, { error: '世界书本体仅管理员可修改' });
      if (req.method === 'GET') return send(req, res, 200, { items: repository.listWorldbookEntries({ module, worldbookName: url.searchParams.get('worldbook') || '' }) });
      if (req.method === 'POST') {
        const body = await readBody(req); const now = new Date().toISOString();
        if (body.id) {
          const existing = repository.getWorldbookEntry(body.id);
          if (existing && module === 'workshop' && existing.authorId !== user.id && !isAdminUser(user)) return send(req, res, 403, { error: '只能修改自己发布的创意工坊条目' });
        }
        const entry = repository.upsertWorldbookEntry({ id: body.id || crypto.randomUUID(), module, worldbookName: String(body.worldbookName || ''), uid: String(body.uid || crypto.randomUUID()), name: String(body.name || '').slice(0, 200), content: String(body.content || '').slice(0, 20000), strategyJson: JSON.stringify(body.strategy || {}), positionJson: JSON.stringify(body.position || {}), enabled: body.enabled === false ? 0 : 1, authorId: user.id, createdAt: body.createdAt || now, updatedAt: now });
        return send(req, res, 201, { item: entry });
      }
      if (req.method === 'DELETE' && parts.length === 4) {
        const existing = repository.getWorldbookEntry(parts[3]);
        if (!existing || (module === 'workshop' && existing.authorId !== user.id && !isAdminUser(user))) return send(req, res, 404, { error: '条目不存在或无权限' });
        return send(req, res, 200, { ok: repository.deleteWorldbookEntry(parts[3]) });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(req, res, 200, { ok: true, service: 'arcadia-item-workshop', version: '0.1.0' });
    }
    if (req.method === 'GET' && url.pathname === '/api/items') {
      const category = url.searchParams.get('category') || '';
      if (category && !CATEGORIES.includes(category)) throw new ValidationError('category 不是允许的分类');
      const query = (url.searchParams.get('q') || '').trim().slice(0, 100);
      const limit = parseInteger(url.searchParams.get('limit'), 30, 1, 100);
      const offset = parseInteger(url.searchParams.get('offset'), 0, 0, 1_000_000);
      const filter = { category, query, limit, offset };
      return send(req, res, 200, { total: repository.count(filter), items: repository.list(filter).map(publicSummary) });
    }
    if (req.method === 'GET' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'items') {
      const item = repository.get(parts[2]);
      return item ? send(req, res, 200, { item }) : send(req, res, 404, { error: '条目不存在' });
    }
    if (req.method === 'POST' && url.pathname === '/api/items') {
      const value = validateItem(await readBody(req));
      const now = new Date().toISOString();
      const item = repository.create({
        id: crypto.randomUUID(), name: value.name, category: value.category,
        formatVersion: value.version, author: value.author,
        tagsJson: JSON.stringify(value.tags), entryJson: JSON.stringify(value.entry),
        itemOrder: value.order, createdAt: now, updatedAt: now,
      });
      return send(req, res, 201, { item });
    }
    if (req.method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'items' && parts[3] === 'report') {
      const { reason } = validateReport(await readBody(req));
      const result = repository.report(parts[2], reporterHash(req), reason, new Date().toISOString());
      if (result.kind === 'missing') return send(req, res, 404, { error: '条目不存在' });
      if (result.kind === 'duplicate') return send(req, res, 409, { error: '你已经举报过这个条目' });
      return send(req, res, 200, { reportCount: result.reportCount, hidden: result.hidden });
    }
    return send(req, res, 404, { error: '接口不存在' });
  } catch (error) {
    console.error(error);
    return send(req, res, error.statusCode || 500, { error: error.statusCode ? error.message : '服务器内部错误' });
  }
});

function shutdown() {
  server.close(() => { repository.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.listen(PORT, HOST, () => console.log(`ArcadiaItemWorkshop API: http://${HOST}:${PORT}`));
