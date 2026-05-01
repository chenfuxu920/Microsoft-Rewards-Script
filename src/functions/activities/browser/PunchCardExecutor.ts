import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../../index'
import type { PunchCard } from '../../../interface/DashboardData'

interface PunchCardButton {
    ariaLabel: string
    href: string
}

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
                this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `没有更多可点击的按钮 | title=${title}`)
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
        await this.page.goto(questUrl)
        await this.page.waitForLoadState('networkidle').catch(() => {})
        await this.page.waitForTimeout(2000)
    }

    /**
     * 获取任务按钮列表
     * 
     * 按钮在 quest 页面上渲染为 Fluent UI Link 组件：
     * - className 包含 "circular" (来自 RSC 数据: className: "circular w-fit")
     * - href 指向 bing.com/search 且包含 rnoreward=1
     * - 有 aria-label 属性
     * - 不可点击的按钮有 aria-disabled="true" 或 cursor-not-allowed 类
     * - 已完成的任务不会渲染为按钮（直接从 DOM 中消失）
     * 
     * 注意: offerId/isCompleted/isLocked 是 React 组件 props，不会渲染到 DOM 上
     */
    private async getTaskButtons(): Promise<PunchCardButton[]> {
        const buttons = await this.page.$$eval('a[class*="circular"]', elements => {
            return elements
                .filter(el => {
                    const href = (el as HTMLAnchorElement).href || ''
                    const ariaDisabled = el.getAttribute('aria-disabled') === 'true'
                    const hasCursorNotAllowed = el.classList.contains('cursor-not-allowed')
                    // 只保留有目标链接且未被禁用的按钮
                    return href.includes('bing.com/search') && !ariaDisabled && !hasCursorNotAllowed
                })
                .map(el => ({
                    ariaLabel: el.getAttribute('aria-label') || '',
                    href: (el as HTMLAnchorElement).href || ''
                }))
        })

        return buttons
    }

    private async clickButton(button: PunchCardButton): Promise<void> {
        const buttonText = button.ariaLabel.split(',')[0]?.trim() ?? button.ariaLabel.split(' - ')[0]?.trim() ?? ''

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD-CLICK',
            `点击按钮: ${buttonText} | href=${button.href.substring(0, 80)}...`
        )

        if (!button.href) return

        // 通过 href 精确定位按钮
        const locator = this.page.locator(`a[href="${button.href}"]`).first()

        if (!await locator.isVisible()) {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD-CLICK', `按钮不可见: ${buttonText}`)
            return
        }

        // 使用 JavaScript 点击 + preventDefault 阻止 <a> 的默认导航
        // 这样 React 的 onClick (RSC Server Action POST) 能正常触发并完成
        try {
            // 监听 RSC Server Action POST 响应
            const rscResponsePromise = this.page.waitForResponse(
                resp => {
                    const url = resp.url()
                    return url.includes('/earn') && resp.request().method() === 'POST'
                        && resp.request().headers()['next-action'] !== undefined
                },
                { timeout: 8000 }
            ).catch(() => null)

            // 通过 JS 点击按钮，阻止默认导航
            await this.page.evaluate((href) => {
                const link = document.querySelector(`a[href="${href}"]`) as HTMLAnchorElement
                if (link) {
                    link.addEventListener('click', (e) => {
                        e.preventDefault()
                    }, { once: true, capture: true })
                    link.click()
                }
            }, button.href)

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

                const newPagePromise = this.page.context().waitForEvent('page', { timeout: 5000 })
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
                    try { await newPage.close() } catch {}
                }
            }

            await this.page.waitForLoadState('networkidle').catch(() => {})
        }

        // 模拟真实用户行为：访问目标页面
        if (button.href) {
            this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD-CLICK', `访问目标页面: ${button.href.substring(0, 80)}...`)
            try {
                await this.page.goto(button.href)
                await this.page.waitForLoadState('domcontentloaded').catch(() => {})
                await this.page.waitForTimeout(3000)
            } catch {
                // 导航失败不影响任务完成
            }
        }
    }
}
