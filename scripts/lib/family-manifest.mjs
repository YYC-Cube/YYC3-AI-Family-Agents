/**
 * 家族契约清单加载与校验（family-manifest）—— 零依赖。
 * 职责：解析 presets/family-manifest.yaml，做结构校验、与 agent.yaml 的漂移比对、
 *       提示词契约校验（P1-T5：版本回写 / CO-STAR 要素 / vars↔占位符）、
 *       并据此构建 8 张 Agent Card。
 * 边界：只读（不写仓库文件）；写入由 scripts/gen-agent-cards.mjs 负责。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseYaml } from './yaml-lite.mjs';

export const MANIFEST_FILE = 'presets/family-manifest.yaml';
export const CARD_DIR = 'assets/agent-cards';
export const CARD_SCHEMA = 'assets/schemas/agent-card.schema.json';

/** 规范性字段（参与漂移判定）。 */
const NORMATIVE = ['编号', '名号', '英文名', '角色', '层级', '层级名称', '所属分组', '支柱', 'provider_chain', '权限'];

/** CO-STAR 七要素标记（蓝图 1206：Identity + Context/Objective/Scope/Task/Audience/Response）。 */
export const COSTAR_MARKERS = ['【身份】', '【背景】', '【目标】', '【范围】', '【任务】', '【受众】', '【响应】'];

/**
 * 从 prompt 源码零依赖提取 PROMPT_META（严格 JSON 对象字面量 + 平衡括号扫描）。
 * @returns {{}} 解析后的元数据；不可提取时返回 { __parseError }
 */
export function extractPromptMeta(source) {
  const marker = 'export const PROMPT_META = ';
  const start = source.indexOf(marker);
  if (start < 0) return { __parseError: '未找到 PROMPT_META 导出' };
  const open = source.indexOf('{', start);
  if (open < 0) return { __parseError: 'PROMPT_META 缺少对象体' };
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(open, i + 1));
        } catch (error) {
          return { __parseError: `PROMPT_META 非 JSON：${error.message}` };
        }
      }
    }
  }
  return { __parseError: 'PROMPT_META 未闭合' };
}

/** 读取并解析清单。 */
export function loadManifest(root) {
  const file = path.join(root, MANIFEST_FILE);
  if (!existsSync(file)) throw new Error(`清单不存在：${MANIFEST_FILE}`);
  return parseYaml(readFileSync(file, 'utf8'));
}

/** 读取某家人的 agent.yaml。 */
export function loadAgentYaml(root, agent) {
  const file = path.join(root, agent.dir, 'agent.yaml');
  if (!existsSync(file)) return null;
  return parseYaml(readFileSync(file, 'utf8'));
}

/** 深度相等（数组/对象/标量）。 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return deepEqual(ka, kb) && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** 座右铭归一：剥离首尾的中文引号（历史模板存在「「」」重复）。 */
function normalizeMotto(text) {
  let value = String(text).trim();
  while (/^[「『]/.test(value) && /[」』]$/.test(value)) value = value.slice(1, -1).trim();
  return value;
}

/** 蓝图参考解析索引：文件名（去 .md）/目录名 → 相对路径。 */
function buildReferenceIndex(root, blueprintDir) {
  const abs = path.join(root, blueprintDir);
  const index = new Map();
  if (!existsSync(abs)) return index;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        index.set(entry.name, path.relative(root, full));
        walk(full);
      } else {
        index.set(entry.name.replace(/\.md$/, ''), path.relative(root, full));
      }
    }
  };
  walk(abs);
  return index;
}

/**
 * 结构校验 + 漂移比对。
 * @returns {{errors: string[], warnings: string[], stats: object}}
 */
export function validateManifest(root, manifest) {
  const errors = [];
  const warnings = [];

  const agents = manifest.agents ?? [];
  const skills = manifest.skills ?? [];
  const byId = new Map();

  // 1) 基础结构
  if (!manifest.manifest?.version) errors.push('manifest.version 缺失');
  const pillarKeys = Object.keys(manifest.pillars ?? {});
  const expectedPillars = ['self', 'knowledge', 'learning', 'governance', 'healing'];
  for (const key of expectedPillars) {
    if (!pillarKeys.includes(key)) errors.push(`pillars 缺少支柱：${key}`);
  }

  // 2) 技能目录
  for (const skill of skills) {
    if (!skill.id) {
      errors.push('存在无 id 的技能条目');
      continue;
    }
    if (byId.has(skill.id)) errors.push(`技能 id 重复：${skill.id}`);
    byId.set(skill.id, skill);
    if (!/^[a-z0-9]+\.[a-z0-9-]+$/.test(skill.id)) errors.push(`技能 id 命名不合规：${skill.id}`);
    if (!/^\d+\.\d+\.\d+$/.test(skill.version ?? '')) {
      errors.push(`技能 ${skill.id} 缺少语义化 version（P3-T1：技能可版本化方可漂移校验与回滚）`);
    }
    if (!['shared', 'dedicated'].includes(skill.scope)) errors.push(`技能 scope 非法：${skill.id}=${skill.scope}`);
    for (const field of ['name', 'description']) {
      if (!skill[field]) errors.push(`技能 ${skill.id} 缺少 ${field}`);
    }
    if (!Array.isArray(skill.tags) || skill.tags.length === 0) errors.push(`技能 ${skill.id} 缺少 tags`);
    if (!Array.isArray(skill.examples) || skill.examples.length === 0) errors.push(`技能 ${skill.id} 缺少 examples`);
    // P3-T1②：steps 执行契约——全部技能必须有非空步骤序列；dedicated 验收口径显式 ≥1 step
    if (!Array.isArray(skill.steps) || skill.steps.length === 0) {
      errors.push(`技能 ${skill.id} 缺少 steps（P3-T1：契约可执行性，dedicated 必须 ≥1 step）`);
    } else {
      if (skill.steps.some((s) => typeof s !== 'string' || !s.trim())) {
        errors.push(`技能 ${skill.id} 存在空步骤（steps 每项须为非空字符串）`);
      }
    }
    // P3-T1②：io 轻校验——声明 io 则 input/output 均须为非空列表（纯描述技能可不声明）
    if (skill.io) {
      for (const dir of ['input', 'output']) {
        const list = skill.io[dir];
        if (!Array.isArray(list) || list.length === 0 || list.some((f) => typeof f !== 'string' || !f.trim())) {
          errors.push(`技能 ${skill.id} 的 io.${dir} 必须为非空字段列表`);
        }
      }
    }
    if (skill.scope === 'dedicated' && !skill.owner) errors.push(`专用技能 ${skill.id} 缺少 owner`);
    if (skill.scope === 'shared' && skill.owner) errors.push(`共用技能 ${skill.id} 不应声明 owner`);
    if (skill.kernel && !existsSync(path.join(root, skill.kernel))) {
      errors.push(`技能 ${skill.id} 的 kernel 锚点不存在：${skill.kernel}`);
    }
  }

  // 3) 家人
  if (agents.length !== 8) errors.push(`家人数量应为 8，实际 ${agents.length}`);
  const names = new Set();
  const slugs = new Set();
  const agentIds = new Set();
  for (const agent of agents) {
    if (!agent.id) errors.push('存在无编号的家人条目');
    if (agentIds.has(agent.id)) errors.push(`家人编号重复：${agent.id}`);
    agentIds.add(agent.id);
    if (names.has(agent.name)) errors.push(`家人名号重复：${agent.name}`);
    names.add(agent.name);
    if (slugs.has(agent.slug)) errors.push(`家人 slug 重复：${agent.slug}`);
    slugs.add(agent.slug);
    if (!existsSync(path.join(root, agent.dir))) errors.push(`家人目录不存在：${agent.dir}`);
    for (const field of ['name', 'en', 'role', 'layer', 'layer_name', 'group', 'motto', 'profile']) {
      if (!agent[field]) errors.push(`家人 ${agent.id} 缺少 ${field}`);
    }
    if (!Array.isArray(agent.provider_chain) || agent.provider_chain.length === 0) {
      errors.push(`家人 ${agent.name} 缺少 provider_chain`);
    }
    const ids = agent.skills ?? [];
    if (ids.length === 0) errors.push(`家人 ${agent.name} 未声明技能`);
    for (const id of ids) {
      const skill = byId.get(id);
      if (!skill) {
        errors.push(`家人 ${agent.name} 引用了不存在的技能：${id}`);
        continue;
      }
      if (skill.scope === 'dedicated' && skill.owner !== agent.id) {
        errors.push(`家人 ${agent.name} 引用了他人专用技能：${id}（owner=${skill.owner}）`);
      }
    }
    const dedicated = skills.filter((s) => s.scope === 'dedicated' && s.owner === agent.id);
    if (dedicated.length === 0) errors.push(`家人 ${agent.name} 未拥有任何专用技能`);
    for (const skill of dedicated) {
      if (!ids.includes(skill.id)) errors.push(`专用技能 ${skill.id} 未被其 owner 声明`);
    }
  }

  // 4) 孤儿技能
  const referenced = new Set(agents.flatMap((a) => a.skills ?? []));
  for (const skill of skills) {
    if (!referenced.has(skill.id)) errors.push(`技能未被任何家人引用（孤儿）：${skill.id}`);
  }

  // 5) 协同矩阵
  const delegation = manifest.delegation ?? {};
  const rows = Object.keys(delegation);
  if (rows.length !== agents.length) errors.push(`协同矩阵行数应为 ${agents.length}，实际 ${rows.length}`);
  let edges = 0;
  for (const [from, targets] of Object.entries(delegation)) {
    if (!names.has(from)) errors.push(`协同矩阵出现未知家人（行）：${from}`);
    for (const [to, purpose] of Object.entries(targets ?? {})) {
      edges += 1;
      if (!names.has(to)) errors.push(`协同矩阵出现未知家人（列）：${from} → ${to}`);
      if (from === to) errors.push(`协同矩阵存在自环：${from}`);
      if (!purpose) errors.push(`协同矩阵缺少委托意图：${from} → ${to}`);
    }
  }
  for (const name of names) {
    if (!rows.includes(name)) errors.push(`协同矩阵缺少家人行：${name}`);
  }

  // 6) 与 agent.yaml 漂移比对（规范性字段）
  const drift = [];
  for (const agent of agents) {
    const yaml = loadAgentYaml(root, agent);
    if (!yaml) {
      errors.push(`无法读取 agent.yaml：${agent.dir}`);
      continue;
    }
    const pairs = {
      编号: agent.id,
      名号: agent.name,
      英文名: agent.en,
      角色: agent.role,
      层级: agent.layer,
      层级名称: agent.layer_name,
      所属分组: agent.group,
      支柱: manifest.pillars,
      provider_chain: agent.provider_chain,
      权限: agent.permissions,
    };
    for (const field of NORMATIVE) {
      if (!deepEqual(yaml[field], pairs[field])) {
        drift.push(`${agent.name}.${field}：agent.yaml=${JSON.stringify(yaml[field])} ↔ manifest=${JSON.stringify(pairs[field])}`);
      }
    }
    if (yaml['座右铭'] && normalizeMotto(yaml['座右铭']) !== normalizeMotto(agent.motto)) {
      warnings.push(`${agent.name}.座右铭 文案差异（非规范性，不计漂移）`);
    }
  }
  errors.push(...drift);

  // 7) 蓝图参考可达性（警告级：docs 可缺）
  const refIndex = buildReferenceIndex(root, manifest.manifest?.blueprint ?? '');
  for (const skill of skills) {
    for (const ref of skill.references ?? []) {
      if (refIndex.size === 0) continue;
      if (!refIndex.has(ref)) warnings.push(`技能 ${skill.id} 的蓝图参考未找到：${ref}`);
    }
  }

  // 8) 提示词契约（P1-T5）：版本回写 + CO-STAR 要素 + vars↔占位符双向对齐
  const prompts = manifest.prompts ?? [];
  if (prompts.length === 0) errors.push('prompts 提示词契约段缺失（P1-T5）');
  const promptIds = new Set();
  const agentById = new Map(agents.map((a) => [a.id, a]));
  for (const entry of prompts) {
    if (!entry.id) {
      errors.push('存在无 id 的提示词条目');
      continue;
    }
    if (promptIds.has(entry.id)) errors.push(`提示词 id 重复：${entry.id}`);
    promptIds.add(entry.id);
    if (!/^[a-z0-9]+\.[a-z0-9-]+$/.test(entry.id)) errors.push(`提示词 id 命名不合规：${entry.id}`);
    if (!agentById.has(entry.owner)) errors.push(`提示词 ${entry.id} 的 owner 未知：${entry.owner}`);
    if (!/^\d+\.\d+\.\d+$/.test(entry.version ?? '')) errors.push(`提示词 ${entry.id} 版本号不合规：${entry.version}`);
    const file = entry.file ?? '';
    if (!/^family-agents\/(business|core)-layer\/member-[a-z]+\/prompts\/[a-z0-9-]+\.prompt\.ts$/.test(file)) {
      errors.push(`提示词 ${entry.id} 文件路径不合规：${file}`);
      continue;
    }
    const abs = path.join(root, file);
    if (!existsSync(abs)) {
      errors.push(`提示词 ${entry.id} 文件不存在：${file}`);
      continue;
    }
    const source = readFileSync(abs, 'utf8');
    const meta = extractPromptMeta(source);
    if (meta.__parseError) {
      errors.push(`提示词 ${entry.id} 提取 PROMPT_META 失败：${meta.__parseError}`);
      continue;
    }
    if (meta.id !== entry.id) errors.push(`提示词 id 漂移：file=${meta.id} ↔ manifest=${entry.id}`);
    if (meta.version !== entry.version) {
      errors.push(`提示词版本漂移：${entry.id} file=${meta.version} ↔ manifest=${entry.version}`);
    }
    const templateMatch = source.match(/export const [A-Z_]+_PROMPT = `([\s\S]*?)`;/);
    const template = templateMatch?.[1] ?? '';
    for (const marker of COSTAR_MARKERS) {
      if (!template.includes(marker)) errors.push(`提示词 ${entry.id} 缺少 CO-STAR 要素 ${marker}`);
    }
    const declared = new Set((meta.vars ?? []).map((v) => v.name));
    const used = new Set([...template.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]));
    for (const name of declared) {
      if (!used.has(name)) errors.push(`提示词 ${entry.id} 声明了未使用的变量：${name}`);
    }
    for (const name of used) {
      if (!declared.has(name)) errors.push(`提示词 ${entry.id} 使用了未声明的占位符：{{${name}}}`);
    }
    const os = meta.outputSchema;
    if (!os || os.type !== 'object' || !Array.isArray(os.required) || os.required.length === 0) {
      errors.push(`提示词 ${entry.id} 的 outputSchema 缺失或不含必填字段`);
    }
    if (meta.blueprint && refIndex.size > 0 && !refIndex.has(meta.blueprint)) {
      warnings.push(`提示词 ${entry.id} 的蓝图参考未找到：${meta.blueprint}`);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      agents: agents.length,
      skills: skills.length,
      shared: skills.filter((s) => s.scope === 'shared').length,
      dedicated: skills.filter((s) => s.scope === 'dedicated').length,
      prompts: prompts.length,
      delegationEdges: edges,
      drift: drift.length,
      planned: skills.filter((s) => s.status === 'planned').length,
    },
  };
}

/** 构建 8 张 Agent Card（不落盘）。 */
export function buildCards(manifest) {
  const byId = new Map((manifest.skills ?? []).map((s) => [s.id, s]));
  const protocol = manifest.protocol ?? {};
  const baseUrl = protocol.a2a?.base_url ?? 'https://matrix.yyc3.top/family';
  const provider = manifest.provider ?? { organization: 'YanYuCloudCube', url: 'https://yyc3.top' };
  const version = manifest.manifest?.version ?? '1.0.0';

  return (manifest.agents ?? []).map((agent) => {
    const skills = (agent.skills ?? []).map((id) => {
      const skill = byId.get(id);
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        tags: skill.tags,
        examples: skill.examples,
      };
    });
    return {
      file: `${agent.slug}.json`,
      card: {
        $schema: '../schemas/agent-card.schema.json',
        agentCard: {
          name: `${agent.name} (${agent.en})`,
          description: `YYC³ AI Family ${agent.role} — ${agent.profile}`,
          url: `${baseUrl}/${agent.slug}`,
          version,
          provider: { organization: provider.organization, url: provider.url },
          capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
          skills,
          defaultInputModes: ['text', 'structured'],
          defaultOutputModes: ['text', 'structured'],
          authentication: { schemes: ['bearer_token', 'api_key'], required: true },
          security: { tlsRequired: true, signedAgentCard: false, rbacRoles: ['admin', 'operator', 'viewer'] },
          slo: {
            latency: { p50: '500ms', p95: '2s', p99: '5s' },
            availability: '99.9%',
            errorRate: '<0.5%',
          },
          yyc3: {
            id: agent.id,
            layer: agent.layer,
            layerName: agent.layer_name,
            group: agent.group,
            motto: agent.motto,
            pillars: manifest.pillars,
            providerChain: agent.provider_chain,
            manifestVersion: version,
          },
        },
      },
    };
  });
}
