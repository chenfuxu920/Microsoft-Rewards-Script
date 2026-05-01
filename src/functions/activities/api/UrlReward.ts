import type { AxiosRequestConfig } from 'axios'
import { randomUUID } from 'crypto'
import type { Page } from 'patchright'
import type { BasePromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'

export class UrlReward extends Workers {
    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doUrlReward(promotion: BasePromotion) {
        const offerId = promotion.offerId

        // 优先级: modern > dapi > legacy
        // modern通过浏览器点击触发RSC Server Action，是最可靠的方式
        // dapi/legacy缺少RSC激活步骤，可能无法完成部分任务
        const hasPage = !!(this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage)

        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD',
            `开始UrlReward | offerId=${offerId} | 有浏览器=${hasPage} | 地区=${this.bot.userData.geoLocale} | 旧余额=${this.oldBalance}`
        )

        try {
            let success = false

            // 始终优先尝试modern流程（浏览器点击触发RSC Server Action）
            if (hasPage) {
                success = await this.doModernFlow(promotion)
            }

            // modern失败时回退到API方式
            if (!success && this.bot.accessToken) {
                this.bot.logger.info(this.bot.isMobile, 'URL-REWARD', 'Modern流程失败，尝试dapi流程')
                success = await this.doDapiFlow(promotion)
            }
            if (!success && this.bot.requestToken) {
                this.bot.logger.info(this.bot.isMobile, 'URL-REWARD', '尝试legacy流程')
                success = await this.doLegacyFlow(promotion)
            }

            if (success) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `完成UrlReward | offerId=${offerId} | 获得积分=${this.gainedPoints} | 新余额=${this.oldBalance + this.gainedPoints}`,
                    'green'
                )
            }

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'URL-REWARD',
                `doUrlReward中出错 | offerId=${promotion.offerId} | 消息=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async doDapiFlow(promotion: BasePromotion): Promise<boolean> {
        const offerId = promotion.offerId

        if (!this.bot.accessToken) {
            this.bot.logger.warn(this.bot.isMobile, 'URL-REWARD-DAPI', '跳过：没有accessToken')
            return false
        }

        try {
            // 步骤1: 执行搜索（如果promotion有destinationUrl）
            if (promotion.destinationUrl) {
                await this.executeSearch(promotion.destinationUrl, offerId)
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD-DAPI',
                    `没有destinationUrl，直接报告完成 | offerId=${offerId}`
                )
            }

            // 步骤2: 等待一段时间，模拟真实用户行为
            await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 5000))

            // 步骤3: 报告活动完成
            const success = await this.reportActivityComplete(offerId)

            return success
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'URL-REWARD-DAPI',
                `Dapi流程出错 | offerId=${offerId} | 消息=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    private async executeSearch(destinationUrl: string, offerId: string): Promise<void> {
        try {
            // 解析destination URL
            const url = new URL(destinationUrl)
            const searchQuery = url.searchParams.get('q')

            if (!searchQuery) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'URL-REWARD-DAPI',
                    `destinationUrl中没有搜索关键词 | offerId=${offerId} | destinationUrl=${destinationUrl}`
                )
                return
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'URL-REWARD-DAPI',
                `执行搜索 | offerId=${offerId} | 关键词="${searchQuery}"`
            )

            // 构建搜索请求
            const cookieHeader = this.bot.browser.func.buildCookieHeader(
                this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
                ['bing.com', 'live.com', 'microsoftonline.com']
            )

            // 从destinationUrl中提取必要的参数
            const searchParams = new URLSearchParams()
            searchParams.set('q', searchQuery)

            // 添加其他参数（如果存在）
            const form = url.searchParams.get('form')
            const ocid = url.searchParams.get('OCID')
            const publ = url.searchParams.get('PUBL')
            const crea = url.searchParams.get('CREA')

            if (form) searchParams.set('form', form)
            if (ocid) searchParams.set('OCID', ocid)
            if (publ) searchParams.set('PUBL', publ)
            if (crea) searchParams.set('CREA', crea)

            // 添加额外参数
            searchParams.set('rnoreward', '1')
            searchParams.set('safesearch', 'moderate')
            searchParams.set('setlang', 'zh-hans')
            searchParams.set('cc', this.bot.userData.geoLocale || 'cn')

            const searchUrl = `https://cn.bing.com/search?${searchParams.toString()}`

            const request: AxiosRequestConfig = {
                url: searchUrl,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    'User-Agent': this.bot.isMobile
                        ? 'Mozilla/5.0 (Linux; Android 12; ALN-AL00 Build/V417IR; ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.5481.154 Mobile Safari/537.36 BingSapphire/32.6.2110003561'
                        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
                    Cookie: cookieHeader,
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                    Referer: 'https://rewards.bing.com/'
                }
            }

            const response = await this.bot.axios.request(request)
            this.bot.logger.info(
                this.bot.isMobile,
                'URL-REWARD-DAPI',
                `搜索完成 | offerId=${offerId} | 状态=${response.status}`
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'URL-REWARD-DAPI',
                `搜索失败 | offerId=${offerId} | 消息=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async reportActivityComplete(offerId: string): Promise<boolean> {
        const jsonData = {
            id: randomUUID(),
            amount: 1,
            type: 101,
            attributes: {
                offerid: offerId
            },
            country: this.bot.userData.geoLocale
        }

        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD-DAPI',
            `报告活动完成 | offerId=${offerId} | id=${jsonData.id}`
        )

        const request: AxiosRequestConfig = {
            url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.bot.accessToken}`,
                'User-Agent': this.bot.isMobile
                    ? 'Bing/32.6.2110003561 (com.microsoft.bing; build:2110003561; Android 12) Alamofire/5.10.2'
                    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Type': 'application/json',
                'X-Rewards-Country': this.bot.userData.geoLocale,
                'X-Rewards-Language': 'zh-CN',
                'X-Rewards-ismobile': this.bot.isMobile ? 'true' : 'false'
            },
            data: JSON.stringify(jsonData)
        }

        try {
            const response = await this.bot.axios.request(request)

            this.bot.logger.debug(
                this.bot.isMobile,
                'URL-REWARD-DAPI',
                `收到响应 | offerId=${offerId} | 状态=${response.status}`
            )

            const newBalance = Number(response?.data?.response?.balance ?? this.oldBalance)
            this.gainedPoints = newBalance - this.oldBalance

            if (this.gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints
                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD-DAPI',
                    `Dapi流程完成 | offerId=${offerId} | 旧余额=${this.oldBalance} | 新余额=${newBalance} | 获得积分=${this.gainedPoints}`,
                    'green'
                )
                return true
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'URL-REWARD-DAPI',
                `Dapi流程未获得积分 | offerId=${offerId} | 旧余额=${this.oldBalance} | 新余额=${newBalance}`
            )
            return false
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'URL-REWARD-DAPI',
                `报告活动完成失败 | offerId=${offerId} | 消息=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    private async doModernFlow(promotion: BasePromotion): Promise<boolean> {
        const offerId = promotion.offerId
        const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage

        if (!page) {
            this.bot.logger.warn(this.bot.isMobile, 'URL-REWARD-MODERN', '没有可用的浏览器页面')
            return false
        }

        // 1. 导航到earn页面
        this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-MODERN', `导航到earn页面 | offerId=${offerId}`)
        await page.goto('https://rewards.bing.com/earn', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})

        // 2. 等待offer链接渲染（RSC流式加载，需要等DOM元素出现）
        await page.waitForSelector('a[href]', { state: 'attached', timeout: 15000 }).catch(() => {})

        // 3. 多策略定位offer卡片并点击
        let clicked = false
        let rscTriggered = false

        // 策略1: 通过标题文本定位
        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD-MODERN',
            `策略1: 通过标题定位 | offerId=${offerId} | 标题="${promotion.title}"`
        )
        try {
            const link = page.locator('a').filter({ hasText: promotion.title }).first()
            await link.waitFor({ state: 'visible', timeout: 8000 })
            rscTriggered = await this.clickAndWaitRscAction(page, link, offerId)
            clicked = true
        } catch {
            this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD-MODERN', `策略1失败: 标题未找到 | offerId=${offerId}`)
        }

        // 策略2: 滚动页面后再次通过标题定位（处理首屏下方的offer）
        if (!clicked) {
            this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-MODERN', `策略2: 滚动后通过标题定位 | offerId=${offerId}`)
            try {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
                await this.bot.utils.wait(2000)

                const link = page.locator('a').filter({ hasText: promotion.title }).first()
                await link.waitFor({ state: 'visible', timeout: 5000 })
                rscTriggered = await this.clickAndWaitRscAction(page, link, offerId)
                clicked = true
            } catch {
                this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD-MODERN', `策略2失败 | offerId=${offerId}`)
            }
        }

        // 策略3: 通过destinationUrl中的搜索关键词定位
        if (!clicked && promotion.destinationUrl) {
            this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-MODERN', `策略3: 通过destinationUrl定位 | offerId=${offerId}`)
            try {
                const destUrl = new URL(promotion.destinationUrl)
                const searchQuery = destUrl.searchParams.get('q')
                if (searchQuery) {
                    const encodedQuery = encodeURIComponent(searchQuery)
                    const link = page.locator(`a[href*="${encodedQuery}"]`).first()
                    await link.waitFor({ state: 'visible', timeout: 5000 })
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'URL-REWARD-MODERN',
                        `通过destinationUrl找到offer卡片 | offerId=${offerId} | 关键词="${searchQuery}"`
                    )
                    rscTriggered = await this.clickAndWaitRscAction(page, link, offerId)
                    clicked = true
                }
            } catch {
                this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD-MODERN', `策略3失败 | offerId=${offerId}`)
            }
        }

        // 策略4: 滚动 + destinationUrl定位
        if (!clicked && promotion.destinationUrl) {
            this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-MODERN', `策略4: 滚动后通过destinationUrl定位 | offerId=${offerId}`)
            try {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
                await this.bot.utils.wait(2000)

                const destUrl = new URL(promotion.destinationUrl)
                const searchQuery = destUrl.searchParams.get('q')
                if (searchQuery) {
                    const encodedQuery = encodeURIComponent(searchQuery)
                    const link = page.locator(`a[href*="${encodedQuery}"]`).first()
                    await link.waitFor({ state: 'visible', timeout: 5000 })
                    rscTriggered = await this.clickAndWaitRscAction(page, link, offerId)
                    clicked = true
                }
            } catch {
                this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD-MODERN', `策略4失败 | offerId=${offerId}`)
            }
        }

        if (!clicked) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'URL-REWARD-MODERN',
                `所有策略均未找到offer卡片 | offerId=${offerId} | 标题="${promotion.title}"`
            )
            return false
        }

        if (rscTriggered) {
            this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-MODERN', `RSC Server Action已触发 | offerId=${offerId}`)
        } else {
            this.bot.logger.warn(this.bot.isMobile, 'URL-REWARD-MODERN', `RSC Server Action未检测到，积分可能不会增加 | offerId=${offerId}`)
        }

        // 4. 等待目标页面加载完成
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
        await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 8000))

        // 5. 验证积分
        const newBalance = await this.bot.browser.func.getCurrentPoints()
        this.gainedPoints = newBalance - this.oldBalance

        if (this.gainedPoints > 0) {
            this.bot.userData.currentPoints = newBalance
            this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints
            this.bot.logger.info(
                this.bot.isMobile,
                'URL-REWARD-MODERN',
                `Modern流程完成 | offerId=${offerId} | 旧余额=${this.oldBalance} | 新余额=${newBalance} | 获得积分=${this.gainedPoints}`,
                'green'
            )
            return true
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'URL-REWARD-MODERN',
            `Modern流程未获得积分 | offerId=${offerId} | 旧余额=${this.oldBalance} | 新余额=${newBalance} | RSC触发=${rscTriggered}`
        )
        return false
    }

    /**
     * 点击offer卡片并等待RSC Server Action完成
     * 点击earn页面上的offer卡片会触发Next.js RSC Server Action（POST /earn），
     * 这是激活offer并获取积分的必要步骤
     */
    private async clickAndWaitRscAction(page: Page, link: import('patchright').Locator, offerId: string): Promise<boolean> {
        // 监听RSC Server Action请求（POST /earn 且带有next-action头）
        const rscResponsePromise = page.waitForResponse(
            resp => {
                try {
                    const url = new URL(resp.url())
                    if (url.pathname === '/earn' && resp.request().method() === 'POST') {
                        const headers = resp.request().headers()
                        return !!headers['next-action']
                    }
                } catch { /* ignore */ }
                return false
            },
            { timeout: 10000 }
        ).catch(() => null)

        await link.click()
        this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-MODERN', `已点击offer卡片 | offerId=${offerId}`)

        const rscResp = await rscResponsePromise
        if (rscResp) {
            try {
                const body = await rscResp.text()
                // RSC action成功时返回 "1:true"
                const success = body.includes('true')
                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD-MODERN',
                    `RSC响应 | offerId=${offerId} | 状态=${rscResp.status()} | 成功=${success}`
                )
                return success
            } catch {
                this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD-MODERN', `RSC响应读取失败 | offerId=${offerId}`)
                return true // 请求已发送，可能是成功的
            }
        }

        return false
    }

    private async doLegacyFlow(promotion: BasePromotion): Promise<boolean> {
        const offerId = promotion.offerId

        const cookieHeader = this.bot.browser.func.buildCookieHeader(
            this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop,
            ['bing.com', 'live.com', 'microsoftonline.com']
        )

        const formData = new URLSearchParams({
            id: offerId,
            hash: promotion.hash ?? '',
            timeZone: '60',
            activityAmount: '1',
            dbs: '0',
            form: '',
            type: '',
            __RequestVerificationToken: this.bot.requestToken ?? ''
        })

        this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-LEGACY', `发送legacy请求 | offerId=${offerId}`)

        const request: AxiosRequestConfig = {
            url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
            method: 'POST',
            headers: {
                ...(this.bot.fingerprint?.headers ?? {}),
                Cookie: cookieHeader,
                Referer: 'https://rewards.bing.com/',
                Origin: 'https://rewards.bing.com'
            },
            data: formData
        }

        const response = await this.bot.axios.request(request)
        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD-LEGACY',
            `收到legacy响应 | offerId=${offerId} | 状态=${response.status}`
        )

        const newBalance = await this.bot.browser.func.getCurrentPoints()
        this.gainedPoints = newBalance - this.oldBalance

        if (this.gainedPoints > 0) {
            this.bot.userData.currentPoints = newBalance
            this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints
            return true
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'URL-REWARD-LEGACY',
            `Legacy流程未获得积分 | offerId=${offerId} | 状态=${response.status} | 旧余额=${this.oldBalance} | 新余额=${newBalance}`
        )
        return false
    }
}
