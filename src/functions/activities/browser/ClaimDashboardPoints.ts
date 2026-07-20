import type { Page, Response } from 'patchright'
import type { MicrosoftRewardsBot } from '../../../index'

/**
 * 仪表盘积分领取类
 *
 * 通过模拟 Microsoft Rewards 仪表盘上的 "一键领取" Server Action，
 * 一次性领取所有当前可用的仪表盘积分（如每日任务、打卡奖励等）。
 *
 * 核心原理：
 *   1. 导航到仪表盘页面，获取认证 Cookie 和 x-deployment-id
 *   2. 构建 Next.js Server Action 所需的请求头
 *   3. 发送 POST 请求，触发积分领取
 *   4. 验证积分变化
 *
 * 回退机制：
 *   当 Server Action 直接请求失败时，回退到浏览器自动化点击方案。
 *   两种路径都会执行积分校验。
 */

/** 积分变化信息 */
interface PointsDelta {
    gained: number
    oldBalance: number
    newBalance: number
}

export class ClaimDashboardPoints {
    private bot: MicrosoftRewardsBot
    private page: Page

    /** next-action hash —— 标识具体要调用的 Server Action 函数，随部署版本变化 */
    private nextActionHash: string
    /** 部署版本 ID —— 从页面响应头或 <script> 标签提取 */
    private deploymentId: string

    /**
     * 默认 next-router-state-tree（URL-encoded）
     *
     * 路由结构：
     * ```
     * ["", {"children": ["(nav)", {"children": ["dashboard", {"children": ["__PAGE__", {}, null, null, 0]}}]}]]
     * ```
     *
     * 运行时优先从页面发出的 RSC 请求头中动态提取（见 execute() 中的 request 事件监听），
     * 仅当提取失败时回退到此硬编码值。
     * 参考：https://nextjs.org/docs/app/api-reference/functions/server-actions
     */
    private static readonly DEFAULT_ROUTER_STATE_TREE =
        '%5B%22%22%2C%7B%22children%22%3A%5B%22(nav)%22%2C%7B%22children%22%3A%5B%22dashboard%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D'

    /** 实际的 router state tree —— 优先从页面请求头动态提取，兜底使用硬编码默认值 */
    private routerStateTree: string = ClaimDashboardPoints.DEFAULT_ROUTER_STATE_TREE

    constructor(bot: MicrosoftRewardsBot, page: Page) {
        this.bot = bot
        this.page = page
        this.nextActionHash = '00cf5ba7699f0e920ffcff223f9e48fea78fd49784'
        this.deploymentId = ''
    }

    /**
     * 执行仪表盘点数领取
     */
    async execute(): Promise<void> {
        const isMobile = this.bot.isMobile
        const logger = this.bot.logger
        const accountEmail = this.bot.userData.userName

        logger.info(isMobile, 'CLAIM-DASHBOARD', '开始领取仪表盘积分...')

        try {
            // 步骤 1: 导航前注册拦截器，用于动态提取 Next.js 运行参数
            //
            // 1a. JS chunk 拦截 —— 提取 Server Action hash
            // hash 位于 createServerReference("...", ..., "reportClaimAllPoints") 中
            const capturedHash = { value: '' }
            await this.page.route('**/_next/static/chunks/*.js', async route => {
                try {
                    const response = await route.fetch()
                    const body = await response.text()
                    const match = body.match(/createServerReference\("([0-9a-f]{40,})".*?"reportClaimAllPoints"\)/)
                    if (match?.[1]) capturedHash.value = match[1]
                    await route.fulfill({ status: response.status(), headers: response.headers(), body })
                } catch {
                    await route.continue()
                }
            })

            // 1b. RSC 请求监听 —— 提取真实的 router state tree
            // 页面导航时浏览器会自动发出 RSC 预取请求（URL 含 _rsc 参数），
            // 其请求头中包含 next-router-state-tree。截获此值比硬编码更健壮
            const capturedRouterState = { value: '' }
            const onRequest = (req: any) => {
                if (!capturedRouterState.value && req.url().includes('_rsc=')) {
                    const rst = req.headers()['next-router-state-tree']
                    if (rst) capturedRouterState.value = rst
                }
            }
            this.page.on('request', onRequest)

            // 步骤 2: 导航到仪表盘页面
            const dashUrl = this.buildDashboardUrl()
            logger.debug(isMobile, 'CLAIM-DASHBOARD', `导航到仪表盘: ${dashUrl}`)

            const response: Response | null = await this.page.goto(dashUrl, {
                waitUntil: 'domcontentloaded'
            })

            // 检查响应状态码，避免认证过期 / IP 受限等场景下静默失败
            if (response && response.status() >= 400) {
                await this.page.unroute('**/_next/static/chunks/*.js').catch(() => {})
                this.page.off('request', onRequest)
                logger.warn(
                    isMobile,
                    'CLAIM-DASHBOARD',
                    `仪表盘页面返回异常状态码 | status=${response.status()} | 将跳过领取`
                )
                return
            }

            // 等待页面完全加载（确保 React 组件与 JS chunk 均已加载）
            await this.bot.utils.randomDelay(2000, 4000)

            // 步骤 3: 清理拦截器（后续不再需要）
            await this.page.unroute('**/_next/static/chunks/*.js').catch(() => {})
            this.page.off('request', onRequest)

            // 步骤 4: 提取部署版本 ID
            this.deploymentId = await this.extractDeploymentId(response)

            // 步骤 5: 应用动态提取的值
            if (capturedHash.value) {
                this.nextActionHash = capturedHash.value
                logger.debug(
                    isMobile,
                    'CLAIM-DASHBOARD',
                    `从JS动态提取到 action hash: ${capturedHash.value.slice(0, 20)}...`
                )
            } else {
                logger.debug(
                    isMobile,
                    'CLAIM-DASHBOARD',
                    `                    未从JS提取到 action hash，使用硬编码默认值: ${this.nextActionHash.slice(0, 20)}...`
                )
            }

            if (capturedRouterState.value) {
                this.routerStateTree = capturedRouterState.value
                logger.debug(
                    isMobile,
                    'CLAIM-DASHBOARD',
                    `从RSC请求头动态提取到 router state tree: ${capturedRouterState.value.slice(0, 60)}...`
                )
            } else {
                logger.debug(isMobile, 'CLAIM-DASHBOARD', '未提取到 router state tree，使用硬编码默认值')
            }

            // 步骤 6: 记录领取前积分
            const oldBalance = this.bot.userData.currentPoints
            logger.debug(isMobile, 'CLAIM-DASHBOARD', `领取前积分: ${oldBalance}`)

            // 步骤 7: 尝试 Server Action 领取
            const serverActionResult = await this.sendServerAction()
            if (serverActionResult) {
                // Server Action 成功，验证积分变化
                await this.verifyAndRecordPoints(oldBalance, 'Server Action')
            } else {
                // Server Action 失败，回退到页面点击
                logger.warn(isMobile, 'CLAIM-DASHBOARD', 'Server Action 请求失败，使用页面交互回退方案...')
                const clickSucceeded = await this.claimViaClick()
                if (clickSucceeded) {
                    await this.verifyAndRecordPoints(oldBalance, '页面点击')
                } else {
                    logger.warn(isMobile, 'CLAIM-DASHBOARD', '所有领取方式均失败')
                }
            }
        } catch (error) {
            logger.error(
                isMobile,
                'CLAIM-DASHBOARD',
                `仪表盘积分领取失败: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    /**
     * 验证积分变化并更新 bot.userData
     *
     * 由于积分可能延迟到账，使用重试机制：
     * 首次查询 + 最多 2 次重试（每次间隔 3~5 秒）
     */
    private async verifyAndRecordPoints(oldBalance: number, source: string): Promise<void> {
        const isMobile = this.bot.isMobile
        const logger = this.bot.logger
        const accountEmail = this.bot.userData.userName

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await this.bot.utils.randomDelay(attempt === 0 ? 1000 : 3000, attempt === 0 ? 2000 : 5000)

                const newBalance = await this.bot.browser.func.getCurrentPoints()
                const gained = newBalance - oldBalance

                if (gained > 0) {
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gained
                    logger.info(
                        isMobile,
                        'CLAIM-DASHBOARD',
                        `成功领取仪表盘积分 (${source}) | +${gained} | ${oldBalance} → ${newBalance} | ${accountEmail}`,
                        'green'
                    )
                    return
                }

                if (attempt < 2) {
                    logger.debug(isMobile, 'CLAIM-DASHBOARD', `积分暂未到账 (尝试 ${attempt + 1}/3)，等待后重试...`)
                }
            } catch (err) {
                logger.debug(
                    isMobile,
                    'CLAIM-DASHBOARD',
                    `积分查询失败 (尝试 ${attempt + 1}/3): ${err instanceof Error ? err.message : String(err)}`
                )
            }
        }

        // 所有重试后仍无积分变化
        logger.info(
            isMobile,
            'CLAIM-DASHBOARD',
            `仪表盘无可领取积分 (${source}) | 余额=${oldBalance} | ${accountEmail}`
        )
    }

    /**
     * 构建仪表盘 URL（带区域参数）
     */
    private buildDashboardUrl(): string {
        const geoLocale = this.bot.userData.geoLocale ?? 'CN'
        const langCode = this.bot.userData.langCode ?? 'zh-hans'
        return `https://rewards.bing.com/dashboard?ssp=1&safesearch=moderate&setlang=${langCode}&cc=${geoLocale.toUpperCase()}&ensearch=0&PC=SANSAAND`
    }

    /**
     * 从页面中提取部署版本 ID (x-deployment-id)
     *
     * 来源优先级：
     *   1. 导航响应的 x-nextjs-deployment-id 响应头（最可靠）
     *   2. <script> 标签的 dpl 查询参数
     *   3. 配置中的默认值
     */
    private async extractDeploymentId(navResponse: Response | null): Promise<string> {
        const logger = this.bot.logger
        const isMobile = this.bot.isMobile

        // 方法 1: 从导航响应头获取
        if (navResponse) {
            try {
                const headers = navResponse.headers()
                const dplFromHeaders = headers['x-nextjs-deployment-id']
                if (dplFromHeaders) {
                    logger.debug(isMobile, 'CLAIM-DASHBOARD', `从响应头提取到部署 ID: ${dplFromHeaders}`)
                    return dplFromHeaders
                }
            } catch (e) {
                logger.debug(
                    isMobile,
                    'CLAIM-DASHBOARD',
                    `从响应头提取部署 ID 失败: ${e instanceof Error ? e.message : String(e)}`
                )
            }
        }

        // 方法 2: 从已加载的 script 标签提取
        try {
            const dplFromScripts = await this.page.evaluate(() => {
                const scripts = document.querySelectorAll('script[src]')
                for (const script of scripts) {
                    const src = script.getAttribute('src') ?? ''
                    const match = src.match(/[?&]dpl=([^&]+)/)
                    if (match?.[1]) {
                        return match[1]
                    }
                }
                return null
            })

            if (dplFromScripts) {
                logger.debug(isMobile, 'CLAIM-DASHBOARD', `从页面 script 提取到部署 ID: ${dplFromScripts}`)
                return dplFromScripts
            }
        } catch (e) {
            logger.debug(
                isMobile,
                'CLAIM-DASHBOARD',
                `从页面提取部署 ID 失败: ${e instanceof Error ? e.message : String(e)}`
            )
        }

        // 方法 3: 使用配置的默认值
        const configDeploymentId = this.bot.config.claimPoints?.deploymentId
        if (configDeploymentId) {
            logger.debug(isMobile, 'CLAIM-DASHBOARD', `使用配置的部署 ID: ${configDeploymentId}`)
            return configDeploymentId
        }

        return ''
    }

    /**
     * 尝试通过页面点击来触发积分领取（回退方案）
     *
     * 当 Server Action 直接请求失败时，回退到浏览器自动化方案：
     * 查找页面上的领取按钮并点击。
     *
     * @returns 是否成功找到并点击了至少一个按钮
     */
    private async claimViaClick(): Promise<boolean> {
        const isMobile = this.bot.isMobile
        const logger = this.bot.logger

        logger.info(isMobile, 'CLAIM-DASHBOARD', '使用页面交互方式领取积分...')

        try {
            // 尝试常见的领取按钮选择器（按可靠性排序）
            const claimSelectors = [
                'button[aria-label*="领取"]',
                'button[aria-label*="Claim"]',
                'button[aria-label*="collect"]',
                'button:has-text("领取")',
                'button:has-text("Claim")',
                'button:has-text("Collect")',
                '[data-react-aria-pressable="true"]:has-text("领取")',
                '[data-react-aria-pressable="true"]:has-text("Claim")',
                '[role="button"]:has-text("领取")',
                '[role="button"]:has-text("Claim")'
            ]

            for (const selector of claimSelectors) {
                try {
                    // 使用 $ (querySelector) 取第一个可见元素，避免 $$ + 逐个 isVisible()
                    const button = await this.page.$(selector)
                    if (button) {
                        try {
                            const visible = await button.isVisible()
                            if (visible) {
                                logger.debug(isMobile, 'CLAIM-DASHBOARD', `点击按钮: ${selector}`)
                                await button.click()
                                await this.bot.utils.randomDelay(2000, 4000)

                                // 检查是否有抽屉内的 CTA 按钮需要二次点击
                                // 仪表盘领取流程为两步:点击"可领取"卡片 → 抽屉打开 →
                                // 点击抽屉内"领取积分"按钮完成领取
                                await this.tryClickDrawerCta()

                                return true
                            }
                        } catch {
                            // ElementHandle 可能已过时，继续下一个选择器
                        }
                    }
                } catch {
                    // 选择器不匹配，继续尝试下一个
                }
            }

            logger.warn(isMobile, 'CLAIM-DASHBOARD', '未找到可点击的领取按钮')
            return false
        } catch (error) {
            logger.error(
                isMobile,
                'CLAIM-DASHBOARD',
                `页面交互领取失败: ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    /**
     * 尝试点击抽屉内的"领取积分" CTA 按钮（二次点击）
     *
     * 仪表盘领取流程为两步交互：
     *   1. 点击"可领取"卡片 → 打开右侧抽屉
     *   2. 点击抽屉内"领取积分"按钮 → 完成领取
     *
     * 本方法用于步骤 2，在 claimViaClick 完成第一步点击后被调用。
     */
    private async tryClickDrawerCta(): Promise<void> {
        const isMobile = this.bot.isMobile
        const logger = this.bot.logger

        const drawerCtaSelectors = [
            'button:has-text("领取积分")',
            '[role="button"]:has-text("领取积分")',
            '[data-react-aria-pressable="true"]:has-text("领取积分")'
        ]

        // 等待抽屉动画渲染
        await this.bot.utils.randomDelay(1500, 2500)

        for (const selector of drawerCtaSelectors) {
            try {
                const btn = await this.page.$(selector)
                if (btn) {
                    const visible = await btn.isVisible()
                    if (visible) {
                        logger.debug(isMobile, 'CLAIM-DASHBOARD', `点击抽屉CTA: ${selector}`)
                        await btn.click()
                        await this.bot.utils.randomDelay(2000, 3500)
                        return
                    }
                }
            } catch {
                // 选择器不匹配或元素已消失，继续尝试下一个
            }
        }
    }

    /**
     * 发送 Next.js Server Action 请求来领取积分
     *
     * 模拟从 HAR 抓包中提取的请求格式：
     *   POST /dashboard?...
     *   Headers: next-action, next-router-state-tree, x-deployment-id
     *   Body: []
     *
     * @returns true 表示请求成功（200 且无错误标记）
     */
    private async sendServerAction(): Promise<boolean> {
        const isMobile = this.bot.isMobile
        const logger = this.bot.logger

        try {
            const dashUrl = this.buildDashboardUrl()

            // 构建请求头，尽可能模拟真实浏览器行为
            const headers: Record<string, string> = {
                'next-action': this.nextActionHash,
                'next-router-state-tree': this.routerStateTree,
                'content-type': 'text/plain;charset=UTF-8',
                accept: 'text/x-component',
                origin: 'https://rewards.bing.com',
                referer: dashUrl
            }

            if (this.deploymentId) {
                headers['x-deployment-id'] = this.deploymentId
            }

            // 如果 nextActionHash 为空且 deploymentId 也为空，则不可能成功
            if (!this.nextActionHash && !this.deploymentId) {
                logger.warn(isMobile, 'CLAIM-DASHBOARD', '缺少 Server Action 所需的必要参数，无法发送请求')
                return false
            }

            logger.debug(
                isMobile,
                'CLAIM-DASHBOARD',
                `发送 Server Action 请求 | hash=${this.nextActionHash.slice(0, 16)}... | dpl=${this.deploymentId}`
            )

            // 使用 page.evaluate + fetch 在浏览器上下文中发送请求
            // 这样可以自动携带 Cookie，避免跨域问题
            const result = await this.page.evaluate(
                async ({ url, headers, body }) => {
                    try {
                        const response = await fetch(url, {
                            method: 'POST',
                            headers,
                            body,
                            credentials: 'include'
                        })

                        const text = await response.text()
                        return {
                            ok: response.ok,
                            status: response.status,
                            body: text.slice(0, 500)
                        }
                    } catch (err) {
                        return {
                            ok: false,
                            status: 0,
                            body: err instanceof Error ? err.message : String(err)
                        }
                    }
                },
                {
                    url: dashUrl,
                    headers,
                    body: '[]'
                }
            )

            logger.debug(
                isMobile,
                'CLAIM-DASHBOARD',
                `Server Action 响应 | ok=${result.ok} | status=${result.status} | body=${result.body.slice(0, 100)}`
            )

            if (!result.ok) {
                return false
            }

            // Next.js Server Action 即使失败也可能返回 200 + text/x-component（错误编码在 RSC 流中）
            // 因此需要做负向检查：排除明显的错误标记
            const lowerBody = result.body.toLowerCase()
            const errorPatterns = ['"error":', '"message":', '"rsc_error"', 'already claimed', 'already redeemed']
            if (errorPatterns.some(p => lowerBody.includes(p))) {
                logger.debug(
                    isMobile,
                    'CLAIM-DASHBOARD',
                    `Server Action 响应包含错误标记 | body=${result.body.slice(0, 200)}`
                )
                return false
            }

            return true
        } catch (error) {
            logger.error(
                isMobile,
                'CLAIM-DASHBOARD',
                `Server Action 请求异常: ${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }
}
