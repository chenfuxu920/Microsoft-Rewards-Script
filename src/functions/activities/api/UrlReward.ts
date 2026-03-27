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

        // 1. 导航到earn页面
        this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-MODERN', `导航到earn页面 | offerId=${offerId}`)

        await page.goto('https://rewards.bing.com/earn', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})

        // 2. 等待offer链接渲染（RSC流式加载，需要等DOM元素出现）
        await page.waitForSelector('a[href]', { state: 'attached', timeout: 15000 })

        // 3. 通过标题定位offer卡片并点击（触发RSC POST /earn + 跳转目标URL）
        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD-MODERN',
            `点击offer卡片 | offerId=${offerId} | 标题="${promotion.title}"`
        )

        try {
            const link = page.locator('a').filter({ hasText: promotion.title }).first()
            await link.waitFor({ state: 'visible', timeout: 10000 })
            await link.click()
            this.bot.logger.info(this.bot.isMobile, 'URL-REWARD-MODERN', `已点击offer卡片 | offerId=${offerId}`)
        } catch {
            this.bot.logger.warn(
                this.bot.isMobile,
                'URL-REWARD-MODERN',
                `未找到offer卡片 | offerId=${offerId} | 标题="${promotion.title}"`
            )
            return false
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
            `Modern流程未获得积分 | offerId=${offerId} | 旧余额=${this.oldBalance} | 新余额=${newBalance}`
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
