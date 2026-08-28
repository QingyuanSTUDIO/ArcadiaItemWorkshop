import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function openDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      format_version INTEGER NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      entry_json TEXT NOT NULL,
      item_order INTEGER NOT NULL DEFAULT 0,
      report_count INTEGER NOT NULL DEFAULT 0,
      moderation_status TEXT NOT NULL DEFAULT 'published' CHECK(moderation_status IN ('published', 'review')),
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published', 'hidden', 'deleted')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      reporter_hash TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(item_id, reporter_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_items_public ON items(status, category, item_order, name);
    CREATE INDEX IF NOT EXISTS idx_reports_item ON reports(item_id);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE TABLE IF NOT EXISTS worldbook_entries (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL CHECK(module IN ('worldbook', 'workshop')),
      worldbook_name TEXT NOT NULL DEFAULT '',
      uid TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      strategy_json TEXT NOT NULL DEFAULT '{}',
      position_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      author_id TEXT,
      category TEXT NOT NULL DEFAULT '商品',
      download_count INTEGER NOT NULL DEFAULT 0,
      like_count INTEGER NOT NULL DEFAULT 0,
      report_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(module, worldbook_name, uid)
    );
    CREATE INDEX IF NOT EXISTS idx_worldbook_module ON worldbook_entries(module, updated_at);
    CREATE TABLE IF NOT EXISTS worldbook_reactions (
      entry_id TEXT NOT NULL REFERENCES worldbook_entries(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction TEXT NOT NULL CHECK(reaction IN ('like', 'report')),
      created_at TEXT NOT NULL,
      PRIMARY KEY(entry_id, user_id, reaction)
    );
  `);
  try { db.exec("ALTER TABLE worldbook_entries ADD COLUMN category TEXT NOT NULL DEFAULT '商品'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
  for (const column of ['download_count', 'like_count', 'report_count']) {
    try { db.exec(`ALTER TABLE worldbook_entries ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
  }
  try { db.exec("ALTER TABLE worldbook_entries ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'published'"); } catch (error) { if (!String(error.message).includes('duplicate column')) throw error; }
  return db;
}

export function createRepository(db, reportLimit = 5) {
  const insertItem = db.prepare(`
    INSERT INTO items (id, name, category, format_version, author, tags_json, entry_json, item_order, created_at, updated_at)
    VALUES (@id, @name, @category, @formatVersion, @author, @tagsJson, @entryJson, @itemOrder, @createdAt, @updatedAt)
  `);
  const getPublic = db.prepare("SELECT * FROM items WHERE id = ? AND status = 'published'");
  const getAny = db.prepare('SELECT * FROM items WHERE id = ?');
  const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const getUserById = db.prepare('SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?');
  const parseJsonObject = value => {
    try {
      const parsed = JSON.parse(value || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  };
  const entryRow = row => ({ id: row.id, module: row.module, worldbookName: row.worldbook_name, uid: row.uid, name: row.name, content: row.content, category: row.category || '商品', strategy: parseJsonObject(row.strategy_json), position: parseJsonObject(row.position_json), enabled: Boolean(row.enabled), authorId: row.author_id, authorName: row.author_name || '', downloadCount: Number(row.download_count) || 0, likeCount: Number(row.like_count) || 0, reportCount: Number(row.report_count) || 0, moderationStatus: row.moderation_status || 'published', createdAt: row.created_at, updatedAt: row.updated_at });
  const insertReport = db.prepare('INSERT INTO reports (item_id, reporter_hash, reason, created_at) VALUES (?, ?, ?, ?)');
  const updateReportCount = db.prepare(`
    UPDATE items
    SET report_count = (SELECT COUNT(*) FROM reports WHERE item_id = ?),
        status = CASE WHEN (SELECT COUNT(*) FROM reports WHERE item_id = ?) >= ? THEN 'hidden' ELSE status END,
        updated_at = ?
    WHERE id = ?
  `);

  const reportTransaction = db.transaction((id, reporterHash, reason, now) => {
    if (!getPublic.get(id)) return { kind: 'missing' };
    try {
      insertReport.run(id, reporterHash, reason, now);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { kind: 'duplicate' };
      throw error;
    }
    updateReportCount.run(id, id, reportLimit, now, id);
    const item = db.prepare('SELECT report_count, status FROM items WHERE id = ?').get(id);
    return { kind: 'accepted', reportCount: item.report_count, hidden: item.status === 'hidden' };
  });

  return {
    createUser(user) {
      db.prepare('INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (@id, @username, @passwordHash, @role, @createdAt, @updatedAt)').run(user);
      return getUserById.get(user.id);
    },
    findUser(username) { return getUserByUsername.get(username); },
    getUser(id) { return getUserById.get(id) || null; },
    listUsers() { return db.prepare('SELECT id, username, role, created_at, updated_at FROM users ORDER BY created_at').all(); },
    setUserRole(id, role) {
      const result = db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(role, new Date().toISOString(), id);
      return result.changes ? getUserById.get(id) : null;
    },
    upsertWorldbookEntry(entry) {
      db.prepare(`INSERT INTO worldbook_entries (id,module,worldbook_name,uid,name,content,category,strategy_json,position_json,enabled,author_id,created_at,updated_at)
        VALUES (@id,@module,@worldbookName,@uid,@name,@content,@category,@strategyJson,@positionJson,@enabled,@authorId,@createdAt,@updatedAt)
        ON CONFLICT(module,worldbook_name,uid) DO UPDATE SET name=excluded.name,content=excluded.content,category=excluded.category,strategy_json=excluded.strategy_json,position_json=excluded.position_json,enabled=excluded.enabled,author_id=COALESCE(excluded.author_id,worldbook_entries.author_id),updated_at=excluded.updated_at`).run(entry);
      return entryRow(db.prepare('SELECT e.*, u.username AS author_name FROM worldbook_entries e LEFT JOIN users u ON u.id=e.author_id WHERE e.id = ?').get(entry.id) || db.prepare('SELECT e.*, u.username AS author_name FROM worldbook_entries e LEFT JOIN users u ON u.id=e.author_id WHERE e.module=? AND e.worldbook_name=? AND e.uid=?').get(entry.module, entry.worldbookName, entry.uid));
    },
    listWorldbookEntries({ module, worldbookName = '', category = '', query = '', sort = 'newest', authorId = '', includeReview = false }) {
      // 不依赖 SQLite JSON1 扩展；宝塔环境中的 SQLite 构建可能未启用该扩展。
      const actualModule = module === 'review' ? 'workshop' : module;
      const moderation = module === 'review' ? 'review' : 'published';
      const rows = db.prepare("SELECT e.*, u.username AS author_name FROM worldbook_entries e LEFT JOIN users u ON u.id=e.author_id WHERE e.module = ? AND (e.moderation_status = ? OR (? = 1 AND e.moderation_status = 'review')) AND (? = '' OR e.worldbook_name = ?) AND (? = '' OR e.category = ?) AND (? = '' OR e.name LIKE ? OR COALESCE(u.username, '') LIKE ?) AND (? = '' OR e.author_id = ?) ORDER BY e.updated_at DESC").all(actualModule, moderation, includeReview ? 1 : 0, worldbookName, worldbookName, category, category, query, `%${query}%`, `%${query}%`, authorId, authorId).map(entryRow);
      const compare = sort === 'oldest' ? (a, b) => a.createdAt.localeCompare(b.createdAt) : sort === 'downloads_desc' ? (a, b) => b.downloadCount - a.downloadCount : sort === 'downloads_asc' ? (a, b) => a.downloadCount - b.downloadCount : sort === 'likes_desc' ? (a, b) => b.likeCount - a.likeCount : sort === 'likes_asc' ? (a, b) => a.likeCount - b.likeCount : (a, b) => b.createdAt.localeCompare(a.createdAt);
      return rows.sort(compare);
    },
    incrementWorldbookDownload(id) { db.prepare('UPDATE worldbook_entries SET download_count = download_count + 1, updated_at = updated_at WHERE id = ?').run(id); return this.getWorldbookEntry(id); },
    incrementWorldbookLike(id) { db.prepare('UPDATE worldbook_entries SET like_count = like_count + 1 WHERE id = ?').run(id); return this.getWorldbookEntry(id); },
    incrementWorldbookReport(id) { db.prepare("UPDATE worldbook_entries SET report_count = report_count + 1, moderation_status = CASE WHEN report_count + 1 >= 10 THEN 'review' ELSE moderation_status END WHERE id = ?").run(id); return this.getWorldbookEntry(id); },
    reactWorldbook(id, userId, reaction) {
      const now = new Date().toISOString();
      try {
        db.prepare('INSERT INTO worldbook_reactions (entry_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)').run(id, userId, reaction, now);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { kind: 'duplicate' };
        throw error;
      }
      const column = reaction === 'like' ? 'like_count' : 'report_count';
      const update = reaction === 'report'
        ? 'UPDATE worldbook_entries SET report_count = report_count + 1, moderation_status = CASE WHEN report_count + 1 >= 10 THEN \'review\' ELSE moderation_status END WHERE id = ?'
        : 'UPDATE worldbook_entries SET like_count = like_count + 1 WHERE id = ?';
      db.prepare(update).run(id);
      return { kind: 'accepted', item: this.getWorldbookEntry(id) };
    },
    listWorldbookReactions(id) {
      return db.prepare(`SELECT r.reaction, r.created_at, u.id AS user_id, u.username
        FROM worldbook_reactions r JOIN users u ON u.id = r.user_id
        WHERE r.entry_id = ? ORDER BY r.created_at DESC`).all(id)
        .map(row => ({ reaction: row.reaction, userId: row.user_id, username: row.username, createdAt: row.created_at }));
    },
    updateWorldbookStats(id, stats) {
      db.prepare('UPDATE worldbook_entries SET download_count = ?, like_count = ?, report_count = ? WHERE id = ?').run(stats.downloadCount, stats.likeCount, stats.reportCount, id);
      return this.getWorldbookEntry(id);
    },
    transferWorldbookEntry(id, targetModule) {
      const source = db.prepare('SELECT * FROM worldbook_entries WHERE id = ?').get(id);
      if (!source) return { kind: 'missing' };
      const module = targetModule === 'review' ? 'workshop' : targetModule;
      const moderationStatus = targetModule === 'review' ? 'review' : 'published';
      if (!['worldbook', 'workshop'].includes(module)) return { kind: 'invalid' };
      const targetByName = db.prepare('SELECT * FROM worldbook_entries WHERE module = ? AND name = ? LIMIT 1').get(module, source.name);
      const target = targetByName || db.prepare('SELECT * FROM worldbook_entries WHERE module = ? AND worldbook_name = ? AND uid = ? LIMIT 1').get(module, source.worldbook_name, source.uid);
      if (target && target.author_id !== source.author_id) return { kind: 'conflict' };
      // The source id is normally stable across transfers, but protect against
      // an unrelated record already occupying the derived id.
      let idToUse = target?.id || `${source.id}-${module}`;
      const idCollision = db.prepare('SELECT id FROM worldbook_entries WHERE id = ?').get(idToUse);
      if (idCollision && !target) idToUse = `${source.id}-${module}-${Date.now()}`;
      db.prepare(`INSERT INTO worldbook_entries (id,module,worldbook_name,uid,name,content,category,strategy_json,position_json,enabled,author_id,created_at,updated_at,moderation_status,download_count,like_count,report_count)
        VALUES (@id,@module,@worldbookName,@uid,@name,@content,@category,@strategyJson,@positionJson,@enabled,@authorId,@createdAt,@updatedAt,@moderationStatus,@downloadCount,@likeCount,@reportCount)
        ON CONFLICT(id) DO UPDATE SET module=excluded.module,worldbook_name=excluded.worldbook_name,uid=excluded.uid,name=excluded.name,content=excluded.content,category=excluded.category,strategy_json=excluded.strategy_json,position_json=excluded.position_json,enabled=excluded.enabled,author_id=excluded.author_id,updated_at=excluded.updated_at,moderation_status=excluded.moderation_status`).run({ id: idToUse, module, worldbookName: source.worldbook_name, uid: source.uid, name: source.name, content: source.content, category: source.category, strategyJson: source.strategy_json, positionJson: source.position_json, enabled: source.enabled, authorId: source.author_id, createdAt: source.created_at, updatedAt: new Date().toISOString(), moderationStatus, downloadCount: source.download_count || 0, likeCount: source.like_count || 0, reportCount: source.report_count || 0 });
      return { kind: 'ok', item: this.getWorldbookEntry(idToUse) };
    },
    getWorldbookEntry(id) { const row = db.prepare('SELECT * FROM worldbook_entries WHERE id = ?').get(id); return row ? entryRow(row) : null; },
    findWorldbookByName(module, name) { const row = db.prepare('SELECT * FROM worldbook_entries WHERE module = ? AND name = ? LIMIT 1').get(module, name); return row ? entryRow(row) : null; },
    deleteWorldbookEntry(id) { return db.prepare('DELETE FROM worldbook_entries WHERE id = ?').run(id).changes > 0; },
    create(item) {
      insertItem.run(item);
      return this.get(item.id);
    },
    get(id) {
      const row = getPublic.get(id);
      return row ? mapItem(row) : null;
    },
    adminList({ query = '', status = '', limit = 100, offset = 0 }) {
      const rows = db.prepare(`
        SELECT * FROM items
        WHERE (@status = '' OR status = @status)
          AND (@query = '' OR name LIKE @pattern OR author LIKE @pattern OR tags_json LIKE @pattern)
        ORDER BY updated_at DESC, item_order, name
        LIMIT @limit OFFSET @offset
      `).all({ status, query, pattern: `%${query}%`, limit, offset });
      return rows.map(mapItem);
    },
    adminCount({ query = '', status = '' }) {
      return db.prepare(`SELECT COUNT(*) AS count FROM items
        WHERE (@status = '' OR status = @status)
          AND (@query = '' OR name LIKE @pattern OR author LIKE @pattern OR tags_json LIKE @pattern)`)
        .get({ status, query, pattern: `%${query}%` }).count;
    },
    adminGet(id) {
      const row = getAny.get(id);
      if (!row) return null;
      const reports = db.prepare('SELECT reason, created_at FROM reports WHERE item_id = ? ORDER BY created_at DESC').all(id)
        .map(report => ({ reason: report.reason, createdAt: report.created_at }));
      return { ...mapItem(row), reports };
    },
    setStatus(id, status) {
      const result = db.prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ? AND status != 'deleted'")
        .run(status, new Date().toISOString(), id);
      return result.changes ? mapItem(getAny.get(id)) : null;
    },
    delete(id) {
      const result = db.prepare("UPDATE items SET status = 'deleted', updated_at = ? WHERE id = ? AND status != 'deleted'")
        .run(new Date().toISOString(), id);
      return result.changes > 0;
    },
    list({ category = '', query = '', limit = 30, offset = 0 }) {
      const rows = db.prepare(`
        SELECT * FROM items
        WHERE status = 'published'
          AND (@category = '' OR category = @category)
          AND (@query = '' OR name LIKE @pattern OR author LIKE @pattern OR tags_json LIKE @pattern)
        ORDER BY category, item_order, name
        LIMIT @limit OFFSET @offset
      `).all({ category, query, pattern: `%${query}%`, limit, offset });
      return rows.map(mapItem);
    },
    count({ category = '', query = '' }) {
      return db.prepare(`
        SELECT COUNT(*) AS count FROM items
        WHERE status = 'published'
          AND (@category = '' OR category = @category)
          AND (@query = '' OR name LIKE @pattern OR author LIKE @pattern OR tags_json LIKE @pattern)
      `).get({ category, query, pattern: `%${query}%` }).count;
    },
    report: reportTransaction,
    close() { db.close(); },
  };
}

function mapItem(row) {
  return {
    id: row.id,
    format: 'arcadia-item',
    version: row.format_version,
    category: row.category,
    name: row.name,
    order: row.item_order,
    author: row.author,
    tags: JSON.parse(row.tags_json),
    entry: JSON.parse(row.entry_json),
    reportCount: row.report_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
