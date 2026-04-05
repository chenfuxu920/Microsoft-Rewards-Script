import type { Page, BrowserContext } from 'patchright'
import type { MicrosoftRewardsBot } from '../index'

interface BrowserSession {
    context: BrowserContext
    fingerprint: any
}

interface RelatedSearchResult {
    text: string
    href: string
}

export class ContinuousSearchManager {
    private bot: MicrosoftRewardsBot
    private bingHome = 'https://bing.com'
    private searchCount = 0
    private startTime = 0
    private maxDuration = 0
    private targetDepth = 0
    private usedQueries = new Set<string>()
    private currentSession: BrowserSession | null = null

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    private async closeAllTabsAndRecreate(page: Page, context: BrowserContext): Promise<Page> {
        try {
            const pages = context.pages()
            this.bot.logger.debug(
                this.bot.isMobile,
                'CONTINUOUS-SEARCH-CLEANUP',
                `关闭所有标签页 | 当前标签页数量=${pages.length}`
            )

            for (const p of pages) {
                if (!p.isClosed()) {
                    try {
                        await p.close()
                    } catch (error) {
                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'CONTINUOUS-SEARCH-CLEANUP',
                            `关闭标签页失败: ${error instanceof Error ? error.message : String(error)}`
                        )
                    }
                }
            }

            await this.bot.utils.wait(1000)

            const newPage = await context.newPage()
            this.bot.logger.debug(this.bot.isMobile, 'CONTINUOUS-SEARCH-CLEANUP', '已创建新的干净标签页')

            return newPage
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'CONTINUOUS-SEARCH-CLEANUP',
                `清理标签页失败: ${error instanceof Error ? error.message : String(error)}`
            )
            return page
        }
    }

    async runContinuousSearch(
        page: Page,
        isMobile: boolean,
        queries: string[],
        session?: BrowserSession
    ): Promise<{ searchCount: number; duration: number }> {
        const config = this.bot.config.continuousSearch

        if (!config.enabled) {
            this.bot.logger.info(isMobile, 'CONTINUOUS-SEARCH', '持续搜索未启用，跳过')
            return { searchCount: 0, duration: 0 }
        }

        this.currentSession = session ?? null
        let continuousPage: Page | null = null
        let pageCreated = false

        if (!this.currentSession && !page.isClosed()) {
            this.bot.logger.info(isMobile, 'CONTINUOUS-SEARCH', '使用现有浏览器页面执行持续搜索')
            continuousPage = page
        } else if (this.currentSession) {
            this.bot.logger.info(isMobile, 'CONTINUOUS-SEARCH', '创建新的浏览器页面执行持续搜索')
            try {
                continuousPage = await this.currentSession.context.newPage()
                pageCreated = true
            } catch (error) {
                this.bot.logger.error(
                    isMobile,
                    'CONTINUOUS-SEARCH',
                    `创建新页面失败: ${error instanceof Error ? error.message : String(error)}`
                )
                return { searchCount: 0, duration: 0 }
            }
        } else {
            this.bot.logger.error(isMobile, 'CONTINUOUS-SEARCH', '没有可用的浏览器会话，跳过持续搜索')
            return { searchCount: 0, duration: 0 }
        }

        this.startTime = Date.now()
        this.searchCount = 0
        this.usedQueries.clear()

        this.targetDepth = this.getRandomInt(config.depthMin, config.depthMax)
        this.maxDuration = this.getRandomInt(config.durationMin, config.durationMax) * 60 * 60 * 1000

        this.bot.logger.info(
            isMobile,
            'CONTINUOUS-SEARCH',
            `开始持续搜索 | 目标深度=${this.targetDepth}层 | 最大时长=${this.maxDuration / 1000 / 60}分钟`
        )

        const shuffledQueries = this.bot.utils.shuffleArray([...queries])
        let duration = 0

        try {
            await continuousPage.goto(this.bingHome, { timeout: 30000 })
            await continuousPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
            await this.bot.browser.utils.tryDismissAllMessages(continuousPage)

            for (const initialQuery of shuffledQueries) {
                if (this.shouldStop()) {
                    this.bot.logger.info(
                        isMobile,
                        'CONTINUOUS-SEARCH',
                        `达到停止条件 | 已搜索=${this.searchCount} | 运行时间=${this.getElapsedMinutes()}分钟`
                    )
                    break
                }

                const normalizedQuery = initialQuery.trim().toLowerCase()
                if (this.usedQueries.has(normalizedQuery)) {
                    continue
                }
                this.usedQueries.add(normalizedQuery)

                this.bot.logger.info(
                    isMobile,
                    'CONTINUOUS-SEARCH',
                    `开始新的搜索链 | 查询="${initialQuery}" | 当前深度=0/${this.targetDepth}`
                )

                await this.executeSearchChain(continuousPage, initialQuery, isMobile, 0)

                if (!this.shouldStop() && this.currentSession) {
                    this.bot.logger.info(
                        isMobile,
                        'CONTINUOUS-SEARCH',
                        '搜索链完成，关闭所有标签页并重新创建新标签页以释放内存'
                    )

                    continuousPage = await this.closeAllTabsAndRecreate(continuousPage, this.currentSession.context)

                    await continuousPage.goto(this.bingHome, { timeout: 30000 })
                    await continuousPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
                    await this.bot.browser.utils.tryDismissAllMessages(continuousPage)
                }

                const intervalMinutes = this.getRandomInt(config.queryIntervalMin, config.queryIntervalMax)
                this.bot.logger.info(
                    isMobile,
                    'CONTINUOUS-SEARCH',
                    `搜索链完成，等待${intervalMinutes}分钟后开始下一个搜索链`
                )

                if (!this.shouldStop()) {
                    await this.bot.utils.wait(intervalMinutes * 60 * 1000)
                }
            }
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'CONTINUOUS-SEARCH',
                `持续搜索出错: ${error instanceof Error ? error.message : String(error)}`
            )
        } finally {
            duration = Date.now() - this.startTime
            this.bot.logger.info(
                isMobile,
                'CONTINUOUS-SEARCH',
                `持续搜索完成 | 总搜索次数=${this.searchCount} | 总时长=${(duration / 1000 / 60).toFixed(1)}分钟`,
                'green'
            )

            if (pageCreated && continuousPage && !continuousPage.isClosed()) {
                try {
                    await continuousPage.close()
                    this.bot.logger.debug(isMobile, 'CONTINUOUS-SEARCH', '已关闭持续搜索页面')
                } catch (error) {
                    this.bot.logger.debug(
                        isMobile,
                        'CONTINUOUS-SEARCH',
                        `关闭页面时出错: ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }
        }

        return { searchCount: this.searchCount, duration }
    }

    private async executeSearchChain(
        page: Page,
        query: string,
        isMobile: boolean,
        currentDepth: number
    ): Promise<void> {
        if (currentDepth >= this.targetDepth || this.shouldStop()) {
            this.bot.logger.debug(
                isMobile,
                'CONTINUOUS-SEARCH-CHAIN',
                `搜索链结束 | 深度=${currentDepth}/${this.targetDepth}`
            )
            return
        }

        try {
            await this.performSearch(page, query, isMobile)
            this.searchCount++

            this.bot.logger.info(
                isMobile,
                'CONTINUOUS-SEARCH-CHAIN',
                `搜索完成 | 深度=${currentDepth + 1}/${this.targetDepth} | 查询="${query}" | 总次数=${this.searchCount}`
            )

            await this.bot.utils.wait(2000)
            await this.randomScroll(page, isMobile)

            await this.clickRandomSearchResults(page, isMobile)

            const relatedSearches = await this.getRelatedSearches(page, isMobile)

            if (relatedSearches.length > 0) {
                const selectedRelated = this.selectRandomRelated(relatedSearches, query)

                if (selectedRelated) {
                    const nextQuery = selectedRelated.text
                    const normalizedNext = nextQuery.trim().toLowerCase()

                    if (!this.usedQueries.has(normalizedNext)) {
                        this.usedQueries.add(normalizedNext)

                        this.bot.logger.debug(isMobile, 'CONTINUOUS-SEARCH-CHAIN', `点击关联搜索 | 文本="${nextQuery}"`)

                        await this.bot.utils.wait(this.getRandomInt(3000, 8000))

                        await this.executeSearchChain(page, nextQuery, isMobile, currentDepth + 1)
                        return
                    }
                }
            }

            this.bot.logger.debug(
                isMobile,
                'CONTINUOUS-SEARCH-CHAIN',
                `无可用关联搜索，结束当前链 | 深度=${currentDepth + 1}`
            )
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'CONTINUOUS-SEARCH-CHAIN',
                `搜索链执行错误 | 深度=${currentDepth} | 错误=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async performSearch(page: Page, query: string, isMobile: boolean): Promise<void> {
        const maxAttempts = 3

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const searchBar = '#sb_form_q'
                const searchBox = page.locator(searchBar)

                await page.evaluate(() => {
                    window.scrollTo({ left: 0, top: 0, behavior: 'auto' })
                })

                await page.keyboard.press('Home')
                await searchBox.waitFor({ state: 'visible', timeout: 15000 })

                await this.bot.utils.wait(1000)
                await this.bot.browser.utils.ghostClick(page, searchBar, { clickCount: 3 })

                await page.evaluate(() => {
                    const searchBox = document.querySelector('#sb_form_q') as HTMLInputElement
                    if (searchBox) {
                        searchBox.removeAttribute('readonly')
                        searchBox.value = ''
                    }
                })

                await searchBox.fill('')

                await page.keyboard.type(query, { delay: 50 })
                await page.keyboard.press('Enter')

                this.bot.logger.debug(
                    isMobile,
                    'CONTINUOUS-SEARCH-PERFORM',
                    `搜索已提交 | 查询="${query}" | 尝试=${attempt + 1}/${maxAttempts}`
                )

                await this.bot.utils.wait(3000)
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

                return
            } catch (error) {
                if (attempt >= maxAttempts - 1) {
                    throw error
                }

                this.bot.logger.warn(
                    isMobile,
                    'CONTINUOUS-SEARCH-PERFORM',
                    `搜索失败，重试 | 尝试=${attempt + 1}/${maxAttempts} | 错误=${error instanceof Error ? error.message : String(error)}`
                )

                await this.bot.utils.wait(2000)
            }
        }
    }

    private async getRelatedSearches(page: Page, isMobile: boolean): Promise<RelatedSearchResult[]> {
        const relatedSearches: RelatedSearchResult[] = []

        try {
            await this.bot.utils.wait(1000)

            const selectors = isMobile
                ? ['#b_results .b_rs a', '.b_rs a', 'a[href*="search?q="]']
                : ['#b_results .b_rs a', '.b_ans .b_vlist2col a', 'li.b_vlist2col a']

            for (const selector of selectors) {
                try {
                    const elements = await page.$$(selector)

                    for (const element of elements) {
                        const text = await element.textContent()
                        const href = await element.getAttribute('href')

                        if (text && href && text.trim().length > 0) {
                            relatedSearches.push({
                                text: text.trim(),
                                href: href
                            })
                        }
                    }

                    if (relatedSearches.length > 0) {
                        break
                    }
                } catch {
                    continue
                }
            }

            this.bot.logger.debug(isMobile, 'CONTINUOUS-SEARCH-RELATED', `找到${relatedSearches.length}个关联搜索`)
        } catch (error) {
            this.bot.logger.warn(
                isMobile,
                'CONTINUOUS-SEARCH-RELATED',
                `获取关联搜索失败: ${error instanceof Error ? error.message : String(error)}`
            )
        }

        return relatedSearches
    }

    private selectRandomRelated(
        relatedSearches: RelatedSearchResult[],
        currentQuery: string
    ): RelatedSearchResult | null {
        if (relatedSearches.length === 0) {
            return null
        }

        const filtered = relatedSearches.filter(rs => {
            const normalizedText = rs.text.trim().toLowerCase()
            const normalizedCurrent = currentQuery.trim().toLowerCase()
            return normalizedText !== normalizedCurrent && !this.usedQueries.has(normalizedText)
        })

        if (filtered.length === 0) {
            const randomIndex = Math.floor(Math.random() * relatedSearches.length)
            return relatedSearches[randomIndex] ?? null
        }

        const randomIndex = Math.floor(Math.random() * filtered.length)
        return filtered[randomIndex] ?? null
    }

    private async randomScroll(page: Page, isMobile: boolean): Promise<void> {
        try {
            const scrollTimes = this.getRandomInt(2, 5)

            for (let i = 0; i < scrollTimes; i++) {
                const viewportHeight = await page.evaluate(() => window.innerHeight)
                const totalHeight = await page.evaluate(() => document.body.scrollHeight)
                const randomScrollPosition = Math.floor(Math.random() * (totalHeight - viewportHeight))

                await page.evaluate((scrollPos: number) => {
                    window.scrollTo({ left: 0, top: scrollPos, behavior: 'smooth' })
                }, randomScrollPosition)

                await this.bot.utils.wait(this.getRandomInt(500, 1500))
            }

            this.bot.logger.debug(isMobile, 'CONTINUOUS-SEARCH-SCROLL', `随机滚动完成 | 次数=${scrollTimes}`)
        } catch (error) {
            this.bot.logger.debug(
                isMobile,
                'CONTINUOUS-SEARCH-SCROLL',
                `随机滚动失败: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async clickRandomSearchResults(page: Page, isMobile: boolean): Promise<void> {
        try {
            const clickCount = this.getRandomInt(3, 5)
            this.bot.logger.debug(isMobile, 'CONTINUOUS-SEARCH-RESULTS', `开始点击搜索结果 | 目标点击数=${clickCount}`)

            const resultSelectors = isMobile
                ? ['#b_results > li:not(.b_promote):not(.b_ans):not(.b_msg) h2 a', '#b_results h2 a', '.b_title h2 a']
                : ['#b_results > li:not(.b_promote):not(.b_ans):not(.b_msg) h2 a', '#b_results h2 a', '.b_title h2 a']

            let clickedCount = 0

            for (let i = 0; i < clickCount; i++) {
                try {
                    let selectedSelector = ''
                    let elements: any[] = []

                    for (const selector of resultSelectors) {
                        try {
                            elements = await page.$$(selector)
                            if (elements.length > 0) {
                                selectedSelector = selector
                                break
                            }
                        } catch {
                            continue
                        }
                    }

                    if (elements.length === 0) {
                        this.bot.logger.debug(
                            isMobile,
                            'CONTINUOUS-SEARCH-RESULTS',
                            `未找到可点击的搜索结果 | 尝试=${i + 1}/${clickCount}`
                        )
                        continue
                    }

                    const validIndices: number[] = []
                    for (let j = 0; j < elements.length; j++) {
                        try {
                            const isVisible = await elements[j].isVisible()
                            const href = await elements[j].getAttribute('href')
                            if (isVisible && href && !href.startsWith('javascript')) {
                                validIndices.push(j)
                            }
                        } catch {
                            continue
                        }
                    }

                    if (validIndices.length === 0) {
                        continue
                    }

                    const randomIndexValue = validIndices[Math.floor(Math.random() * validIndices.length)]
                    if (randomIndexValue === undefined) {
                        continue
                    }
                    const targetElement = elements[randomIndexValue]

                    const href = (await targetElement.getAttribute('href')) || ''
                    const title = (await targetElement.textContent()) || ''

                    await this.bot.utils.wait(this.getRandomInt(500, 1500))

                    try {
                        await targetElement.click()
                    } catch {
                        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {})
                    }

                    clickedCount++
                    this.bot.logger.debug(
                        isMobile,
                        'CONTINUOUS-SEARCH-RESULTS',
                        `已点击搜索结果 | ${clickedCount}/${clickCount} | "${title.substring(0, 30)}..."`
                    )

                    await this.bot.utils.wait(this.getRandomInt(2000, 5000))

                    if (!isMobile) {
                        const context = page.context()
                        const pages = context.pages()

                        if (pages.length > 1) {
                            const newTabs = pages.filter(p => p !== page && !p.isClosed())
                            for (const tab of newTabs) {
                                try {
                                    await tab.close()
                                    this.bot.logger.debug(isMobile, 'CONTINUOUS-SEARCH-RESULTS', '已关闭新打开的标签页')
                                } catch {}
                            }
                        }
                    } else {
                        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
                    }

                    await this.bot.utils.wait(this.getRandomInt(1000, 2000))
                } catch (error) {
                    this.bot.logger.debug(
                        isMobile,
                        'CONTINUOUS-SEARCH-RESULTS',
                        `点击第${i + 1}个结果失败: ${error instanceof Error ? error.message : String(error)}`
                    )
                    try {
                        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
                    } catch {}
                }
            }

            this.bot.logger.debug(
                isMobile,
                'CONTINUOUS-SEARCH-RESULTS',
                `搜索结果点击完成 | 成功点击=${clickedCount}/${clickCount}`
            )
        } catch (error) {
            this.bot.logger.debug(
                isMobile,
                'CONTINUOUS-SEARCH-RESULTS',
                `点击搜索结果出错: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private shouldStop(): boolean {
        const elapsed = Date.now() - this.startTime
        return elapsed >= this.maxDuration
    }

    private getElapsedMinutes(): number {
        return Math.floor((Date.now() - this.startTime) / 1000 / 60)
    }

    private getRandomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }
}
