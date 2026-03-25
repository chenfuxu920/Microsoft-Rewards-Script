import type { AxiosRequestConfig } from 'axios'
import type { BasePromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'

export class UrlReward extends Workers {
    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doUrlReward(promotion: BasePromotion) {
        const offerId = promotion.offerId
        // 有token才能走legacy，没有token只能走modern（浏览器点击）
        const useModern = !this.bot.requestToken

        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD',
            `开始UrlReward | offerId=${offerId} | 模式=${useModern ? 'modern' : 'legacy'} | 地区=${this.bot.userData.geoLocale} | 旧余额=${this.oldBalance}`
        )

        try {
            let success = false

            if (useModern) {
                success = await this.doModernFlow(promotion)
            } else {
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

    private async doModernFlow(promotion: BasePromotion): Promise<boolean> {
        const offerId = promotion.offerId
        const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage

        // 1. 导航到目标URL（Bing搜索页会自动触发reportActivity完成任务）
        const destinationUrl = promotion.destinationUrl
        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD-MODERN',
            `导航到目标URL | offerId=${offerId} | url=${destinationUrl}`
        )

        try {
            await page.goto(destinationUrl, { timeout: 30000 })
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
        } catch (navError) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'URL-REWARD-MODERN',
                `导航失败 | offerId=${offerId} | 消息=${navError instanceof Error ? navError.message : String(navError)}`
            )
            return false
        }

        // 2. 等待reportActivity自动触发（搜索页加载时自动调用）
        await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 8000))

        // 3. 验证积分
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

        // 4. 如果没积分，尝试访问earn页面点击offer卡片（触发RSC POST /earn）
        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD-MODERN',
            `直接访问未获得积分，尝试通过earn页面点击 | offerId=${offerId}`
        )

        try {
            await page
                .goto('https://rewards.bing.com/earn', { waitUntil: 'networkidle', timeout: 30000 })
                .catch(() => {})

            // 等待offer内容渲染完成（RSC页面流式加载，networkidle不保证DOM渲染完毕）
            await page.waitForSelector('a[href*="search"]', { state: 'attached', timeout: 15000 })

            // 通过标题匹配offer卡片
            const link = page.locator(`a[href*="search"]`).filter({ hasText: promotion.title }).first()
            await link.waitFor({ state: 'visible', timeout: 10000 })
            await link.click()
            this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-MODERN', `已点击offer卡片 | offerId=${offerId}`)

            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 8000))
        } catch {
            this.bot.logger.warn(this.bot.isMobile, 'URL-REWARD-MODERN', `earn页面点击失败 | offerId=${offerId}`)
        }

        // 最终验证
        const finalBalance = await this.bot.browser.func.getCurrentPoints()
        this.gainedPoints = finalBalance - this.oldBalance

        if (this.gainedPoints > 0) {
            this.bot.userData.currentPoints = finalBalance
            this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints
            this.bot.logger.info(
                this.bot.isMobile,
                'URL-REWARD-MODERN',
                `Modern流程完成（通过earn页面） | offerId=${offerId} | 获得积分=${this.gainedPoints}`,
                'green'
            )
            return true
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'URL-REWARD-MODERN',
            `Modern流程未获得积分 | offerId=${offerId} | 旧余额=${this.oldBalance} | 新余额=${finalBalance}`
        )
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
            hash: promotion.hash,
            timeZone: '60',
            activityAmount: '1',
            dbs: '0',
            form: '',
            type: '',
            __RequestVerificationToken: this.bot.requestToken
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
