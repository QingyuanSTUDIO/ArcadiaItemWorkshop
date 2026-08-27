import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRY_TAGS, validateItem } from '../src/validation.js';

function validItem() {
  return {
    format: 'arcadia-item', version: 1, category: '武器', name: '测试武器', order: 10,
    author: '测试作者', tags: ['测试'],
    entry: Object.fromEntries(ENTRY_TAGS.map(tag => [tag, tag === 'Item_Name' ? '测试武器' : '内容'])),
  };
}

test('接受完整的标准条目', () => {
  assert.equal(validateItem(validItem()).entry.Item_Name, '测试武器');
});

test('拒绝缺少标签的条目', () => {
  const item = validItem();
  delete item.entry.Price;
  assert.throws(() => validateItem(item), /entry.Price 必须是字符串/);
});

test('拒绝未知字段和危险脚本内容', () => {
  const unknown = validItem();
  unknown.extra = true;
  assert.throws(() => validateItem(unknown), /未知字段/);
  const dangerous = validItem();
  dangerous.entry.Item_Data = '<script>alert(1)</script>';
  assert.throws(() => validateItem(dangerous), /可执行内容/);
});
