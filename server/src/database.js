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
  `);
  return db;
}

export function createRepository(db, reportLimit = 5) {
  const insertItem = db.prepare(`
    INSERT INTO items (id, name, category, format_version, author, tags_json, entry_json, item_order, created_at, updated_at)
    VALUES (@id, @name, @category, @formatVersion, @author, @tagsJson, @entryJson, @itemOrder, @createdAt, @updatedAt)
  `);
  const getPublic = db.prepare("SELECT * FROM items WHERE id = ? AND status = 'published'");
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
    create(item) {
      insertItem.run(item);
      return this.get(item.id);
    },
    get(id) {
      const row = getPublic.get(id);
      return row ? mapItem(row) : null;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
