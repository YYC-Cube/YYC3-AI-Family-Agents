/**
 * MCP 服务端语义入口（mcp-adapter/server/index）—— P3-MCP。
 * 边界：仅协议方法分派；工具目录由部署侧注入，传输复用上层 stdio。
 */

export * from './protocol.js';
