import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../../index'
import type { PunchCard } from '../../../interface/DashboardData'

interface PunchCardButton {
    ariaLabel: string
    href: string
}

/**
 * quest 页面任务按钮的候选选择器，按可靠度从高到低排列。
 *
 * 微软 2026 年重写了 rewards 任务页：按钮从 `a.circular` 改成 Tailwind 风格，
 * 并且多数渲染为 <SPAN role="link" href="...">（href 是 React 写在非标准标签上的属性），
 * 所以旧的 `a[class*="circular"]` 已经彻底匹配不到任何按钮。
 *
 * 另外不同活动页面的结构并不统一（有的带 role="link"，有的没有），
 * 因此这里用分层降级而不是押注单一选择器：命中即返回，并在日志里记录是哪一层生效。
 */
const BUTTON_SELECTORS = [
    '[role="link"][aria-label][href]', // 语义最稳，但部分活动页不提供 role
    '[href*="rnoreward=1"]', // Rewards 业务参数，跨活动稳定
    '[href*="form="][aria-label]', // 追踪参数 + 无障碍标签，跨页面命中最广
    'a[class*="circular"]' // 旧结构兜底
]

/**
 * 统计任务页里"看起来像任务按钮"的元素总数（含禁用态），
 * 用于区分「任务真的做完了」和「按钮存在但全部不可用」。
 */
const CENSUS_SELECTOR = '[href*="form="]'

export class PunchCardExecutor {
    private bot: MicrosoftRewardsBot
    private page: Page

    constructor(bot: MicrosoftRewardsBot, page: Page) {
        this.bot = bot
        this.page = page
    }

    async execute(punchCard: PunchCard): Promise<void> {
        const parentOfferId = punchCard.parentPromotion?.offerId
        const title = punchCard.parentPromotion?.title ?? 'Unknown'

        if (!parentOfferId) {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD', `跳过无效任务: parentPromotion.offerId 为空`)
            return
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `开始处理: ${title} | offerId=${parentOfferId}`)

        const questUrl = `https://rewards.bing.com/earn/quest/${parentOfferId}`

        // 跳转到任务页面
        await this.navigateToQuest(questUrl)

        // 循环处理每个可点击按钮，每次只点一个然后刷新页面状态
        let maxAttempts = 10
        while (maxAttempts-- > 0) {
            const buttons = await this.getTaskButtons()

            if (buttons.length === 0) {
                const total = await this.countTaskLikeButtons()

                if (total > 0) {
                    // 按钮存在但全部不可用：通常是未激活、未到解锁时间或活动已过期
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `检测到 ${total} 个任务按钮但全部不可用（未激活/未解锁/活动已过期）| title=${title}`
                    )
                } else {
                    this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `没有更多可点击的按钮 | title=${title}`)
                }
                break
            }

            const button = buttons[0]!
            const text = button.ariaLabel.split(',')[0]?.trim() ?? ''
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `找到 ${buttons.length} 个可点击按钮, 正在处理: ${text}`)

            await this.clickButton(button)

            // 等待后重新导航到任务页面刷新状态
            await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 5000))
            await this.navigateToQuest(questUrl)
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `处理完成: ${title}`)
    }

    private async navigateToQuest(questUrl: string): Promise<void> {
        await this.page.goto(questUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
        await this.page.waitForLoadState('networkidle').catch(() => {})
        await this.page.waitForTimeout(2000)
    }

    /**
     * 获取任务按钮列表
     *
     * 任务按钮在 quest 页面上的实际特征（2026-10 实测）：
     * - 多数为 <SPAN role="link" href="...">（href 不在 <a> 上，必须用 getAttribute 读取）
     * - 部分页面没有 role="link"，需要降级到 href 参数匹配
     * - 禁用态同时写 aria-disabled="true" 与 data-disabled="true"，不要再依赖 class
     * - 已完成的任务直接从 DOM 消失
     * - 排除导航栏与社交/法务链接
     */
    private async getTaskButtons(): Promise<PunchCardButton[]> {
        for (const selector of BUTTON_SELECTORS) {
            const buttons = await this.page.$$eval(selector, elements => {
                return elements
                    .filter(el => {
                        const href = el.getAttribute('href') || ''
                        const ariaLabel = (el.getAttribute('aria-label') || '').trim()

                        if (!href || !ariaLabel) return false
                        // 禁用态：优先读语义属性，class 仅作兜底
                        if (el.getAttribute('aria-disabled') === 'true') return false
                        if (el.getAttribute('data-disabled') === 'true') return false
                        if (/cursor-not-allowed/.test(String(el.className || ''))) return false
                        // 排除社交 / 法务 / 导航类链接
                        if (
                            /x\.com|twitter\.com|facebook\.com|instagram\.com|support\.microsoft\.com|privacy\.microsoft\.com|servicesagreement/i.test(
                                href
                            )
                        ) {
                            return false
                        }
                        if (el.closest('header, nav, footer')) return false

                        return true
                    })
                    .map(el => ({
                        ariaLabel: (el.getAttribute('aria-label') || '').trim(),
                        href: el.getAttribute('href') || ''
                    }))
            })

            if (buttons.length > 0) {
                this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD', `选择器命中 ${buttons.length} 个按钮: ${selector}`)
                return buttons
            }

            this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD', `选择器未命中: ${selector}`)
        }

        return []
    }

    /**
     * 统计任务页里任务型按钮的总数（含禁用态）。
     * 用于把「任务已完成，按钮消失」与「按钮还在但点不动」区分开，避免静默跳过。
     */
    private async countTaskLikeButtons(): Promise<number> {
        return await this.page
            .$$eval(CENSUS_SELECTOR, elements => {
                return elements.filter(el => {
                    const href = el.getAttribute('href') || ''
                    const ariaLabel = (el.getAttribute('aria-label') || '').trim()
                    if (!href || !ariaLabel) return false
                    if (/x\.com|twitter\.com|facebook\.com|instagram\.com|support\.microsoft\.com/i.test(href)) return false
                    if (el.closest('header, nav, footer')) return false
                    return true
                }).length
            })
            .catch(() => 0)
    }

    private async clickButton(button: PunchCardButton): Promise<void> {
        const buttonText = button.ariaLabel.split(',')[0]?.trim() ?? button.ariaLabel.split(' - ')[0]?.trim() ?? ''

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD-CLICK',
            `点击按钮: ${buttonText} | href=${button.href.substring(0, 80)}...`
        )

        if (!button.href) return

        // 通过 href 精确定位按钮。这里不限定标签名：任务按钮可能是 <a>，也可能是 <span role="link">
        const escapedHref = button.href.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        const locator = this.page.locator(`[href="${escapedHref}"]`).first()

        if (!(await locator.isVisible().catch(() => false))) {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD-CLICK', `按钮不可见: ${buttonText}`)
            return
        }

        // 使用 JavaScript 点击 + preventDefault 阻止默认导航
        // 这样 React 的 onClick (RSC Server Action POST) 能正常触发并完成
        try {
            // 监听 RSC Server Action POST 响应
            const rscResponsePromise = this.page
                .waitForResponse(
                    resp => {
                        const url = resp.url()
                        return (
                            url.includes('/earn') &&
                            resp.request().method() === 'POST' &&
                            resp.request().headers()['next-action'] !== undefined
                        )
                    },
                    { timeout: 8000 }
                )
                .catch(() => null)

            // 在元素自身上执行点击，屏蔽 <a> 的默认跳转（元素可能是 span，因此不能用 querySelector('a[href=...]')）
            await locator.evaluate(el => {
                el.addEventListener('click', e => e.preventDefault(), { once: true, capture: true })
                ;(el as HTMLElement).click()
            })

            // 等待 RSC POST 完成
            const rscResponse = await rscResponsePromise
            if (rscResponse) {
                this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD-CLICK', `RSC POST 已完成: ${buttonText}`)
            } else {
                this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD-CLICK', `未检测到 RSC POST 响应: ${buttonText}`)
            }

            await this.page.waitForLoadState('networkidle').catch(() => {})
            await this.page.waitForTimeout(2000)
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'PUNCHCARD-CLICK',
                `JS点击失败，尝试普通点击: ${error instanceof Error ? error.message : String(error)}`
            )

            // 回退：普通点击，处理可能的页面导航
            let newPage: Page | null = null
            try {
                const currentUrl = this.page.url()

                const newPagePromise = this.page
                    .context()
                    .waitForEvent('page', { timeout: 5000 })
                    .then(p => ({ type: 'newPage' as const, page: p }))
                    .catch(() => ({ type: 'timeout' as const, page: null as Page | null }))

                await locator.click()

                const result = await newPagePromise
                if (result.type === 'newPage' && result.page) {
                    newPage = result.page
                    await newPage.waitForLoadState('domcontentloaded')
                    this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD-CLICK', `新标签页: ${newPage.url()}`)
                } else {
                    await this.page.waitForTimeout(3000)
                    if (this.page.url() !== currentUrl) {
                        this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD-CLICK', `页面已导航到: ${this.page.url()}`)
                    }
                }
            } catch {
                // 点击或导航失败
            } finally {
                if (newPage && !newPage.isClosed()) {
                    try {
                        await newPage.close()
                    } catch {}
                }
            }

            await this.page.waitForLoadState('networkidle').catch(() => {})
        }

        // 模拟真实用户行为：访问目标页面
        if (button.href) {
            this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD-CLICK', `访问目标页面: ${button.href.substring(0, 80)}...`)
            try {
                await this.page.goto(button.href, { waitUntil: 'domcontentloaded', timeout: 30000 })
                await this.page.waitForTimeout(3000)
            } catch {
                // 导航失败不影响任务完成
            }
        }
    }
}
