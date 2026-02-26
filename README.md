# 微软奖励脚本
自动化的微软奖励脚本，这次使用 TypeScript、Cheerio 和 Playwright 编写。

该项目来源于https://github.com/TheNetsky/Microsoft-Rewards-Script ，感谢原作者的付出

本项目不定时同步原项目代码，主要内容为本地化处理，主要针对的是国内用户无法访问外网google和输出日志简单翻译等问题，并在原有基础上完善功能。若有侵权请联系我删除。

本项目所有改动基于win11系统和docker环境。其他系统未测试，请根据原项目相关配置设置。

# 同步原项目时间
2026年2月25日16:03:42


# window环境 #
## 如何自动设置 ##
1. 下载或克隆源代码
2. win系统运行setup.bat部署环境（若使用setup.bat报错，请参考手动设置）
3. 在dist目录 `accounts.json`添加你的账户信息
4. 按照你的喜好修改dist目录 `config.json` 文件
5. 运行 `npm start`或运行 `run.bat` 启动构建好的脚本
## 如何手动设置 ##
1. 下载或克隆源代码
2. 下载安装nodejs 24和npm环境
3. 运行 `npm install` 安装依赖包
4. 若Error: browserType.launch: Executable doesn't exist报错执行 npx patchright install chromium
5. 将 `accounts.example.json` 重命名为 `accounts.json`，并添加你的账户信息
6. 按照你的喜好修改 `config.json` 文件
7. 运行 `npm run pre-build` 预构建脚本
8. 运行 `npm run build` 构建脚本
9. 运行 `npm start` 启动构建好的脚本


# Docker环境 #
1. 下载或克隆源代码
2. 确保`config.json`内的 `headless`设置为`true`
3. 编辑`compose.yaml` 
* 设置时区`TZ` 
* 设置调度`CRON_SCHEDULE` （默认为每天7点执行一次）
* 保持`RUN_ON_START=true`
4. 启动容器
~~~
docker compose up -d 
~~~

## 注意事项 ##
- 如果出现无法自动登录情况，请在代码执行登录过程中手动完成网页的登录，等待代码自动完成剩下流程。登录信息保存在sessions目录（需要多备份），后续运行根据该目录的会话文件来运行。
- 复制或重命名 `src/accounts.example.json` 为 `src/accounts.json` 并添加您的凭据
- 复制或重命名 `src/config.example.json` 为 `src/config.json` 并自定义您的偏好。
- 不要跳过此步骤。之前的 accounts.json 和 config.json 版本与当前版本不兼容。
- 您必须在对 accounts.json 和 config.json 进行任何更改后重新构建脚本。

## 配置参考

编辑 `src/config.json` 以自定义行为。
以下是关键配置部分的摘要。

### Core / 核心
| 设置 | 描述 | 默认值 |
|----------|-------------|----------|
| `baseURL` | Microsoft Rewards base URL | `https://rewards.bing.com` |
| `sessionPath` | 用于存储浏览器会话的文件夹 | `sessions` |
| `headless` | 在后台运行浏览器 | `false`（可见） |
| `dryRun` | 模拟执行而不运行任务 | `false` |
| `parallel` | 同时运行移动/桌面任务 | `true` |
| `runOnZeroPoints` | 在没有可用积分时继续 | `false` |
| `clusters` | 并发账户实例数 | `1` |


### Fingerprinting / 指纹识别
| 设置 | 描述 | 默认值 |
|---------|-------------|---------|
| `saveFingerprint.mobile` | 重用移动浏览器指纹 | `false` |
| `saveFingerprint.desktop` | 重用桌面浏览器指纹 | `false` |


### Job State / 任务状态
| 设置 | 描述 | 默认值 |
|---------|-------------|---------|
| `workers.doDailySet` | 完成每日集活动 | `true` |
| `workers.doMorePromotions` | 完成促销优惠 | `true` |
| `workers.doPunchCards` | 完成打卡活动 | `true` |
| `workers.doDesktopSearch` | 执行桌面搜索 | `true` |
| `workers.doMobileSearch` | 执行移动搜索 | `true` |
| `workers.doDailyCheckIn` | 完成每日签到 | `true` |
| `workers.doReadToEarn` | 完成阅读赚取活动 | `true` |

### Search / 搜索
| 设置 | 描述 | 默认值 |
|---------|-------------|---------|
| `searchOnBingLocalQueries` | 使用本地查询 vs. 获取的查询 | `false` |
| `searchSettings.useGeoLocaleQueries` | 生成基于位置的查询 | `false` |
| `searchSettings.scrollRandomResults` | 随机滚动搜索结果 | `true` |
| `searchSettings.clickRandomResults` | 点击随机结果链接 | `true` |
| `searchSettings.searchDelay` | 搜索之间的延迟（最小/最大） | `3-5 分钟` |
| `searchSettings.retryMobileSearchAmount` | 移动搜索重试次数 | `2` |


### Humanization / 人性化
| 设置 | 描述 | 默认值 |
|----------|-------------|----------|
| `humanization.enabled` | 启用人类行为 | `true` |
| `stopOnBan` | 封禁时立即停止 | `true` |
| `immediateBanAlert` | 被封禁时立即提醒 | `true` |
| `actionDelay.min` | 每个操作的最小延迟(毫秒) | `500` |
| `actionDelay.max` | 每个操作的最大延迟(毫秒) | `2200` |
| `gestureMoveProb` | 随机鼠标移动几率 | `0.65` |
| `gestureScrollProb` | 随机滚动几率 | `0.4` |

### 高级设置
| 设置 | 描述 | 默认值 |
|---------|-------------|---------|
| `globalTimeout` | 操作超时持续时间 | `30s` |
| `logExcludeFunc` | 从日志中排除的函数 | `SEARCH-CLOSE-TABS` |
| `webhookLogExcludeFunc` | 从 webhooks 中排除的函数 | `SEARCH-CLOSE-TABS` |
| `proxy.proxyGoogleTrends` | 代理 Google Trends 请求 | `true` |
| `proxy.proxyBingTerms` | 代理 Bing Terms 请求 | `true` |

### Webhook 设置
| 设置 | 描述 | 默认值 |
|---------|-------------|---------|
| `webhook.enabled` | 启用 Discord 通知 | `false` |
| `webhook.url` | Discord webhook URL | `null` |
| `conclusionWebhook.enabled` | 启用仅摘要 webhook | `false` |
| `conclusionWebhook.url` | 摘要 webhook URL | `null` |


## ✨ 功能

**账户管理：**
- ✅ 多账户支持
- ✅ 会话存储与持久化
- ✅ 2FA 支持
- ✅ 无密码登录支持

**自动化与控制：**
- ✅ 无头浏览器操作
- ✅ 集群支持（同时多个账户）
- ✅ 可配置任务选择
- ✅ 代理支持
- ✅ 自动调度（Docker）

**搜索与活动：**
- ✅ 桌面与移动搜索
- ✅ Microsoft Edge 搜索模拟
- ✅ 地理定位搜索查询
- ✅ 模拟滚动与链接点击
- ✅ 每日集完成
- ✅ 促销活动
- ✅ 打卡完成
- ✅ 每日签到
- ✅ 阅读赚取活动

**测验与互动内容：**
- ✅ 测验解答（10 分与 30-40 分变体）
- ✅ 此或彼测验（随机答案）
- ✅ ABC 测验解答
- ✅ 投票完成
- ✅ 点击奖励

**通知与监控：**
- ✅ Discord Webhook 集成
- ✅ 专用摘要 Webhook
- ✅ 全面日志记录
- ✅ Docker 支持与监控


## 更新日志 ##
1. 添加了移动端的活动领取-2025年6月24日
2. 添加了中文热搜内容-2025年6月25日
3. ~~优化大量随机性，优化模拟人类操作-2025年7月3日~~
4. 允许useLocale设置自定义地区-2025年7月10日
5. 添加了日志本地保存功能-2025年7月26日
6. 由于pnpm依赖导致无法编译问题，项目暂时改回使用npm管理-2025年11月11日
7. 补充docker的运行方式-2025年11月11日

## ⚠️ 免责声明

**风险自负！** 使用自动化脚本时，您的 Microsoft Rewards 账户可能会被暂停或禁止。

此脚本仅供教育目的。作者对 Microsoft 采取的任何账户操作不承担责任。

