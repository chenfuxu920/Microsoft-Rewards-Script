# AGENTS.md

本仓库是 [TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script) 的中文本地化 fork。**所有日志、代码注释、commit message 均使用中文**；与用户沟通也用中文。当前默认分支为 `main`（非上游的 `v3`）。

## 必读：运行时配置文件路径陷阱

`src/util/Load.ts` 用 `path.join(__dirname, '../', ...)` 定位 `accounts.json` / `config.json`，所以**读取位置取决于运行模式**：

| 模式 | 命令 | `__dirname` | 实际读取 |
|------|------|-------------|----------|
| 构建 | `npm start` → `node dist/index.js` | `dist/util/` | `dist/accounts.json`、`dist/config.json` |
| 开发 | `npm run ts-start` / `npm run dev` | `src/util/` | `src/accounts.json`、`src/config.json` |
| 开发+`-dev` | `npm run dev` | `src/util/` | `src/accounts.dev.json`、`src/config.json` |

- `tsc` 会把 `src/*.json` 复制到 `dist/*.json`（`tsconfig.json` 的 `include` 显式列出了这些 json）。
- **改完 `src/config.json` 必须重新 `npm run build`**，否则 `npm start` 仍读旧的 `dist/config.json`。
- `loadConfig()` 有模块级 `configCache`，进程内不会重读。
- `.gitignore` 忽略 `src/accounts.json` 与 `src/config.json`（含密钥），仅 `*.example.json` 入库；`dist/` 整体被忽略。

## 浏览器引擎：patchright（不是 playwright）

依赖是 `patchright`（反检测分支），**不是** playwright。安装命令：

```bash
npm run pre-build   # = npm i && rimraf dist && npx patchright install chromium
npm run build       # = rimraf dist && tsc
npm start           # = node ./dist/index.js
```

`pre-build` 必须在首次或清空后跑一次以安装 chromium。`PLAYWRIGHT_BROWSERS_PATH` / `PATCHRIGHT_BROWSERS_PATH` 同时需要设置（Dockerfile 与 compose 均已配置）。

Node >= 24 强制要求，`src/util/Validator.ts` 的 `checkNodeVersion()` 在启动时校验，不满足直接 `exit(1)`。

## 两个 docker compose 文件（别混用）

| 文件 | 镜像 | 配置注入方式 |
|------|------|--------------|
| `compose.yaml` | 拉取 `ghcr.io/thenetsky/...:latest` | 用 `ACCOUNT_*` / `CONFIG_*` 环境变量，首次运行在 `./config/` 自动生成 `accounts.json`/`config.json`，挂载到 `dist/config` |
| `docker-compose.yml` | `build: .` 本地构建 | 直接把 `./src/accounts.json`、`./src/config.json` 只读挂载进 `dist/`，并挂 `./sessions`、`./diagnostics`、`./logs`，带内存/CPU 限制与 `shm_size: 2gb` |

两个文件的挂载路径不同，改挂载时务必同步 `entrypoint.sh` 检查的是 `dist/accounts.json`。

## Docker 运行流程（非长驻进程）

容器入口：`entrypoint.sh` → 启动 `cron` 守护 → 按 `CRON_SCHEDULE` 触发 `scripts/docker/run_daily.sh` → `npm start`。

- `run_daily.sh` 有锁文件 `/tmp/run_daily.lock`、随机休眠（`MIN/MAX_SLEEP_MINUTES`，`SKIP_RANDOM_SLEEP=true` 跳过）、`timeout` 超时保护（`STUCK_PROCESS_TIMEOUT_HOURS`，默认 8h）、残留进程清理（`pkill chrome-headless-shell`）。
- **若 `diagnostics/` 下有错误日志，会休眠 1 小时后重跑**，直到无错误为止。
- `RUN_ON_START=true` 时容器启动立即在后台跑一次。
- 日志同时写 `logs/run-YYYY-MM-DD.log`（保留 3 天）和 docker logs。
- `diagnostics/error-<timestamp>/` 含 `dump.html` + `screenshot.png` + `error.txt`，由 `src/util/ErrorDiagnostic.ts` 在 `errorDiagnostics: true` 时生成。`npm run clear-diagnostics` 可清空。

## 开发命令速查

```bash
npm run dev                 # ts-node 跑 src/index.ts，带 -dev，读 src/accounts.dev.json
npm run ts-start            # ts-node 跑 src/index.ts（不带 -dev）
npm run format              # prettier --write .
npm run format:check        # prettier --check .
npm run clear-sessions      # 清理 sessions/（node scripts/main/clearSessions.js）
npm run open-session -- -email you@example.com   # 打开真实浏览器调试某账户登录
```

## 代码风格与校验（重要坑）

- **没有 `lint` / `typecheck` npm 脚本**，CI 也不跑 lint。改代码后请手动 `npm run build` 验证编译，`npm run format:check` 验证格式。
- **存在两个冲突的 ESLint 配置**：`.eslintrc.js`（单引号、无分号）与 `.eslintrc.json`（双引号、`@typescript-eslint/no-explicit-any: off`）。若手动 `npx eslint`，`.eslintrc.js` 优先；但实际项目以 **prettier 为准**：`.prettierrc` = 无分号、单引号、无尾逗号、4 空格、`printWidth: 120`、`endOfLine: lf`。
- `tsconfig.json` 严格模式全开（`strict`、`noUncheckedIndexedAccess`、`noImplicitOverride` 等），索引访问结果会带 `undefined`，写代码需显式处理。
- 别加注释里的英文/emoji；保持现有中文注释风格。

## 架构要点

- 入口 `src/index.ts`：`MicrosoftRewardsBot` 类，`cluster` 模块实现多账户并发（`config.clusters > 1` 时主进程 fork worker，按 `chunkArray` 切分账户）。`AsyncLocalStorage` 承载 `{ isMobile, account }` 上下文，`getCurrentContext()` 在任意层取当前账户/端类型。
- 目录职责：
  - `src/browser/` 浏览器创建、指纹注入、登录（`auth/` 下按登录方式拆分：Passwordless / Totp2FA / RecoveryEmail / GetACode / EmailLogin）
  - `src/functions/` 核心任务：`Workers.ts`（每日集/促销/打卡）、`SearchManager.ts`（搜索积分）、`QueryEngine.ts`（查询词源，含国内源 juejin/v2ex/zhihu/csdn 等）、`ContinuousSearchManager.ts`（持续搜索）
  - `src/functions/activities/{api,app,browser}/` 具体活动执行器
  - `src/interface/` Zod schema 与 TS 接口；`src/util/Validator.ts` 用 zod 校验 accounts/config
  - `src/logging/` Logger + Discord/ntfy webhook（带队列与 flush）
- 配置 schema 见 `src/interface/Config.ts` 与 `src/util/Validator.ts`（zod）。`config.example.json` 是权威默认值；README 的配置表可能滞后，以 schema 与 example 为准。
- `globalTimeout`、`searchDelay` 等接受 `"30sec"`/`"1min"` 字符串或数字，由 `ms` 包解析（`Utils.stringToNumber`）。

## Sessions 路径

- 构建模式：`dist/browser/sessions/<email>/session_{mobile,desktop}.json` + `session_fingerprint_{mobile,desktop}.json`
- 开发模式：`src/browser/sessions/<email>/`
- Docker 挂载 `./sessions` → `dist/browser/sessions`。**登录出问题首选删除对应 email 的 session 目录重试**（README 也强调）。

## CI / 发布 / 上游同步

- `.github/workflows/auto-release.yml` 只在 `v3` 分支且 `package.json` 变更时触发，打 GitHub Release + 推 GHCR 镜像。**本 fork 默认分支是 `main`，正常推送不会触发 CI**。
- 两个 git remote：`origin` = `chenfuxu920/Microsoft-Rewards-Script`（本 fork），`upstream` = `TheNetsky/Microsoft-Rewards-Script`。
- 同步上游流程见 `更新同步原项目.txt`：`git fetch upstream && git merge upstream/v3 --allow-unrelated-histories`（历史上有过冲突解决，合并需谨慎）。

## `.trae/` 中文 skills 框架

`.trae/rules/superpowers-zh.md` 标记 `alwaysApply: true`，定义了 20 个 skills（brainstorming、TDD、systematic-debugging、verification-before-completion、chinese-* 系列）位于 `.trae/skills/<name>/SKILL.md`。这是 Trae IDE 的配置；OpenCode 会话可参考其**工作流约定**（设计先于编码、测试先于实现、验证先于完成），但不要误以为 OpenCode 会自动加载这些 skill。chinese-* skills 仅在用户显式 `/chinese-*` 时才用。

## 其它易踩点

- 没有 `test` 目录或测试脚本——不要假设 `npm test` 能跑。
- `*.har`、`memory.text`、`logs/`、`diagnostics/`、`sessions/` 均被 gitignore，本地存在但勿提交。
- `.vscode/launch.json` 写的是 `pnpm dev`，但本项目用 **npm**（有 `package-lock.json`，无 pnpm-lock）；照 `package.json` scripts 用 npm。
- `src/crontab.template` 是 Docker cron 模板，占位符 `${CRON_SCHEDULE}` / `${TZ}` 由 `entrypoint.sh` 用 `sed` 替换；改 cron 调度改 `compose.yaml` 的 `CRON_SCHEDULE`，不要直接改模板。
- `scripts/main/*.js` 与 `scripts/utils.js` 是独立 ESM 脚本，自己定位 `dist/`（或 dev 时 `src/`），不经过 `src/util/Load.ts`。
