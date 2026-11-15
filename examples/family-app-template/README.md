# family-app-template · 家族服务最小模板（C1）

三步即插即用：

```bash
cp -R examples/family-app-template my-family && cd my-family   # ① 模板衍生
npm i                                                          # ② 装包（含 bin yyc3-family-server）
cp .env.example .env && npm run selftest                       # ③ 自检（45 技能装载 + 抽样调用）
```

- 确定性臂缺省即用（零密钥）；LLM 语义臂走三闸（`LLM_STEP=1` + 确认串 + 网关 key）。
- 一键衍生：`node scripts/create-family-app.mjs <目标目录>`（根仓脚本，幂等拷贝本模板）。
- host 接入（mcpServers）见根仓《接入与运维指南·完整版》§1.2。
