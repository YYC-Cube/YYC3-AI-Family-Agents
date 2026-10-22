#!/usr/bin/env node
/**
 * 门禁指标推送（push-metrics）—— CI 侧 L2 闭环（v2.7.1）。
 *
 * 职责：把 `ops/observability/pillar-dashboard/metrics.prom` 推送到 Pushgateway，
 *       使 `RegressionGateFailed` / `FivePillarDashboardRed` 两条告警在 CI 语义下可触发。
 * 用法：
 *   PUSHGATEWAY_URL=http://pushgateway:9091 node scripts/push-metrics.mjs
 *   node scripts/push-metrics.mjs --file other.prom --job my-job
 * 行为：未设置 PUSHGATEWAY_URL 时打印跳过原因并 exit 0（本地开发不阻塞）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = process.env.PUSHGATEWAY_URL?.replace(/\/+$/, '');
if (!url) {
  console.log('（跳过）未设置 PUSHGATEWAY_URL，不推送 CI 指标');
  process.exit(0);
}

const file = path.resolve(ROOT, arg('file', 'ops/observability/pillar-dashboard/metrics.prom'));
if (!fs.existsSync(file)) {
  console.error(`❌ 指标文件不存在：${file}（先执行 pnpm regression）`);
  process.exit(1);
}

const job = arg('job', 'yyc3-family-regression-gate');
const body = fs.readFileSync(file, 'utf8');
const target = `${url}/metrics/job/${encodeURIComponent(job)}`;

try {
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
    body,
  });
  if (!res.ok) {
    console.error(`❌ 推送失败：HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`✅ 已推送 ${body.split('\n').filter((l) => l && !l.startsWith('#')).length} 条样本 → ${target}`);
} catch (e) {
  console.error(`❌ 推送异常：${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
