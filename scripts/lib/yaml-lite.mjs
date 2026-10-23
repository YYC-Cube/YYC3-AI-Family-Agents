/**
 * YAML 子集解析器（yaml-lite）—— 零依赖。
 * 职责：解析家族契约文件（agent.yaml / family-manifest.yaml）所需的 YAML 子集。
 * 边界：**不支持**锚点/别名、块标量（| / >）、多文档（---）、流式集合（[] / {}）。
 *       需要这些特性时，请改用标准库而非本文件。
 *
 * 支持：
 *   - 注释行与行尾注释（引号内的 # 不被视为注释）
 *   - 缩进嵌套映射：`key:` + 更深缩进
 *   - 块列表：`- value`
 *   - 列表内联映射首行：`- key: value`
 *   - 标量：双引号 / 单引号 / 数字 / true / false / null / 纯文本
 */

/** 去掉行尾注释（引号感知）。 */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/** 词法：过滤空行/纯注释行，保留缩进与内容。 */
function tokenize(text) {
  const tokens = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const stripped = stripComment(raw);
    if (!stripped.trim()) continue;
    const indent = stripped.length - stripped.trimStart().length;
    tokens.push({ indent, text: stripped.trim() });
  }
  return tokens;
}

/** 解析标量。 */
function parseScalar(text) {
  const value = text.trim();
  if (value === '') return null;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  // 流式列表：[a, b, c]（不含嵌套）
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => parseScalar(item.trim()));
  }
  return value;
}

/** 拆分 `key: value`（引号感知，只取首个分隔符）。 */
function splitPair(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ':' && (i === text.length - 1 || text[i + 1] === ' ')) {
      return { key: text.slice(0, i).trim(), value: text.slice(i + 1).trim() };
    }
  }
  return null;
}

/** 解析 YAML 子集文本。 */
export function parseYaml(text) {
  const tokens = tokenize(text);
  let cursor = 0;

  function parseBlock(indent) {
    if (tokens[cursor].text.startsWith('- ')) return parseList(indent);
    return parseMap(indent);
  }

  function parseMap(indent) {
    const map = {};
    while (cursor < tokens.length && tokens[cursor].indent === indent) {
      const token = tokens[cursor];
      if (token.text.startsWith('- ')) break;
      const pair = splitPair(token.text);
      if (!pair) throw new Error(`无法解析的映射行：${token.text}`);
      cursor += 1;
      if (pair.value !== '') {
        map[pair.key] = parseScalar(pair.value);
      } else if (cursor < tokens.length && tokens[cursor].indent > indent) {
        map[pair.key] = parseBlock(tokens[cursor].indent);
      } else {
        map[pair.key] = null;
      }
    }
    return map;
  }

  function parseList(indent) {
    const list = [];
    while (cursor < tokens.length && tokens[cursor].indent === indent && tokens[cursor].text.startsWith('- ')) {
      const itemIndent = tokens[cursor].indent;
      let rest = tokens[cursor].text.slice(2).trim();
      cursor += 1;
      const pair = splitPair(rest);
      if (!pair) {
        list.push(parseScalar(rest));
        continue;
      }
      const entry = {};
      if (pair.value !== '') {
        entry[pair.key] = parseScalar(pair.value);
      } else if (cursor < tokens.length && tokens[cursor].indent > itemIndent) {
        entry[pair.key] = parseBlock(tokens[cursor].indent);
      } else {
        entry[pair.key] = null;
      }
      // 同一列表项的后续兄弟键（缩进大于列表缩进）
      while (cursor < tokens.length && tokens[cursor].indent > itemIndent && !tokens[cursor].text.startsWith('- ')) {
        const siblingIndent = tokens[cursor].indent;
        Object.assign(entry, parseMap(siblingIndent));
      }
      list.push(entry);
      rest = null;
    }
    return list;
  }

  if (tokens.length === 0) return {};
  return parseBlock(tokens[0].indent);
}

export default parseYaml;
