import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, ValidationError, validateItem, validateReport } from './validation.js';
import { createRepository, openDatabase } from './database.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = parseInteger(process.env.PORT, 8787, 1, 65535);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY_BYTES = 128 * 1024;
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
const trustProxy = process.env.TRUST_PROXY === 'true';
const repository = createRepository(openDatabase(path.join(ROOT, 'data', 'workshop.sqlite')));

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'OPTIONS') return send(req, res, 204, null);
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
