// @ts-nocheck
/**
 * 本地 stdio 传输（stdio-transport）—— P1-T3。
 * 职责：以子进程 stdin/stdout 承载 MCP JSON-RPC 2.0（换行分帧）。
 * 边界：只做分帧、请求-响应关联、错误上报与优雅关闭；不解析业务语义。
 *
 * 约定：
 * - 每条消息一行 JSON（`\n` 分帧，容忍 `\r\n`）；
 * - 带 `id` 且含 `result` / `error` 的消息视为响应，按 id 关联到挂起请求；
 * - 其余消息交给 onMessage（如服务端通知）；
 * - 单行超限、JSON 解析失败、子进程异常退出 → onError（不抛出到调用方）。
 */

import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type {
  McpMessageHandler,
  McpStderrHandler,
  McpTransport,
  StdioTransportOptions,
} from './types.js';

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** stdio 传输实现。 */
export class StdioMcpTransport implements McpTransport {
  readonly kind = 'stdio';
  readonly pid: number | undefined;

  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly messageHandlers = new Set<McpMessageHandler>();
  private readonly errorHandlers = new Set<(error: Error) => void>();
  private readonly stderrHandlers = new Set<McpStderrHandler>();
  private readonly requestTimeoutMs: number;
  private readonly maxLineBytes: number;
  private readonly shutdownGraceMs: number;
  private readonly exited: Promise<void>;
  private buffer = '';
  private seq = 0;
  private closing = false;
  private closed = false;

  constructor(options: StdioTransportOptions) {
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 5_000);
    this.maxLineBytes = Math.max(1_024, options.maxLineBytes ?? 1_048_576);
    this.shutdownGraceMs = Math.max(0, options.shutdownGraceMs ?? 1_000);

    this.child = spawn(options.command, [...(options.args ?? [])], {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.pid = this.child.pid;

    this.exited = new Promise<void>((resolve) => {
      this.child.once('exit', (code, signal) => {
        if (!this.closing) {
          this.failAll(new Error(`MCP 子进程退出（code=${String(code)} signal=${String(signal)}）`));
        }
        resolve();
      });
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.consume(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => this.emitStderr(chunk));
    this.child.on('error', (error: Error) => this.failAll(error));
  }

  /** 发送一条消息。 */
  send(message: unknown): void {
    if (this.closed) throw new Error('MCP 传输已关闭，无法发送');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  /** 发起请求并按 id 等待响应。 */
  request(method: string, params?: unknown, timeoutMs = this.requestTimeoutMs): Promise<unknown> {
    this.seq += 1;
    const id = this.seq;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时：${method}（${timeoutMs}ms）`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send(params === undefined ? { jsonrpc: '2.0', id, method } : { jsonrpc: '2.0', id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  onMessage(handler: McpMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onStderr(handler: McpStderrHandler): () => void {
    this.stderrHandlers.add(handler);
    return () => this.stderrHandlers.delete(handler);
  }

  /** 优雅关闭：结束 stdin → 等待退出（宽限期后 SIGTERM）。 */
  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.rejectAll(new Error('MCP 传输已关闭'));

    this.child.stdin.end();
    const grace = new Promise<void>((resolve) => setTimeout(resolve, this.shutdownGraceMs));
    await Promise.race([this.exited, grace]);

    if (this.child.exitCode === null && !this.child.killed) this.child.kill('SIGTERM');
    this.closed = true;
  }

  /** 分帧：按换行切分并逐行处理。 */
  private consume(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      if (line.trim() !== '') this.handleLine(line);
      index = this.buffer.indexOf('\n');
    }
    if (this.buffer.length > this.maxLineBytes) {
      this.buffer = '';
      this.emitError(new Error(`MCP 单行超过 ${this.maxLineBytes} 字节上限，缓冲已重置`));
    }
  }

  private handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.emitError(new Error(`MCP 消息解析失败：${error instanceof Error ? error.message : String(error)}`));
      return;
    }
    if (isResponse(message)) {
      const pending = this.pending.get(Number(message.id));
      if (!pending) return; // 迟到的响应：丢弃，不影响总线
      this.pending.delete(Number(message.id));
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(`MCP 错误 ${message.error.code}：${message.error.message}`));
      } else {
        pending.resolve(message.result ?? null);
      }
      return;
    }
    for (const handler of [...this.messageHandlers]) handler(message);
  }

  private emitError(error: Error): void {
    for (const handler of [...this.errorHandlers]) handler(error);
  }

  private emitStderr(chunk: string): void {
    for (const line of chunk.split('\n')) {
      if (line.trim() === '') continue;
      for (const handler of [...this.stderrHandlers]) handler(line);
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private failAll(error: Error): void {
    this.rejectAll(error);
    this.emitError(error);
  }
}

interface JsonRpcResponseLike {
  readonly jsonrpc?: unknown;
  readonly id: string | number;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

function isResponse(value: unknown): value is JsonRpcResponseLike {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const hasId = typeof record.id === 'string' || typeof record.id === 'number';
  return hasId && ('result' in record || 'error' in record);
}
