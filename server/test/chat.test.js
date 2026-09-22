import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository, openDatabase } from '../src/database.js';

function setup(t) {
  const db = openDatabase(':memory:');
  const repo = createRepository(db);
  t.after(() => repo.close());
  const now = new Date().toISOString();
  for (let i = 0; i < 15; i++) repo.createUser({ id: `u${i}`, username: `user${i}`, passwordHash: 'test', role: i === 0 ? 'admin' : 'user', createdAt: now, updatedAt: now });
  const message = (id, userId = 'u1', createdAt = now) => ({ id, userId, content: 'Hello <b>world</b>', createdAt, updatedAt: createdAt });
  return { db, repo, message };
}

test('public chat returns only latest 200, admin retains history and paginates', t => {
  const { repo, message } = setup(t);
  for (let i = 0; i < 205; i++) repo.createChatMessage(message(`m${i}`, 'u0', new Date(100000 + i).toISOString()));
  const rows = repo.listChatMessages();
  assert.equal(rows.length, 200);
  assert.equal(rows[0].id, 'm5');
  assert.equal(rows.at(-1).id, 'm204');
  assert.equal(repo.countAdminChatMessages(), 205);
  assert.equal(repo.listAdminChatMessages({ offset: 200 }).length, 5);
});

test('presence expires at twenty minutes; reading does not renew activity', t => {
  const { repo, message } = setup(t);
  repo.createChatMessage(message('m'));
  repo.touchChatActivity('u1', new Date(Date.now() - 21 * 60000).toISOString());
  assert.equal(repo.listChatMessages()[0].active, false);
  repo.touchChatActivity('u1');
  assert.equal(repo.listChatMessages()[0].active, true);
});

test('cooldown persists independently of deleted messages; admin exempt', t => {
  const { db, repo, message } = setup(t);
  assert.equal(repo.sendChatMessage(message('first')).kind, 'accepted');
  assert.equal(repo.sendChatMessage(message('second')).kind, 'cooldown');
  repo.deleteChatMessage('first');
  assert.equal(repo.sendChatMessage(message('third')).kind, 'cooldown');
  db.prepare('UPDATE users SET chat_sent_at = ? WHERE id = ?').run(new Date(Date.now() - 10001).toISOString(), 'u1');
  assert.equal(repo.sendChatMessage(message('fourth')).kind, 'accepted');
  assert.equal(repo.sendChatMessage(message('admin1', 'u0')).kind, 'accepted');
  assert.equal(repo.sendChatMessage(message('admin2', 'u0')).kind, 'accepted');
});

test('mute, unmute, expiry and admin visibility', t => {
  const { repo, message } = setup(t);
  repo.setChatMute('u1', '9999-12-31T23:59:59.999Z', 'spam');
  assert.equal(repo.sendChatMessage(message('m')).kind, 'muted');
  assert.equal(repo.listUsers().find(u => u.id === 'u1').chat_muted, true);
  repo.clearChatMute('u1');
  assert.equal(repo.getChatMutedUntil('u1'), null);
  repo.setChatMute('u1', new Date(Date.now() - 1).toISOString(), 'expired');
  assert.equal(repo.sendChatMessage(message('m')).kind, 'accepted');
});

test('eleventh dislike hides message, duplicate votes excluded; moderation and deletion', t => {
  const { db, repo, message } = setup(t);
  repo.createChatMessage(message('m'));
  assert.equal(repo.reactChatMessage('m', 'u0', 'like').kind, 'accepted');
  assert.equal(repo.reactChatMessage('m', 'u0', 'dislike').kind, 'duplicate');
  for (let i = 1; i <= 10; i++) assert.equal(repo.reactChatMessage('m', `u${i}`, 'dislike').hidden, false);
  assert.equal(repo.reactChatMessage('m', 'u11', 'dislike').hidden, true);
  assert.equal(repo.listChatMessages().length, 0);
  assert.equal(repo.listAdminChatMessages({ status: 'hidden' }).length, 1);
  repo.setChatMessageStatus('m', 'published');
  assert.equal(repo.listChatMessages().length, 1);
  repo.deleteChatMessage('m');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_reactions').get().n, 0);
});
