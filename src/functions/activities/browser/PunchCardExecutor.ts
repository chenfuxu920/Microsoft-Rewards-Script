import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../../index'
import type { PunchCard } from '../../../interface/DashboardData'

interface PunchCardButton {
    ariaLabel: string
    href: string
    tagName: string
    offerId?: string
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
        await this.page.goto(questUrl)
        await this.page.waitForLoadState('networkidle').catch(() => {})
        await this.page.waitForTimeout(2000)

        // 获取任务按钮
        const buttons = await this.getTaskButtons()

        if (buttons.length === 0) {
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `没有可点击的按钮,任务可能已完成 | title=${title}`)
            return
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `找到 ${buttons.length} 个任务按钮`)
        for (const btn of buttons) {
            const text = btn.ariaLabel.split(',')[0]?.trim() ?? ''
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `  - ${text} | tag=${btn.tagName}`)
        }

        for (const button of buttons) {
            await this.clickButton(button)
            await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 5000))
        }

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `处理完成: ${title}`)
    }

    private async getTaskButtons(): Promise<PunchCardButton[]> {
        const buttons = await this.page.$$eval('a[href]', elements => {
            return elements
                .filter(el => {
                    const className = el.className || ''
                    const isPrimaryButton = className.includes('bg-brandBg1')
                    const isDisabled =
                        className.includes('cursor-not-allowed') || className.includes('bg-neutralBgDisabled')
                    return isPrimaryButton && !isDisabled
                })
                .map(el => ({
                    ariaLabel: el.getAttribute('aria-label') || '',
                    href: (el as HTMLAnchorElement).href || '',
                    tagName: el.tagName.toLowerCase(),
                    offerId: el.getAttribute('offerid') || undefined
                }))
        })

        return buttons
    }

    private async clickButton(button: PunchCardButton): Promise<void> {
        const buttonText = button.ariaLabel.split(',')[0]?.trim() ?? button.ariaLabel.split(' - ')[0]?.trim() ?? ''

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD-CLICK',
            `点击按钮: ${buttonText} | tag=${button.tagName} | href=${button.href.substring(0, 60)}...`
        )

        if (!buttonText) return

        let locator
        if (button.tagName === 'a' && button.href) {
            locator = this.page.locator(`a[href="${button.href}"]`).first()
        } else {
            const escapedLabel = button.ariaLabel.replace(/"/g, '\\"')
            locator = this.page.locator(`[aria-label="${escapedLabel}"]`).first()
        }

        if (await locator.isVisible()) {
            let newPage: Page | null = null
            try {
                await locator.click()

                newPage = await this.page.context().waitForEvent('page', { timeout: 5000 })
                await newPage.waitForLoadState('domcontentloaded')
                this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD-CLICK', `新标签页: ${newPage.url()}`)
                await this.page.waitForTimeout(3000)
            } catch {
                // 没有新标签页
            } finally {
                if (newPage && !newPage.isClosed()) {
                    try {
                        await newPage.close()
                        this.bot.logger.debug(this.bot.isMobile, 'PUNCHCARD-CLICK', '已关闭新标签页')
                    } catch {}
                }
            }

            await this.page.waitForLoadState('networkidle').catch(() => {})
        } else {
            this.bot.logger.warn(this.bot.isMobile, 'PUNCHCARD-CLICK', `按钮不可见: ${buttonText}`)
        }
    }
}
