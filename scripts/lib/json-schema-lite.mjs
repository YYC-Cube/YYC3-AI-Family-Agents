/**
 * JSON Schema 子集校验器（json-schema-lite）—— 零依赖。
 * 职责：校验 assets/schemas 下的契约（agent-card.schema.json）与生成物。
 * 边界：只支持本仓自用子集——type / required / properties / additionalProperties(false)
 *       / items / enum / const / minLength / pattern / minimum / maximum / $ref(#/$defs/*)。
 *       不支持外部 $ref、oneOf/anyOf/allOf、format 语义校验。
 */

/** 解析本地引用 `#/$defs/Name`。 */
function deref(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`不支持的外部引用：${ref}`);
  return ref
    .slice(2)
    .split('/')
    .reduce((node, key) => (node == null ? node : node[key]), root);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** 校验并返回错误列表（空数组即通过）。 */
export function validate(schema, value, root = schema, path = '$') {
  const errors = [];
  if (schema.$ref) {
    return validate(deref(schema.$ref, root), value, root, path);
  }

  if (schema.type) {
    const actual = typeOf(value);
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.includes(actual)) {
      errors.push(`${path}: 期望类型 ${expected.join('|')}，实际 ${actual}`);
      return errors;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: 期望常量 ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: 取值 ${JSON.stringify(value)} 不在枚举 ${JSON.stringify(schema.enum)} 内`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: 长度 ${value.length} < ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: 不匹配模式 ${schema.pattern}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: < ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: > ${schema.maximum}`);
  }

  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: 缺少必填字段 ${key}`);
    }
    const props = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (props[key]) {
        errors.push(...validate(props[key], child, root, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: 不允许的额外字段 ${key}`);
      }
    }
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: 元素数 ${value.length} < ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validate(schema.items, item, root, `${path}[${index}]`));
      });
    }
  }

  return errors;
}

export default validate;
