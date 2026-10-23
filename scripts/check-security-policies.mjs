#!/usr/bin/env node
/**
 * 安全策略映射校验（check-security-policies · P2-T4）—— 零依赖。
 *
 * 职责：presets/policies/security.yaml 结构校验——
 *   id 命名（security.* 子域）/ version 语义化 / mode 枚举（observe|enforce，默认 observe）/
 *   rule 非空 / scope 合法（actions|resources|wildcard 至少一维）/ source 锚点。
 *   --json 输出解析后的策略数组，供内核套件消费（同一事实源）。
 *
 * 用法：node scripts/check-security-policies.mjs [--root <dir>] [--file <yaml>] [--json]
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './lib/yaml-lite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICIES_FILE = 'presets/policies/security.yaml';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const fileIdx = args.indexOf('--file');
const rootIdx = args.indexOf('--root');
const root = rootIdx >= 0 ? path.resolve(args[rootIdx + 1]) : ROOT;
const file = fileIdx >= 0 ? path.resolve(args[fileIdx + 1]) : path.join(root, POLICIES_FILE);

const errors = [];
const warnings = [];

if (!existsSync(file)) {
  errors.push(`策略文件不存在：${path.relative(root, file)}`);
}

const policies = [];
if (errors.length === 0) {
  const doc = parseYaml(readFileSync(file, 'utf8'));
  const list = doc?.policies;
  if (!Array.isArray(list) || list.length === 0) {
    errors.push('policies 段缺失或为空');
  } else {
    const seen = new Set();
    for (const p of list) {
      if (!p.id) {
        errors.push('存在无 id 的策略条目');
        continue;
      }
      if (seen.has(p.id)) errors.push(`策略 id 重复：${p.id}`);
      seen.add(p.id);
      if (!/^security\.[a-z0-9-]+$/.test(p.id)) errors.push(`策略 id 命名不合规（security.*）：${p.id}`);
      if (!/^\d+\.\d+\.\d+$/.test(String(p.version ?? ''))) errors.push(`策略 ${p.id} 缺少语义化 version`);
      const mode = p.mode ?? 'observe';
      if (!['observe', 'enforce'].includes(mode)) errors.push(`策略 ${p.id} mode 非法（observe|enforce）：${mode}`);
      if (!p.rule) errors.push(`策略 ${p.id} 缺少 rule 表达式名`);
      const scope = p.scope ?? {};
      const dims = ['actions', 'resources'].filter((k) => Array.isArray(scope[k]) && scope[k].length > 0);
      if (dims.length === 0 && scope.wildcard !== true) {
        errors.push(`策略 ${p.id} scope 缺少作用维度（actions|resources|wildcard）`);
      }
      for (const dim of dims) {
        if (!scope[dim].every((v) => typeof v === 'string' && v.length > 0)) {
          errors.push(`策略 ${p.id} scope.${dim} 含非字符串项`);
        }
      }
      if (scope.wildcard !== true && scope.wildcard !== undefined && typeof scope.wildcard !== 'boolean') {
        errors.push(`策略 ${p.id} scope.wildcard 须为布尔`);
      }
      if (mode === 'enforce') {
        warnings.push(`策略 ${p.id} 为 enforce（显式拦截开关，改动须评审）`);
      }
      policies.push({ id: p.id, version: String(p.version), mode, rule: String(p.rule ?? ''), scope, source: p.source ? String(p.source) : undefined });
    }
  }
}

const result = { ok: errors.length === 0, file: path.relative(root, file), policies, warnings, errors };

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('🛡 安全策略映射校验（presets/policies/security.yaml · P2-T4）');
  console.log(`   · 策略：${policies.length} 条（observe ${policies.filter((p) => p.mode === 'observe').length} · enforce ${policies.filter((p) => p.mode === 'enforce').length}）`);
  for (const w of warnings) console.log(`   ⚠ ${w}`);
  for (const e of errors) console.log(`   ❌ ${e}`);
  console.log(result.ok ? '✅ 安全策略映射校验通过' : '❌ 安全策略映射校验失败');
}

process.exit(result.ok ? 0 : 1);
