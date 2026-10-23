/**
 * family-communication-bus（家族通信总线）入口（barrel）。
 * 职责：家族**内部**事件路由 + 链路追踪 + MCP 适配器。
 * 与 MCP 协议层为**适配器关系**：MCP 为对外模型/工具接入标准，本总线为家族内部事件总线。
 */

export * from './event-bus.js';
export * from './trajectory-bridge.js';
