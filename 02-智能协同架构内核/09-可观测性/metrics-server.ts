// @ts-nocheck
/**
 * 指标暴露服务（metrics-server）——「09-可观测性」HTTP 端点（v2.7.0，P0 数据面）。
 * 职责：零依赖 node:http 暴露 `GET /metrics`（Prometheus 文本 exposition）与 `GET /healthz`。
 * 边界：只做暴露；指标语义归 family-metrics，抓取与告警归 Prometheus。
 *
 * v2.7.1（验收 L3 闭环）：
 *   - 默认绑定 127.0.0.1（回环），跨机抓取须显式 host='0.0.0.0' 并配置 authToken；
 *   - authToken 启用后 `/metrics` 走 Bearer 鉴权（常量时间比较），`/healthz` 保持免鉴权。
 *
 * 设计约束：
 *   - 零依赖（不引入 express / prom-client），node:http 原生；
 *   - 端口传 0 时由系统分配（测试/多实例场景），句柄回传实际端口；
 *   - 响应头 Content-Type 遵循 Prometheus 文本协议版本 0.0.4。
 */

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

/** 启动选项。 */
export interface MetricsServerOptions {
  /** 指标集：render 为 0.0.4；renderOpenMetrics 提供 OpenMetrics 1.0（可选）。 */
  readonly metrics: { render(): string; renderOpenMetrics?(): string };
  /** 监听端口，默认 9464；0 表示系统随机分配。 */
  readonly port?: number;
  /**
   * 监听地址，默认 127.0.0.1（仅回环，L3 最小暴露原则）。
   * 容器内被 Prometheus 跨机抓取时显式传 '0.0.0.0'，并同时配置 authToken。
   */
  readonly host?: string;
  /**
   * Bearer 令牌（可选）：设置后 `/metrics` 需 `Authorization: Bearer <token>`，
   * 缺失或不匹配返回 401；`/healthz` 保持免鉴权（供存活探针）。
   */
  readonly authToken?: string;
}

/** 常量时间比较（避免令牌长度/前缀时序侧信道）。 */
function tokenMatches(expected, actual) {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 运行句柄。 */
export interface MetricsServerHandle {
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

/**
 * 启动指标暴露服务。
 * 路由：GET /metrics → 文本指标（配置 authToken 时需 Bearer 鉴权）；GET /healthz → "ok"；其余 404。
 */
export async function startMetricsServer(options: MetricsServerOptions): Promise<MetricsServerHandle> {
  const port = options.port ?? 9464;
  const host = options.host ?? '127.0.0.1';
  const authToken = options.authToken;

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('method not allowed');
      return;
    }
    if (req.url === '/metrics') {
      if (authToken) {
        const header = req.headers.authorization;
        const provided = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!tokenMatches(authToken, provided)) {
          res.writeHead(401, {
            'Content-Type': 'text/plain; charset=utf-8',
            'WWW-Authenticate': 'Bearer realm="yyc3-metrics"',
          });
          res.end('unauthorized');
          return;
        }
      }
      // L7：按 Accept 协商 OpenMetrics 1.0（未提供 renderOpenMetrics 时保持 0.0.4）
      const accept = String(req.headers.accept ?? '');
      if (accept.includes('application/openmetrics-text') && typeof options.metrics.renderOpenMetrics === 'function') {
        res.writeHead(200, { 'Content-Type': 'application/openmetrics-text; version=1.0.0; charset=utf-8' });
        res.end(options.metrics.renderOpenMetrics());
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(options.metrics.render());
      return;
    }
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const actualPort = server.address().port;
  return {
    port: actualPort,
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
