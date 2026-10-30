# 明日菜单

面向单个家庭的手机优先晚餐排程应用。它读取最近一周已确认菜单，让 AI 从现有菜库中选出两道荤菜和一道素菜（可按设置额外配一道汤），并在确认后按食材 ID 确定性生成采购清单。换菜、加菜和减菜可以自由调整菜品数量与荤素结构。

## 本地启动

要求 Node.js 20.12+ 和 npm。

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 <http://localhost:3000>。首次启动会自动建表、导入 180 道菜和少量演示历史。默认使用内嵌 PGlite，数据保存在 `.data/pglite`，不需要安装数据库。

AI 是可选项。在 `.env.local` 中填写 OpenAI 兼容服务的 `AI_API_KEY` 和 `AI_MODEL`；不填时应用使用本地规则生成合法菜单。`AI_BASE_URL` 默认是 `https://api.openai.com/v1`，也可指向其他兼容 `/chat/completions` 的服务。

## 常用命令

```bash
npm run dev        # 开发服务器
npm run typecheck  # TypeScript 检查
npm test           # Vitest 测试
npm run build      # 生产构建
npm start          # 启动生产构建
npm run db:seed    # 手动执行迁移和初始数据导入
```

## 数据库

不设置 `DATABASE_URL` 时使用 PGlite，适合本地开发和单机运行。PGlite 不是 Vercel 等无状态平台的持久存储，正式部署必须连接托管 Postgres。

本地 Postgres 可用 Docker 启动：

```bash
docker compose up -d
# .env.local 中设置：
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mingri_menu
npm run db:seed
```

应用启动时会自动执行幂等迁移和种子导入。种子不会覆盖家庭后续修改的菜单、菜库或设置。

## 部署

- 设置 `DATABASE_URL` 指向持久化 Postgres，并设置独立的 `FAMILY_ID`、`FAMILY_NAME`、`FAMILY_TIMEZONE`。
- 不要把 `AI_API_KEY` 放进 `NEXT_PUBLIC_*` 变量；本项目只在服务端读取它。
- 生产环境建议设置随机 `IP_HASH_SALT`，并检查 AI 与写操作的每日限额。
- 先运行 `npm run build`，再用 `npm start` 启动。数据库需能从部署环境访问。
- 应用按单家庭、无登录实例设计。链接持有者都能查看和修改，部署后不要公开索引或随意转发。

## 主要能力

- 安排页：AI 生成、选菜换菜、随机换菜、自由加减菜、组合提示、确认、AI 判断依据。
- 菜库：180 道内置菜且均有完整食材表；其中 167 道进入推荐池，13 道非推荐池菜品仅供查阅。支持搜索筛选、停用、自定义菜、食材校正和 AI 食材草稿确认。
- 清单：只读取已确认菜单，按食材去重并排除常备食材，逐项标注用途菜品，可勾选和复制。
- 设置：常备食材、忌口、重复天数、辣度上限、是否额外配汤、JSON 导入导出。
- 历史：已确认菜单、来源与手动调整标记、跳转到当天采购清单。

规格文档位于 `docs/superpowers/specs/2026-10-28-online-ai-dinner-planner-design.md`。
