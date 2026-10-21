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
 * 「激活」按钮选择器。
 *
 * 打卡任务（Duolingo 这类）未激活时，页面上唯一可用的是「立即激活」，
 * 其余子任务全部 aria-disabled="true"。必须先点掉它，14 天计时才开始。
 *
 * 注意不能靠 href 识别：激活后同一个按钮只是把文案改成「继续搜索」，
 * href 仍是同一个 urlreward 包装（id=..._Activate&channel=urlreward&hash=...），
 * 用 href 子串匹配会把「继续搜索」也一起命中，导致循环反复点它。
 * 因此这里只按无障碍标签的语义匹配，并且同时覆盖中英文界面。
 *
 * 激活的完成条件是访问该 redirect URL（channel=urlreward），
 * clickButton() 点击后本来就会 goto(button.href)，所以只要把它选中就能自动激活。
 */
const ACTIVATE_SELECTOR = '[aria-label*="激活"][href], [aria-label*="Activate"][href]'

/**
 * 统计任务页里"看起来像任务按钮"的元素总数（含禁用态），
 * 用于区分「任务真的做完了」和「按钮存在但全部不可用」。
 *
 * 不能用 `[href*="form="]`：激活按钮的 href 被 URL 编码，会被漏计，
 * 导致「还有激活按钮没点」被误判成「全部不可用」。
 */
const CENSUS_SELECTOR = '[aria-label][href]'

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

        // 循环处理每个可点击按钮，每次只点一个然后刷新页面状态。
        // 已点过的 href 会被排除：像「立即激活→继续搜索」这种按钮点击后 href 不变，
        // 不记录的话会在同一轮里被反复点击，把 maxAttempts 耗尽。
        const clickedHrefs = new Set<string>()
        let maxAttempts = 10
        while (maxAttempts-- > 0) {
            const candidates = await this.getTaskButtons()
            const buttons = candidates.filter(button => !clickedHrefs.has(button.href))

            if (buttons.length === 0) {
                if (candidates.length > 0) {
                    // 剩下的候选本轮都点过了，等下一次运行再处理
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'PUNCHCARD',
                        `本轮已点击 ${clickedHrefs.size} 个按钮，没有新的可点按钮 | title=${title}`
                    )
                    break
                }

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

            clickedHrefs.add(button.href)

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
        // 激活按钮必须最先处理：未激活时其余子任务全是 aria-disabled，
        // 而它的 href 被 URL 编码，下面任何一层 form= 选择器都命中不到。
        const activateButtons = await this.getActivateButtons()
        if (activateButtons.length > 0) {
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', `检测到未激活的打卡任务，优先点击激活按钮`)
            return activateButtons
        }

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
     * 找出待点击的「立即激活」按钮。
     *
     * 只返回可用（未 disabled）的激活按钮，且最多 1 个：
     * 一个打卡任务只会有一次激活，重复点击没有意义。
     */
    private async getActivateButtons(): Promise<PunchCardButton[]> {
        return await this.page
            .$$eval(ACTIVATE_SELECTOR, elements => {
                return elements
                    .filter(el => {
                        const href = el.getAttribute('href') || ''
                        const ariaLabel = (el.getAttribute('aria-label') || '').trim()
                        if (!href || !ariaLabel) return false
                        if (el.getAttribute('aria-disabled') === 'true') return false
                        if (el.getAttribute('data-disabled') === 'true') return false
                        if (el.closest('header, nav, footer')) return false
                        return true
                    })
                    .slice(0, 1)
                    .map(el => ({
                        ariaLabel: (el.getAttribute('aria-label') || '').trim(),
                        href: el.getAttribute('href') || ''
                    }))
            })
            .catch(() => [] as PunchCardButton[])
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
