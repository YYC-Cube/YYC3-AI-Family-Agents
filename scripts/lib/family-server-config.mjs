/**
 * 家族服务配置装配（family-server-config · 部署侧 IO 共享件）—— H5 修复伴随抽取。
 * 职责：读取部署资产（assets/mcp-tools.json 工具目录 + presets/family-manifest.yaml
 *       技能清单）与环境三闸，组装 FamilyServerConfig——仓内运行器
 *       （start-family-server.mjs）与 npm 包 bin（config-loader.mjs 随包分发副本）
 *       共用同一装配逻辑，杜绝两处漂移。
 * 用法：const { config, llmEnvInject } = buildFamilyServerConfig(root, { selftestLlm? });
 * 环境：YYC3_METRICS_PORT / YYC3_METRICS_HOST / YYC3_METRICS_TOKEN / YYC3_ADMISSION_MODE
 *       （observe|enforce，默认 observe）；计量 YYC3_USAGE_FILE / _FLUSH_EVERY / _PERSIST；
 *       LLM 三闸 LLM_STEP=1 + LLM_STEP_CONFIRM + 密钥（env → ~/.yyc3-keybackup/zhipu.env
 *       → 仓内 .env 兜底）；E0a provider 档 zhipu|openai|local（LLM_STEP_PROVIDER）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseYaml } from './yaml-lite.mjs';

export function buildFamilyServerConfig(root, opts = {}) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/mcp-tools.json'), 'utf8'));
  const manifest = parseYaml(fs.readFileSync(path.join(root, 'presets/family-manifest.yaml'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  if (!Array.isArray(catalog.tools) || catalog.tools.length === 0) throw new Error('工具目录为空：assets/mcp-tools.json');
  if (!Array.isArray(manifest.skills) || manifest.skills.length === 0) throw new Error('技能清单为空：presets/family-manifest.yaml');

  const config = {
    serverInfo: { name: 'yyc3-family', version: pkg.version },
    tools: catalog.tools,
    manifestEntries: manifest.skills,
    admission: {
      allowed: ['family-core'],
      mode: process.env.YYC3_ADMISSION_MODE === 'enforce' ? 'enforce' : 'observe',
    },
    metricsServer: {
      port: Number(process.env.YYC3_METRICS_PORT ?? 9464),
      host: process.env.YYC3_METRICS_HOST ?? '127.0.0.1',
      ...(process.env.YYC3_METRICS_TOKEN ? { authToken: process.env.YYC3_METRICS_TOKEN } : {}),
    },
  };

  // HTTP 常驻传输（P1-A3）：YYC3_HTTP_PORT 配置即启用（与 stdio 并存，同一 handler）
  if (process.env.YYC3_HTTP_PORT) {
    config.httpServer = {
      port: Number(process.env.YYC3_HTTP_PORT),
      host: process.env.YYC3_HTTP_HOST ?? '127.0.0.1',
    };
  }

  // 计量持久化（M41 · 缺省启用 · YYC3_USAGE_PERSIST=0 关闭）：跨进程累计口径
  // （stdio 生命周期计数器随进程清零的结构性缺口由此补齐——观察窗判据量具）
  if (process.env.YYC3_USAGE_PERSIST !== '0') {
    config.usagePersist = {
      file: process.env.YYC3_USAGE_FILE ?? 'data/metrics-usage.json',
      flushEvery: Number(process.env.YYC3_USAGE_FLUSH_EVERY ?? 5),
    };
  }

  // 外部家人 A2A 编排（M22）：存在实例契约即自动装配（端点/能力/令牌环境变量）
  try {
    const inst = parseYaml(fs.readFileSync(path.join(root, 'presets/external-worker/blueprint-13.worker.yaml'), 'utf8'));
    if (inst?.worker?.endpoint) {
      config.external = {
        endpoint: inst.worker.endpoint,
        ...(inst.worker.auth?.token_env ? { tokenEnv: inst.worker.auth.token_env } : {}),
        ...(inst.worker.timeout_ms ? { timeoutMs: inst.worker.timeout_ms } : {}),
        ...(Array.isArray(inst.worker.capabilities) ? { skills: inst.worker.capabilities } : {}),
      };
      console.error(`ⓔ 外部家人编排：${inst.worker.id ?? 'external'} @ ${inst.worker.endpoint}（实例契约自动装配）`);
    }
  } catch { /* 无实例：外部编排保持关闭 */ }

  // LLM 语义执行臂（M16）三闸门控（同 uat:llm 范式）：缺一保持确定性臂。
  // --selftest:llm（M17）额外要求三闸 + 密钥齐备（env 或 .env），否则跳过 LLM 采样 exit 0。
  // E0a：provider 档支持 zhipu | openai | local（LLM_STEP_PROVIDER，缺省按 key 判定）；
  //      密钥兜底顺序：env → ~/.yyc3-keybackup/zhipu.env（600 · 真值唯一存放地）→ 仓内 .env（兼容旧布置）。
  // E0c：max_tokens / timeout_ms 自 configs/base.yaml llm.providers.<档> 注入（思考型档位建议 max_tokens 3072）。
  const selftestLlm = Boolean(opts.selftestLlm);
  let baseLlmProviders = {};
  try {
    baseLlmProviders = parseYaml(fs.readFileSync(path.join(root, 'configs', 'base.yaml'), 'utf8'))?.llm?.providers ?? {};
  } catch { /* 无 base.yaml */ }
  const llmEnvInject = {};
  const keyBackupEnv = path.join(os.homedir(), '.yyc3-keybackup', 'zhipu.env');
  const llmKeyEnv =
    process.env.ZHIPU_API_KEY?.trim() ? 'ZHIPU_API_KEY'
    : process.env.OPENAI_API_KEY?.trim() ? 'OPENAI_API_KEY'
    : process.env.LOCAL_GATEWAY_API_KEY?.trim() ? 'LOCAL_GATEWAY_API_KEY'
    : null;
  let llmKeyed = Boolean(llmKeyEnv);
  if (!llmKeyed) {
    // keybackup 兜底（密钥服务读取；只透传给子进程，不打印值）
    try {
      const kb = fs.readFileSync(keyBackupEnv, 'utf8');
      const m = kb.match(/^(ZHIPU_API_KEY|OPENAI_API_KEY|LOCAL_GATEWAY_API_KEY)=(.+)$/m);
      if (m && m[2].trim()) {
        llmKeyed = true;
        llmEnvInject[m[1]] = m[2].trim();
      }
    } catch { /* 无 keybackup */ }
  }
  if (!llmKeyed) {
    // .env 兜底（兼容旧布置；E0a 后真值应只在 keybackup）
    try {
      const dotenv = fs.readFileSync(path.join(root, '.env'), 'utf8');
      const m = dotenv.match(/^(ZHIPU_API_KEY|OPENAI_API_KEY)=(.+)$/m);
      if (m && m[2].trim()) {
        llmKeyed = true;
        llmEnvInject[m[1]] = m[2].trim();
      }
    } catch { /* 无 .env */ }
  }
  const llmGated = process.env.LLM_STEP === '1' && process.env.LLM_STEP_CONFIRM === '我知晓真实计费' && llmKeyed;
  if (llmGated) {
    const requested = process.env.LLM_STEP_PROVIDER ?? '';
    let provider;
    let apiKeyEnv = llmKeyEnv ?? 'ZHIPU_API_KEY';
    if (requested === 'local') {
      // E0a 本地网关档：第三闸 = 网关 key 环境变量存在（本地推理也计自家 GPU 折旧）
      provider = 'local';
      apiKeyEnv = process.env.LLM_LOCAL_KEY_ENV ?? 'LOCAL_GATEWAY_API_KEY';
      if (!process.env[apiKeyEnv]?.trim() && !llmEnvInject[apiKeyEnv]?.trim()) {
        console.error(`ⓔ local 档缺网关 key（${apiKeyEnv}），保持确定性臂`);
        provider = '';
      }
    } else if (requested === 'openai' || requested === 'zhipu') {
      provider = requested;
    } else {
      provider = llmKeyEnv === 'OPENAI_API_KEY' || (!llmKeyEnv && Object.keys(llmEnvInject)[0] === 'OPENAI_API_KEY') ? 'openai' : 'zhipu';
    }
    if (provider) {
      const profile = baseLlmProviders[provider] ?? {};
      config.llm = {
        provider,
        ...(process.env.LLM_STEP_MODEL || profile.model ? { model: process.env.LLM_STEP_MODEL ?? profile.model } : {}),
        ...(process.env.LLM_STEP_BASE_URL || profile.base_url
          ? { baseUrl: process.env.LLM_STEP_BASE_URL ?? profile.base_url }
          : {}),
        ...(profile.max_tokens !== undefined ? { maxTokens: profile.max_tokens } : {}),
        ...(profile.timeout_ms !== undefined ? { timeoutMs: profile.timeout_ms } : {}),
        ...(provider === 'local' ? { apiKeyEnv } : {}),
      };
      console.error(`ⓔ LLM 语义执行臂：三闸放行，已启用（${provider} 档 · 真实计费调用）`);
    }
  } else if (selftestLlm) {
    console.error('ⓔ LLM 自检：三闸不全（需 LLM_STEP=1 + LLM_STEP_CONFIRM=我知晓真实计费 + API Key），跳过 LLM 采样');
  } else if (process.env.LLM_STEP === '1') {
    console.error('ⓔ LLM 语义执行臂：三闸不全，保持确定性臂');
  }

  return { config, llmEnvInject };
}
