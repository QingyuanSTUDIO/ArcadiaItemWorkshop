export const CATEGORIES = Object.freeze([
  '商品', '综合商品', '生物', '药品', '改造', '特殊改造', '装备', '武器',
]);

export const ENTRY_TAGS = Object.freeze([
  'Item_Name',
  'Item_Data',
  'Origin',
  'Price',
  'Trigger_Keywords',
  'Mechanism_Usage',
  'Core_Effects',
  'Roleplay_Scenarios',
  'Safety_Override',
  'AI_Directive',
]);

const DANGEROUS_CONTENT = /<\s*script\b|javascript\s*:|\bon(?:error|load|click|mouseover)\s*=/i;

function requirePlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} 必须是对象`);
  }
}

function requireString(value, field, maxLength, allowEmpty = true) {
  if (typeof value !== 'string') throw new ValidationError(`${field} 必须是字符串`);
  const result = value.trim();
  if (!allowEmpty && !result) throw new ValidationError(`${field} 不能为空`);
  if (result.length > maxLength) throw new ValidationError(`${field} 不能超过 ${maxLength} 个字符`);
  if (DANGEROUS_CONTENT.test(result)) throw new ValidationError(`${field} 包含不允许的可执行内容`);
  return result;
}

function rejectUnknownKeys(object, allowed, field) {
  const unknown = Object.keys(object).filter(key => !allowed.includes(key));
  if (unknown.length) throw new ValidationError(`${field} 包含未知字段：${unknown.join('、')}`);
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export function validateItem(input) {
  requirePlainObject(input, '请求体');
  rejectUnknownKeys(input, ['format', 'version', 'category', 'name', 'order', 'author', 'tags', 'entry'], '请求体');
  if (input.format !== 'arcadia-item') throw new ValidationError('format 必须是 arcadia-item');
  if (input.version !== 1) throw new ValidationError('version 必须是 1');
  if (!CATEGORIES.includes(input.category)) throw new ValidationError('category 不是允许的分类');

  requirePlainObject(input.entry, 'entry');
  rejectUnknownKeys(input.entry, ENTRY_TAGS, 'entry');
  const entry = {};
  for (const tag of ENTRY_TAGS) {
    entry[tag] = requireString(input.entry[tag], `entry.${tag}`, 20_000, tag !== 'Item_Name');
  }

  const name = input.name === undefined
    ? entry.Item_Name
    : requireString(input.name, 'name', 120, false);
  if (name !== entry.Item_Name) throw new ValidationError('name 必须与 entry.Item_Name 完全一致');

  const order = input.order === undefined ? 0 : Number(input.order);
  if (!Number.isSafeInteger(order) || order < 0) throw new ValidationError('order 必须是非负整数');

  if (input.tags !== undefined && !Array.isArray(input.tags)) throw new ValidationError('tags 必须是字符串数组');
  const tags = [...new Set((input.tags || []).map((tag, index) => requireString(tag, `tags[${index}]`, 40, false)))];
  if (tags.length > 20) throw new ValidationError('tags 最多允许 20 个');

  return {
    format: 'arcadia-item',
    version: 1,
    category: input.category,
    name,
    order,
    author: input.author === undefined ? '' : requireString(input.author, 'author', 80),
    tags,
    entry,
  };
}

export function validateReport(input) {
  requirePlainObject(input, '请求体');
  rejectUnknownKeys(input, ['reason'], '请求体');
  return { reason: requireString(input.reason, 'reason', 300, false) };
}
