# PunchCard 任务通用自动化实现指南

## 概述

本指南提供了一个通用的 PunchCard 任务自动化框架,支持多种不同类型的打卡卡片任务。以"盗贼之海"为主要示例,同时兼容"三月指南"等同类任务。

### 已知 PunchCard 任务类型

| 任务名称                | OfferId                                             | 子任务数 | 状态   |
| ----------------------- | --------------------------------------------------- | -------- | ------ |
| 盗贼之海 - 光辉传奇旗帜 | `WW_evergreen_pcparent_SeaofThieves_Ruby_punchcard` | 5        | 进行中 |
| 三月指南                | `WW_pcparent_FY26_BingMonthlyPC_Mar_b_punchcard`    | 4        | 已完成 |

---

## 核心示例: 盗贼之海

**任务名称**: 盗贼之海 - 光辉传奇旗帜 (Sea of Thieves - Radiant Legend Flag)  
**父 OfferId**: `WW_evergreen_pcparent_SeaofThieves_Ruby_punchcard`  
**截止日期**: 2026年6月30日太平洋时间 11:59:59

---

## 任务结构

### 子任务列表 (必须按顺序完成)

| 序号 | OfferId                                             | 按钮文本 | 描述                 | 类型     |
| ---- | --------------------------------------------------- | -------- | -------------------- | -------- |
| 1    | `WW_evergreen_pcchild1_SeaofThieves_Ruby_punchcard` | 点击激活 | 激活打卡卡片         | 激活     |
| 2    | `WW_evergreen_pcchild2_SeaofThieves_Ruby_punchcard` | 访问网站 | 访问盗贼之海官网     | 网站访问 |
| 3    | `WW_evergreen_pcchild3_SeaofThieves_Ruby_punchcard` | 开始搜索 | 桌面Bing搜索 (0/7天) | 桌面搜索 |
| 4    | `WW_evergreen_pcchild4_SeaofThieves_Ruby_punchcard` | 开始搜索 | 移动Bing搜索 (0/7天) | 移动搜索 |
| 5    | `WW_evergreen_pcchild5_SeaofThieves_Ruby_punchcard` | 立即领取 | 领取光辉传奇旗帜     | 领取奖励 |

### 子任务 Hash 值

```typescript
const CHILD_HASHES = {
    child1: 'c6939f4d4c9e6166dc11ee30ecf54cae317154a86abe2ac04848f50d60e2b547',
    child2: '08d6c38fdcf6711725c584de21fd8ea1d73c4f0d9b752ac56e33b042139cd75c',
    child3: 'e1bc3d6925946459fb8c857ede279fe13b8c6e64cd722baa36c1ec6e47bc6cce',
    child4: '264f248a3f28fd1f7b1fe8fcb3a3803f64ad01949848fe65dbc3d7afe255e830',
    child5: '28ef959da9c804a3cda6341d4f3dc0ebf7258679cae1ed7c84b6457ea709e9f7'
}
```

---

## 实现架构

### 核心流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    SeaOfThievesPunchCard                        │
├─────────────────────────────────────────────────────────────────┤
│  1. 检查任务状态 (GET /earn/quest/...?_rsc=...)                 │
│  2. 激活打卡卡片 (POST child1)                                  │
│  3. 访问官网 (POST child2 + 导航到 seaofthieves.com)            │
│  4. 桌面搜索7天 (POST child3 + Bing搜索 每日一次)               │
│  5. 移动搜索7天 (POST child4 + Bing搜索 每日一次)               │
│  6. 领取奖励 (POST child5 + 导航到兑换页)                       │
└─────────────────────────────────────────────────────────────────┘
```

### 状态管理

```typescript
interface PunchCardState {
    parentOfferId: string
    children: {
        [key: string]: {
            offerId: string
            hash: string
            isCompleted: boolean
            isLocked: boolean
            completedAt?: Date
        }
    }
    searchProgress: {
        desktop: { currentDay: number; lastSearchDate?: Date }
        mobile: { currentDay: number; lastSearchDate?: Date }
    }
}
```

---

## 关键实现细节

### 1. 页面访问与任务检测

```typescript
// 访问任务页面
const TASK_URL = 'https://rewards.bing.com/earn/quest/WW_evergreen_pcparent_SeaofThieves_Ruby_punchcard'

// RSC数据获取 (用于检测任务状态)
const RSC_URL = 'https://rewards.bing.com/earn/quest/WW_evergreen_pcparent_SeaofThieves_Ruby_punchcard?_rsc=6kmr8'
```

**页面元素定位**:

- 任务标题: `h3` 包含 "盗贼之海"
- 激活按钮: `aria-label` 包含 "点击激活"
- 访问网站按钮: `aria-label` 包含 "访问网站"
- 搜索按钮: `aria-label` 包含 "开始搜索"
- 领取按钮: `aria-label` 包含 "立即领取"

### 2. 完成子任务的API调用

当在浏览器中点击按钮时,页面会发送POST请求:

```typescript
// POST请求URL
const POST_URL = 'https://rewards.bing.com/earn/quest/WW_evergreen_pcparent_SeaofThieves_Ruby_punchcard'

// 请求体格式
const requestBody = [
    hash, // 子任务的hash值
    11, // 固定值
    {
        offerid: childOfferId,
        isPromotional: '$undefined',
        timezoneOffset: '-480' // UTC+8
    }
]
```

### 3. Child1: 激活打卡卡片

```typescript
async function activatePunchCard(page: Page): Promise<boolean> {
    // 方式1: 点击页面按钮
    const activateButton = page.locator('[aria-label*="点击激活"]')
    await activateButton.click()

    // 方式2: 直接导航 (触发激活)
    await page.goto('https://rewards.microsoft.com/dashboard/WW_evergreen_pcparent_SeaofThieves_Ruby_punchcard')

    // 等待页面重定向完成
    await page.waitForURL('**/earn/quest/**')

    return true
}
```

### 4. Child2: 访问官方网站

```typescript
async function visitOfficialSite(page: Page): Promise<boolean> {
    // 点击"访问网站"按钮
    const visitButton = page.locator('[aria-label*="访问网站"]')
    await visitButton.click()

    // 等待新标签页打开或导航
    const newPage = await page.context().waitForEvent('page')
    await newPage.waitForLoadState('domcontentloaded')

    // 验证是否到达seaofthieves.com
    expect(newPage.url()).toContain('seaofthieves.com')

    // 保持页面打开几秒以确保追踪
    await page.waitForTimeout(5000)

    // 关闭新标签页
    await newPage.close()

    return true
}
```

**官方站点URL参数**:

```
https://www.seaofthieves.com/?form=ML2XMD&OCID=ML2XMD&PUBL=RewardsDO&CREA=ML2XMD
```

### 5. Child3/Child4: 搜索任务 (核心复杂部分)

#### 搜索URL格式

```typescript
// 桌面搜索 (Child3)
const DESKTOP_SEARCH_URL =
    'https://www.bing.com/search?q=Sea+of+Thieves+News&form=ML2XME&OCID=ML2XME&PUBL=RewardsDO&CREA=ML2XME'

// 移动搜索 (Child4)
const MOBILE_SEARCH_URL =
    'https://www.bing.com/search?q=Sea+of+Thieves+News&form=ML2XMF&OCID=ML2XMF&PUBL=RewardsDO&CREA=ML2XMF'
```

#### 搜索进度检测

从RSC响应中解析当前进度:

```typescript
// 解析搜索进度 (从页面HTML)
// 示例: "在桌面上使用 Bing 搜索（已完成 0/7 天）"
const desktopProgressMatch = html.match(/桌面上使用 Bing 搜索（已完成 (\d+)\/7 天）/)
const mobileProgressMatch = html.match(/移动设备上使用 Bing 搜索（已完成 (\d+)\/7 天）/)
```

#### 搜索实现

```typescript
async function doSearchTask(page: Page, isMobile: boolean, currentDay: number): Promise<boolean> {
    if (currentDay >= 7) {
        console.log('搜索任务已完成')
        return true
    }

    // 检查是否需要等待24小时
    const lastSearchDate = await getLastSearchDate(isMobile)
    if (lastSearchDate) {
        const hoursSinceLastSearch = (Date.now() - lastSearchDate.getTime()) / (1000 * 60 * 60)
        if (hoursSinceLastSearch < 24) {
            console.log(`距离上次搜索不足24小时，还需等待 ${24 - hoursSinceLastSearch} 小时`)
            return false
        }
    }

    const searchUrl = isMobile ? MOBILE_SEARCH_URL : DESKTOP_SEARCH_URL

    // 设置移动端UA (如果是移动搜索)
    if (isMobile) {
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)...'
        })
    }

    // 执行搜索
    await page.goto(searchUrl)
    await page.waitForLoadState('networkidle')

    // 保存搜索时间
    await saveSearchDate(isMobile, new Date())

    return true
}
```

### 6. Child5: 领取奖励

```typescript
async function claimReward(page: Page): Promise<boolean> {
    // 检查前置任务是否完成
    const allPreviousCompleted = await checkPreviousTasksCompleted()
    if (!allPreviousCompleted) {
        console.log('前置任务未完成，无法领取奖励')
        return false
    }

    // 点击"立即领取"按钮
    const claimButton = page.locator('[aria-label*="立即领取"]')
    await claimButton.click()

    // 等待跳转到兑换页面
    await page.waitForURL('**/redeem/**')

    // 兑换页面URL: https://rewards.bing.com/redeem/sku/000499036022
    console.log('已跳转到兑换页面')

    return true
}
```

---

## 状态持久化

由于搜索任务需要跨天执行,需要持久化状态:

```typescript
// 状态文件路径
const STATE_FILE = './sessions/{accountEmail}/seaofthieves-state.json'

interface PersistentState {
    lastUpdated: string
    child1Completed: boolean
    child2Completed: boolean
    child3Progress: number // 0-7
    child3LastSearch: string | null
    child4Progress: number // 0-7
    child4LastSearch: string | null
    child5Completed: boolean
}

// 保存状态
async function saveState(email: string, state: PersistentState): Promise<void> {
    const fs = require('fs').promises
    const statePath = `./sessions/${email}/seaofthieves-state.json`
    await fs.writeFile(statePath, JSON.stringify(state, null, 2))
}

// 加载状态
async function loadState(email: string): Promise<PersistentState | null> {
    const fs = require('fs').promises
    const statePath = `./sessions/${email}/seaofthieves-state.json`
    try {
        const data = await fs.readFile(statePath, 'utf-8')
        return JSON.parse(data)
    } catch {
        return null
    }
}
```

---

## 与现有代码集成

### 1. 创建活动处理器

```typescript
// src/functions/activities/browser/SeaOfThievesPunchCard.ts

import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../index'
import type { PunchCard } from '../../../interface/DashboardData'

export class SeaOfThievesPunchCard {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async doPunchCard(punchCard: PunchCard, page: Page): Promise<void> {
        const parentOfferId = punchCard.parentPromotion.offerId

        // 检查是否是盗贼之海任务
        if (!parentOfferId.includes('SeaofThieves')) {
            return
        }

        this.bot.logger.info(this.bot.isMobile, 'SOT-PUNCHCARD', `开始处理盗贼之海打卡卡片 | offerId=${parentOfferId}`)

        // 按顺序执行子任务
        await this.executeChildren(punchCard, page)
    }

    private async executeChildren(punchCard: PunchCard, page: Page): Promise<void> {
        const children = punchCard.childPromotions

        for (const child of children) {
            if (child.complete) {
                continue // 跳过已完成的
            }

            if (child.exclusiveLockedFeatureStatus === 'locked') {
                this.bot.logger.info(this.bot.isMobile, 'SOT-PUNCHCARD', `子任务锁定中 | offerId=${child.offerId}`)
                break // 后续任务可能被锁定
            }

            await this.executeChild(child, page)

            // 任务间延迟
            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 8000))
        }
    }

    private async executeChild(child: any, page: Page): Promise<void> {
        const offerId = child.offerId

        if (offerId.includes('pcchild1')) {
            await this.doActivation(page)
        } else if (offerId.includes('pcchild2')) {
            await this.doVisitWebsite(page)
        } else if (offerId.includes('pcchild3')) {
            await this.doDesktopSearch(page)
        } else if (offerId.includes('pcchild4')) {
            await this.doMobileSearch(page)
        } else if (offerId.includes('pcchild5')) {
            await this.doClaimReward(page)
        }
    }

    // ... 具体实现方法
}
```

### 2. 在Workers中注册

```typescript
// src/functions/Workers.ts 中的 doPunchCards 方法修改

public async doPunchCards(data: DashboardData, page: Page) {
  const punchCards = data.punchCards?.filter(
    x => !x.parentPromotion?.complete && (x.parentPromotion?.pointProgressMax ?? 0) > 0
  ) ?? [];

  for (const punchCard of punchCards) {
    const parentOfferId = punchCard.parentPromotion?.offerId ?? '';

    // 特殊处理盗贼之海任务
    if (parentOfferId.includes('SeaofThieves')) {
      await this.bot.activities.doSeaOfThievesPunchCard(punchCard, page);
      continue;
    }

    // 其他punchcard的现有处理逻辑...
  }
}
```

---

## 时间线分析 (来自HAR文件)

```
15:41:34 - 访问任务页面 (GET /earn/quest/...?_rsc=1c8nf)
15:41:42 - 完成Child1 激活 (POST child1)
15:41:43 - 重定向到任务页面
15:41:48 - 完成Child2 访问网站 (POST child2)
15:41:49 - 访问 seaofthieves.com
15:41:59 - 完成Child3 桌面搜索 (POST child3)
15:41:59 - 执行Bing搜索 (form=ML2XME)
15:42:11 - 完成Child4 移动搜索 (POST child4)
15:42:11 - 执行Bing搜索 (form=ML2XMF)
15:42:16 - 重复Child3搜索 (可能是验证)
15:42:22 - 完成Child5 领取奖励 (POST child5)
15:42:24 - 查看任务完成状态
```

---

## 注意事项

### 1. 搜索任务的24小时限制

- Child3和Child4需要连续7天每天完成一次搜索
- 每次搜索间隔必须超过24小时
- 需要持久化记录上次搜索时间

### 2. 移动端模拟

- 移动搜索需要设置正确的User-Agent
- 或者使用独立的移动端浏览器上下文

### 3. 任务锁定机制

- Child5在前4个子任务完成前会被锁定
- 每次运行时需要检查子任务状态

### 4. 错误处理

- 网络超时重试
- 页面加载失败重试
- 状态恢复机制

### 5. 日志记录

```typescript
// 建议的日志格式
this.bot.logger.info(
    this.bot.isMobile,
    'SOT-PUNCHCARD',
    `子任务完成 | child=${childNum} | offerId=${offerId} | 进度=${progress}/7`
)
```

---

## 测试建议

1. **单元测试**: 测试状态解析和进度检测
2. **集成测试**: 在沙盒环境测试完整流程
3. **手动验证**: 首次实现后手动检查积分是否正确到账

---

---

---

## 页面UI结构详情

### 步骤指示器

页面有5个步骤圆圈,使用以下CSS类表示状态:

- 未完成: `rounded-full border border-neutralStrokeAccessible`
- 已完成: `rounded-full border bg-brandPrimary`

### RSC响应中的任务数据结构

```json
{
    "aria-label": "开始搜索, 搜索以完成",
    "appearance": "primary",
    "className": "circular w-fit",
    "href": "https://www.bing.com/search?q=Sea+of+Thieves+News&form=ML2XME&...",
    "offerId": "WW_evergreen_pcchild3_SeaofThieves_Ruby_punchcard",
    "hash": "e1bc3d6925946459fb8c857ede279fe13b8c6e64cd722baa36c1ec6e47bc6cce",
    "isCompleted": false,
    "isLocked": false,
    "isDisabled": false
}
```

### 进度检测正则表达式

```typescript
// 桌面搜索进度
const desktopProgressRegex = /在桌面上使用 Bing 搜索（已完成 (\d+)\/7 天）/

// 移动搜索进度
const mobileProgressRegex = /在移动设备上使用 Bing 搜索（已完成 (\d+)\/7 天）/
```

### 按钮定位选择器

```typescript
// 激活按钮
page.locator('[aria-label*="点击激活"]')

// 访问网站按钮
page.locator('[aria-label*="访问网站"]')

// 搜索按钮 (桌面/移动共用)
page.locator('[aria-label*="开始搜索"]')

// 领取奖励按钮
page.locator('[aria-label*="立即领取"]')
```

---

## 通用 PunchCard 框架设计

### 核心原则: 仿照用户操作

**不要通过文字识别任务类型**,而是:

1. 获取页面上所有可点击的按钮
2. 依次点击每个按钮
3. 让页面自行处理任务完成逻辑

### 按钮可点击性判断

**重要发现**: HAR抓包验证显示 `isCompleted/isLocked/isDisabled` 三个字段**始终为 false**,不是实际判断依据。

#### 实际判断逻辑 (基于HAR验证)

| 实际状态           | RSC响应表现                 | 判断方式             |
| ------------------ | --------------------------- | -------------------- |
| 可点击             | 按钮存在于列表中            | `offerId` 存在于响应 |
| 已完成(一次性任务) | 按钮从列表中消失            | `offerId` 不在响应中 |
| 已完成(多日任务)   | 按钮仍在列表中,进度文本更新 | 检查 "已完成 X/7 天" |

#### HAR抓包验证数据

```
初始状态:   [child1, child2, child3, child4, child5]  5个按钮
child1后:   [child2, child3, child4, child5]          child1消失
child2后:   [child3, child4, child5]                  child2消失
child3后:   [child3, child4, child5]                  child3仍在(多日任务)
child4后:   [child3, child4, child5]                  child4仍在(多日任务)
child5后:   [child3, child4, child5]                  全部仍在(搜索需7天)
```

#### RSC响应中的按钮数据结构

```json
{
    "aria-label": "开始搜索, 搜索以完成",
    "appearance": "primary",
    "className": "circular w-fit",
    "href": "https://www.bing.com/search?q=Sea+of+Thieves+News&form=...",
    "offerId": "WW_evergreen_pcchild3_SeaofThieves_Ruby_punchcard",
    "hash": "e1bc3d6925946459fb8c857ede279fe13b8c6e64cd722baa36c1ec6e47bc6cce",
    "isCompleted": false, // 始终为false,不是判断依据
    "isLocked": false, // 始终为false,不是判断依据
    "isDisabled": false // 始终为false,不是判断依据
}
```

### 通用按钮解析器

```typescript
interface PunchCardButton {
    ariaLabel: string // 按钮文本 (逗号分隔,第一部分是按钮文字)
    href: string // 点击后跳转的URL
    offerId: string // 子任务ID
    hash: string // 完成任务所需的hash
    // 注意: isCompleted/isLocked/isDisabled 始终为false,不作为判断依据
}

// 从页面RSC数据中解析所有按钮
function parseButtons(pageContent: string): PunchCardButton[] {
    const buttons: PunchCardButton[] = []

    // 正则匹配按钮数据块
    const pattern =
        /"aria-label":"([^"]+)","appearance":"[^"]*","className":"[^"]*","href":"([^"]*)","offerId":"([^"]+)","hash":"([a-f0-9]+)"/g

    let match
    while ((match = pattern.exec(pageContent)) !== null) {
        buttons.push({
            ariaLabel: match[1],
            href: match[2],
            offerId: match[3],
            hash: match[4]
        })
    }

    return buttons
}

// 所有存在的按钮都是可点击的 (按钮消失 = 已完成)
function getClickableButtons(buttons: PunchCardButton[]): PunchCardButton[] {
    return buttons // 所有在列表中的按钮都可以尝试点击
}
```

### 通用执行器

```typescript
class PunchCardExecutor {
    private bot: MicrosoftRewardsBot
    private page: Page

    async execute(punchCard: PunchCard): Promise<void> {
        const parentOfferId = punchCard.parentPromotion.offerId

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `开始处理: ${punchCard.parentPromotion.title} | offerId=${parentOfferId}`
        )

        // 导航到任务页面
        await this.page.goto(`https://rewards.bing.com/earn/quest/${parentOfferId}`)
        await this.page.waitForLoadState('networkidle')

        // 循环点击可点击的按钮
        let hasClickable = true
        while (hasClickable) {
            // 获取当前页面内容
            const content = await this.page.content()

            // 解析所有按钮
            const buttons = parseButtons(content)
            const clickable = getClickableButtons(buttons)

            if (clickable.length === 0) {
                hasClickable = false
                break
            }

            // 点击第一个可点击的按钮
            const button = clickable[0]
            await this.clickButton(button)

            // 任务间延迟
            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 8000))

            // 重新加载页面获取最新状态
            await this.page.goto(`https://rewards.bing.com/earn/quest/${parentOfferId}`)
            await this.page.waitForLoadState('networkidle')
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `处理完成: ${punchCard.parentPromotion.title}`)
    }

    private async clickButton(button: PunchCardButton): Promise<void> {
        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD-CLICK',
            `点击按钮: ${button.ariaLabel.split(',')[0]} | offerId=${button.offerId}`
        )

        // 通过aria-label定位按钮
        const buttonText = button.ariaLabel.split(',')[0].trim()
        const locator = this.page.locator(`[aria-label*="${buttonText}"]`)

        if (await locator.isVisible()) {
            // 点击按钮
            await locator.click()

            // 处理可能的新标签页
            try {
                const newPage = await this.page.context().waitForEvent('page', { timeout: 3000 })
                await newPage.waitForLoadState('domcontentloaded')
                await this.page.waitForTimeout(5000)
                await newPage.close()
            } catch {
                // 没有新标签页,继续
            }

            await this.page.waitForLoadState('networkidle')
        } else {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD-CLICK', `按钮不可见: ${buttonText}`)
        }
    }
}
```

### 与现有代码集成

```typescript
// src/functions/Workers.ts 修改 doPunchCards 方法

public async doPunchCards(data: DashboardData, page: Page) {
  const punchCards = data.punchCards?.filter(
    x => !x.parentPromotion?.complete && (x.parentPromotion?.pointProgressMax ?? 0) > 0
  ) ?? []

  if (!punchCards.length) {
    this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD',
      '所有PunchCard已完成')
    return
  }

  this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD',
    `开始处理 ${punchCards.length} 个PunchCard`)

  const executor = new PunchCardExecutor(this.bot, page)

  for (const punchCard of punchCards) {
    try {
      await executor.execute(punchCard)
      await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
    } catch (error) {
      this.bot.logger.error(this.bot.isMobile, 'PUNCHCARD',
        `处理失败: ${punchCard.parentPromotion.offerId} | ${error}`)
    }
  }
}
```

---

## 参考代码位置

- 现有PunchCard处理: `src/functions/Workers.ts:175-206`
- 活动处理器: `src/functions/Activities.ts`
- 浏览器搜索: `src/functions/activities/browser/Search.ts`
- Dashboard数据接口: `src/interface/DashboardData.ts:545-549`

---

## 附录: HAR文件中的完整请求序列

| #   | 时间     | 方法 | URL                                 | 说明                  |
| --- | -------- | ---- | ----------------------------------- | --------------------- |
| 191 | 15:41:34 | GET  | /earn/quest/...?\_rsc=1c8nf         | 获取任务页面RSC       |
| 203 | 15:41:42 | POST | /earn/quest/...                     | 完成child1 (激活)     |
| 208 | 15:41:43 | GET  | rewards.microsoft.com/dashboard/... | 重定向                |
| 209 | 15:41:43 | GET  | /dashboard/...                      | 307重定向到earn页面   |
| 212 | 15:41:43 | GET  | /earn/quest/...                     | 获取任务页面HTML      |
| 225 | 15:41:45 | GET  | /earn/quest/...?\_rsc=6kmr8         | 获取任务结构RSC       |
| 232 | 15:41:48 | POST | /earn/quest/...                     | 完成child2 (访问网站) |
| 241 | 15:41:49 | GET  | seaofthieves.com/...                | 访问官网              |
| 308 | 15:41:51 | GET  | /earn/quest/...                     | 刷新任务状态          |
| 368 | 15:41:59 | POST | /earn/quest/...                     | 完成child3 (桌面搜索) |
| 373 | 15:41:59 | GET  | bing.com/search?q=...form=ML2XME    | 执行桌面搜索          |
| 399 | 15:42:01 | GET  | /earn/quest/...                     | 刷新任务状态          |
| 413 | 15:42:11 | POST | /earn/quest/...                     | 完成child4 (移动搜索) |
| 416 | 15:42:11 | GET  | bing.com/search?q=...form=ML2XMF    | 执行移动搜索          |
| 427 | 15:42:13 | GET  | /earn/quest/...                     | 刷新任务状态          |
| 447 | 15:42:16 | POST | /earn/quest/...                     | 重复child3 (验证)     |
| 450 | 15:42:16 | GET  | bing.com/search?q=...form=ML2XME    | 重复桌面搜索          |
| 476 | 15:42:19 | GET  | /earn/quest/...                     | 刷新任务状态          |
| 482 | 15:42:22 | POST | /earn/quest/...                     | 完成child5 (领取奖励) |
| 485 | 15:42:22 | GET  | /redeem/000499036022                | 跳转到兑换页面        |
| 517 | 15:42:24 | GET  | /earn/quest/...                     | 最终状态检查          |
