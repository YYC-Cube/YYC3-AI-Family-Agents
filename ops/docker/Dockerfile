# YYC³ AI Family · family-api 多阶段构建骨架（builder → runtime）
# 说明：占位骨架，构建入口与产物路径待工程化联调后固化

# ---- builder 阶段：安装依赖并构建 ----
FROM node:20-alpine AS builder
WORKDIR /app
# 启用 corepack，获得与 package.json#packageManager 一致的 pnpm
RUN corepack enable
# 先拷贝依赖清单以利用 Docker 层缓存
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
# 拷贝源码并构建（占位：build 脚本待补）
COPY . .
RUN pnpm build || echo "[placeholder] build skipped"

# ---- runtime 阶段：最小运行时 ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# 仅携带运行所需产物（占位拷贝，路径待联调对齐）
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
# 团队规范：服务端口自 3030 起
EXPOSE 3030
# CMD 占位：待与 family-api 实际入口对齐
CMD ["node", "dist/index.js"]
