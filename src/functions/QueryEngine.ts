import type { AxiosRequestConfig } from 'axios'
import * as fs from 'fs'
import path from 'path'
import type {
    GoogleSearch,
    GoogleTrendsResponse,
    RedditListing,
    WikipediaTopResponse,
    HackerNewsItem,
    GitHubTrendingRepo,
    StackOverflowResponse,
    JuejinHotItem,
    V2EXTopic,
    SegmentFaultArticle,
    OSChinaNews,
    CSDNHotItem,
    CnblogsHotItem
} from '../interface/Search'
import type { MicrosoftRewardsBot } from '../index'
import { QueryEngine } from '../interface/Config'

export class QueryCore {
    constructor(private bot: MicrosoftRewardsBot) {}

    async queryManager(
        options: {
            shuffle?: boolean
            sourceOrder?: QueryEngine[]
            related?: boolean
            langCode?: string
            geoLocale?: string
        } = {}
    ): Promise<string[]> {
        const {
            shuffle = false,
            sourceOrder,
            related = true,
            langCode = 'zh',
            geoLocale = 'CN'
        } = options

        // 编程技术相关数据源（优先）
        const programmingSources: QueryEngine[] = [
            'hackernews',
            'github',
            'stackoverflow',
            'juejin',
            'v2ex',
            'segmentfault',
            'oschina',
            'infoq',
            'csdn',
            'cnblogs'
        ]

        // 国内热词榜数据源（备选）
        const chinaTrendSources: QueryEngine[] = ['china']

        // 如果用户指定了 sourceOrder，则使用用户的配置
        // 否则使用默认逻辑：优先编程源，不足时使用国内热词榜
        const useDefaultLogic = !sourceOrder

        try {
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `开始 | shuffle=${shuffle}, related=${related}, lang=${langCode}, geo=${geoLocale}, 使用默认逻辑=${useDefaultLogic}`
            )

            const topicLists: string[][] = []

            const sourceHandlers: Record<
                QueryEngine,
                (() => Promise<string[]>) | (() => string[])
            > = {
                google: async () => {
                    const topics = await this.getGoogleTrends(geoLocale.toUpperCase()).catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `谷歌: ${topics.length}`)
                    return topics
                },
                wikipedia: async () => {
                    const topics = await this.getWikipediaTrending(langCode).catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `维基百科: ${topics.length}`)
                    return topics
                },
                reddit: async () => {
                    const topics = await this.getRedditTopics().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `Reddit: ${topics.length}`)
                    return topics
                },
                local: () => {
                    const topics = this.getLocalQueryList()
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `本地: ${topics.length}`)
                    return topics
                },
                china: async () => {
                    const topics = await this.getChinaTrends(geoLocale.toUpperCase()).catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `中国热搜: ${topics.length}`)
                    return topics
                },
                hackernews: async () => {
                    const topics = await this.getHackerNewsTopics().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `Hacker News: ${topics.length}`)
                    return topics
                },
                github: async () => {
                    const topics = await this.getGitHubTrending().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `GitHub: ${topics.length}`)
                    return topics
                },
                stackoverflow: async () => {
                    const topics = await this.getStackOverflowTopics().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `Stack Overflow: ${topics.length}`)
                    return topics
                },
                juejin: async () => {
                    const topics = await this.getJuejinHot().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `掘金: ${topics.length}`)
                    return topics
                },
                v2ex: async () => {
                    const topics = await this.getV2EXTopics().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `V2EX: ${topics.length}`)
                    return topics
                },
                segmentfault: async () => {
                    const topics = await this.getSegmentFaultArticles().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `思否: ${topics.length}`)
                    return topics
                },
                oschina: async () => {
                    const topics = await this.getOSChinaNews().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `开源中国: ${topics.length}`)
                    return topics
                },
                infoq: async () => {
                    const topics = await this.getInfoQArticles().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `InfoQ: ${topics.length}`)
                    return topics
                },
                csdn: async () => {
                    const topics = await this.getCSDNHot().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `CSDN: ${topics.length}`)
                    return topics
                },
                cnblogs: async () => {
                    const topics = await this.getCnblogsHot().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `博客园: ${topics.length}`)
                    return topics
                },
                zhihu: async () => {
                    const topics = await this.getZhihuTechTopics().catch(() => [])
                    this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `知乎: ${topics.length}`)
                    return topics
                }
            }

            // 获取指定源的搜索词
            const fetchFromSources = async (sources: QueryEngine[]): Promise<string[][]> => {
                const results: string[][] = []
                for (const source of sources) {
                    const handler = sourceHandlers[source]
                    if (!handler) continue

                    const topics = await Promise.resolve(handler())
                    if (topics.length) results.push(topics)
                }
                return results
            }

            let finalSourceOrder: QueryEngine[] = []

            if (useDefaultLogic) {
                // 默认逻辑：优先编程源，不足时使用国内热词榜
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUERY-MANAGER',
                    '使用默认逻辑：优先编程技术源，不足时使用国内热词榜'
                )

                // 先尝试编程技术源
                const programmingTopics = await fetchFromSources(programmingSources)
                const programmingCount = programmingTopics.flat().length

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUERY-MANAGER',
                    `编程技术源获取 | 数量=${programmingCount}`
                )

                if (programmingCount > 0) {
                    topicLists.push(...programmingTopics)
                    finalSourceOrder = [...programmingSources]
                }

                // 如果编程源数量不足（少于50个），则补充国内热词榜
                const MIN_TOPICS_THRESHOLD = 50
                if (programmingCount < MIN_TOPICS_THRESHOLD) {
                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'QUERY-MANAGER',
                        `编程技术源数量不足 ${MIN_TOPICS_THRESHOLD}，补充国内热词榜`
                    )

                    const chinaTopics = await fetchFromSources(chinaTrendSources)
                    const chinaCount = chinaTopics.flat().length

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'QUERY-MANAGER',
                        `国内热词榜获取 | 数量=${chinaCount}`
                    )

                    if (chinaCount > 0) {
                        topicLists.push(...chinaTopics)
                        finalSourceOrder = [...finalSourceOrder, ...chinaTrendSources]
                    }
                }
            } else {
                // 使用用户指定的源顺序
                finalSourceOrder = sourceOrder
                for (const source of sourceOrder) {
                    const handler = sourceHandlers[source]
                    if (!handler) continue

                    const topics = await Promise.resolve(handler())
                    if (topics.length) topicLists.push(topics)
                }
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `源组合 | 原始总数=${topicLists.flat().length}`
            )

            const baseTopics = this.normalizeAndDedupe(topicLists.flat())

            if (!baseTopics.length) {
                this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', '未找到基础主题（所有源均为空）')
                return []
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `基础主题去重 | 之前=${topicLists.flat().length} | 之后=${baseTopics.length}`
            )
            this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `基础主题: ${baseTopics.length}`)

            const clusters = related ? await this.buildRelatedClusters(baseTopics, langCode) : baseTopics.map(t => [t])

            this.bot.utils.shuffleArray(clusters)
            this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', '聚类已打乱')

            let finalQueries = clusters.flat()
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `聚类已展平 | 总数=${finalQueries.length}`
            )

            // 不要聚类搜索并打乱
            if (shuffle) {
                this.bot.utils.shuffleArray(finalQueries)
                this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', '最终查询已打乱')
            }

            finalQueries = this.normalizeAndDedupe(finalQueries)
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `最终查询去重 | 之后=${finalQueries.length}`
            )

            if (!finalQueries.length) {
                this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', '最终查询去重后为0')
                return []
            }

            this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `最终查询: ${finalQueries.length}`)

            return finalQueries
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `错误: ${error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)}`
            )
            return []
        }
    }

    private async buildRelatedClusters(baseTopics: string[], langCode: string): Promise<string[][]> {
        const clusters: string[][] = []

        const LIMIT = 50
        const head = baseTopics.slice(0, LIMIT)
        const tail = baseTopics.slice(LIMIT)

        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-MANAGER',
            `启用相关搜索 | 基础主题=${baseTopics.length} | 扩展=${head.length} | 直接通过=${tail.length} | 语言=${langCode}`
        )
        this.bot.logger.debug(
            this.bot.isMobile,
            'QUERY-MANAGER',
            `启用必应扩展 | 限制=${LIMIT} | 总调用次数=${head.length * 2}`
        )

        for (const topic of head) {
            const suggestions = await this.getBingSuggestions(topic, langCode).catch(() => [])
            const relatedTerms = await this.getBingRelatedTerms(topic).catch(() => [])

            const usedSuggestions = suggestions.slice(0, 6)
            const usedRelated = relatedTerms.slice(0, 3)

            const cluster = this.normalizeAndDedupe([topic, ...usedSuggestions, ...usedRelated])

            this.bot.logger.debug(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `聚类已扩展 | 主题="${topic}" | 建议=${suggestions.length}->${usedSuggestions.length} | 相关=${relatedTerms.length}->${usedRelated.length} | 聚类大小=${cluster.length}`
            )

            clusters.push(cluster)
        }

        if (tail.length) {
            this.bot.logger.debug(this.bot.isMobile, 'QUERY-MANAGER', `聚类直通 | 主题=${tail.length}`)

            for (const topic of tail) {
                clusters.push([topic])
            }
        }

        return clusters
    }

    private normalizeAndDedupe(queries: string[]): string[] {
        const seen = new Set<string>()
        const out: string[] = []

        for (const q of queries) {
            if (!q) continue
            const trimmed = q.trim()
            if (!trimmed) continue

            const norm = trimmed.replace(/\s+/g, ' ').toLowerCase()
            if (seen.has(norm)) continue

            seen.add(norm)
            out.push(trimmed)
        }

        return out
    }

    async getGoogleTrends(geoLocale: string): Promise<string[]> {
        const queryTerms: GoogleSearch[] = []

        try {
            const request: AxiosRequestConfig = {
                url: 'https://trends.google.com/_/TrendsUi/data/batchexecute',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                data: `f.req=[[[i0OFE,"[null, null, \\"${geoLocale.toUpperCase()}\\", 0, null, 48]"]]]`
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const trendsData = this.extractJsonFromResponse(response.data)
            if (!trendsData) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', '未能从响应中解析趋势数据')
                return []
            }

            const mapped = trendsData.map(q => [q[0], q[9]!.slice(1)])

            if (mapped.length < 90 && geoLocale !== 'US') {
                return this.getGoogleTrends('US')
            }

            for (const [topic, related] of mapped) {
                queryTerms.push({
                    topic: topic as string,
                    related: related as string[]
                })
            }
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-GOOGLE-TRENDS',
                `请求失败: ${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }

        return queryTerms.flatMap(x => [x.topic, ...x.related])
    }

    private extractJsonFromResponse(text: string): GoogleTrendsResponse[1] | null {
        for (const line of text.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('[')) continue
            try {
                return JSON.parse(JSON.parse(trimmed)[0][2])[1]
            } catch {}
        }
        return null
    }

    async getBingSuggestions(query = '', langCode = 'zh'): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: `https://www.bingapis.com/api/v7/suggestions?q=${encodeURIComponent(
                    query
                )}&appid=6D0A9B8C5100E9ECC7E11A104ADD76C10219804B&cc=xl&setlang=${langCode}`,
                method: 'POST',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const suggestions =
                response.data.suggestionGroups?.[0]?.searchSuggestions?.map((x: { query: any }) => x.query) ?? []

            if (!suggestions.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-BING-SUGGESTIONS',
                    `空建议 | 查询="${query}" | 语言=${langCode}`
                )
            }

            return suggestions
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-BING-SUGGESTIONS',
                `请求失败 | 查询="${query}" | 语言=${langCode} | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    async getBingRelatedTerms(query: string): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const related = response.data?.[1]
            const out = Array.isArray(related) ? related : []

            if (!out.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-BING-RELATED',
                    `空相关术语 | 查询="${query}"`
                )
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-BING-RELATED',
                `请求失败 | 查询="${query}" | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    async getBingTrendingTopics(langCode = 'zh'): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: `https://www.bing.com/api/v7/news/trendingtopics?appid=91B36E34F9D1B900E54E85A77CF11FB3BE5279E6&cc=xl&setlang=${langCode}`,
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'User-Agent':
                        'Bing/32.5.431027001 (com.microsoft.bing; build:431027001; iOS 17.6.1) Alamofire/5.10.2',
                    'Content-Type': 'application/json',
                    'X-Rewards-Country': this.bot.userData.geoLocale,
                    'X-Rewards-Language': 'zh-CN',
                    'X-Rewards-ismobile': 'true'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const topics =
                response.data.value?.map(
                    (x: { query: { text: string }; name: string }) => x.query?.text?.trim() || x.name.trim()
                ) ?? []

            if (!topics.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-BING-TRENDING',
                    `空热门话题 | 语言=${langCode}`
                )
            }

            return topics
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-BING-TRENDING',
                `请求失败 | 语言=${langCode} | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    async getWikipediaTrending(langCode = 'zh'): Promise<string[]> {
        try {
            const date = new Date(Date.now() - 24 * 60 * 60 * 1000)
            const yyyy = date.getUTCFullYear()
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
            const dd = String(date.getUTCDate()).padStart(2, '0')

            const request: AxiosRequestConfig = {
                url: `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${langCode}.wikipedia/all-access/${yyyy}/${mm}/${dd}`,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const articles = (response.data as WikipediaTopResponse).items?.[0]?.articles ?? []

            const out = articles.slice(0, 50).map(a => a.article.replace(/_/g, ' '))

            if (!out.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-WIKIPEDIA-TRENDING',
                    `空维基百科热门 | 语言=${langCode}`
                )
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-WIKIPEDIA-TRENDING',
                `请求失败 | 语言=${langCode} | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    async getRedditTopics(subreddit = 'popular'): Promise<string[]> {
        try {
            const safe = subreddit.replace(/[^a-zA-Z0-9_+]/g, '')
            const request: AxiosRequestConfig = {
                url: `https://www.reddit.com/r/${safe}.json?limit=50`,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const posts = (response.data as RedditListing).data?.children ?? []

            const out = posts.filter(p => !p.data.over_18).map(p => p.data.title)

            if (!out.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-REDDIT-TRENDING',
                    `空Reddit列表 | 子版块=${safe}`
                )
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-REDDIT',
                `请求失败 | 子版块=${subreddit} | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    getLocalQueryList(): string[] {
        try {
            const file = path.join(__dirname, './search-queries.json')
            const queries = JSON.parse(fs.readFileSync(file, 'utf8')) as string[]
            const out = Array.isArray(queries) ? queries : []

            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-LOCAL-QUERY-LIST',
                '本地查询已加载 | 文件=search-queries.json'
            )

            if (!out.length) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-LOCAL-QUERY-LIST',
                    'search-queries.json 已解析但为空或无效'
                )
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-LOCAL-QUERY-LIST',
                `读取/解析失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取中国地区的热门搜索词（百度、抖音、微博等）
     * @param geoLocale - 地理区域代码，默认为'CN'
     * @returns Promise<GoogleSearch[]> - 包含主题和相关搜索词的数组
     */
    async getChinaTrends(geoLocale: string = 'CN'): Promise<string[]> {
        const queryTerms: GoogleSearch[] = []
        this.bot.logger.info(this.bot.isMobile, 'SEARCH-CHINA-TRENDS', `正在生成搜索查询，可能需要一些时间！ | 地理区域: ${geoLocale}`)
        var appkey = "";//从https://www.gmya.net/api 网站申请的热门词接口APIKEY
        var Hot_words_apis = "https://api.gmya.net/Api/";// 故梦热门词API接口网站
        //{weibohot}微博热搜榜//{douyinhot}抖音热搜榜/{zhihuhot}知乎热搜榜/{baiduhot}百度热搜榜/{toutiaohot}今日头条热搜榜/
        var keywords_source = ['BaiduHot', 'TouTiaoHot', 'DouYinHot', 'WeiBoHot'];
        var random_keywords_source = keywords_source[Math.floor(Math.random() * keywords_source.length)];
        var current_source_index = 0; // 当前搜索词来源的索引

        while (current_source_index < keywords_source.length) {
            // const source = keywords_source[current_source_index]; // 获取当前搜索词来源
            const source = random_keywords_source; // 获取当前搜索词来源
            let url;
            //根据 appkey 是否为空来决定如何构建 URL地址,如果appkey为空,则直接请求接口地址
            if (appkey) {
                url = Hot_words_apis + source + "?format=json&appkey=" + appkey;//有appkey则添加appkey参数
            } else {
                url = Hot_words_apis + source;//无appkey则直接请求接口地址
            }
            try {
                const response = await fetch(url); // 发起网络请求
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status); // 如果响应状态不是OK，则抛出错误
                }
                this.bot.logger.info(this.bot.isMobile, 'SEARCH-CHINA-TRENDS', `已获取${source}搜索查询`)

                const data = await response.json(); // 解析响应内容为JSON

                // 显式指定 item 的类型为 any，解决隐式 any 类型的问题
                if (data.data.some((item: any) => item)) {
                    // 如果数据中存在有效项
                    // 提取每个元素的title属性值
                    const names = data.data.map((item: any) => item.title);
                    // 显式指定 name 的类型为 string，解决隐式 any 类型的问题
                    names.forEach((name: string) => {
                        queryTerms.push({
                            topic: name,
                            related: []
                        });
                    });
                    // 返回搜索到的title属性值列表
                    return queryTerms.flatMap(x => [x.topic, ...x.related]);
                }
            } catch (error) {
                // 当前来源请求失败，记录错误并尝试下一个来源
                this.bot.logger.error(this.bot.isMobile, 'SEARCH-CHINA-TRENDS', `搜索词来源请求失败: ${error}`);
            }
            // 尝试下一个搜索词来源
            current_source_index++;
        }

        return queryTerms.flatMap(x => [x.topic, ...x.related]);

    }

    // ==================== 国际编程技术 API ====================

    /**
     * 获取 Hacker News 热门话题
     * @returns Promise<string[]> - 热门话题标题数组
     */
    async getHackerNewsTopics(): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://hacker-news.firebaseio.com/v0/topstories.json',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const storyIds = (response.data as number[]).slice(0, 30)

            const stories = await Promise.all(
                storyIds.map(async (id) => {
                    try {
                        const storyRequest: AxiosRequestConfig = {
                            url: `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
                            method: 'GET'
                        }
                        const storyRes = await this.bot.axios.request(storyRequest, this.bot.config.proxy.queryEngine)
                        const item = storyRes.data as HackerNewsItem
                        return item.title
                    } catch {
                        return ''
                    }
                })
            )

            const out = stories.filter(Boolean)

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-HACKERNEWS', '空 Hacker News 列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-HACKERNEWS',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取 GitHub Trending 热门项目
     * @param language - 编程语言筛选，默认为空（全部）
     * @returns Promise<string[]> - 热门项目名称和描述数组
     */
    async getGitHubTrending(language: string = ''): Promise<string[]> {
        try {
            const langParam = language ? `?language=${language}` : ''
            const request: AxiosRequestConfig = {
                url: `https://api.gitterapp.com/v2/repositories${langParam}`,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    'Accept': 'application/json'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const repos = (response.data as GitHubTrendingRepo[]).slice(0, 30)

            const out = repos.map(repo => {
                const parts = [repo.name]
                if (repo.description) parts.push(repo.description)
                if (repo.language) parts.push(repo.language)
                return parts.join(' ')
            })

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-GITHUB-TRENDING', '空 GitHub Trending 列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-GITHUB-TRENDING',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取 Stack Overflow 热门问题
     * @param tagged - 标签筛选，默认为空
     * @returns Promise<string[]> - 热门问题标题数组
     */
    async getStackOverflowTopics(tagged: string = ''): Promise<string[]> {
        try {
            const taggedParam = tagged ? `&tagged=${encodeURIComponent(tagged)}` : ''
            const request: AxiosRequestConfig = {
                url: `https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=30${taggedParam}`,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const soResponse = response.data as StackOverflowResponse
            const questions = soResponse.items ?? []

            const out = questions.map(q => {
                const tags = q.tags?.slice(0, 3).join(' ') ?? ''
                return tags ? `${q.title} ${tags}` : q.title
            })

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-STACKOVERFLOW', '空 Stack Overflow 列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-STACKOVERFLOW',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    // ==================== 国内编程技术 API ====================

    /**
     * 获取掘金热门文章
     * @param category - 分类，默认为 'all'
     * @returns Promise<string[]> - 热门文章标题数组
     */
    async getJuejinHot(category: string = 'all'): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://api.juejin.cn/recommend_api/v1/article/recommend_cate_feed',
                method: 'POST',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    'Content-Type': 'application/json'
                },
                data: {
                    id_type: 2,
                    sort_type: 200,
                    cate_id: '6809637773935378440',
                    cursor: '0',
                    limit: 30
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const articles = response.data?.data ?? []

            const out = articles.map((item: any) => {
                const title = item.article_info?.title ?? ''
                const tags = item.tags?.slice(0, 2).map((t: any) => t.tag_name).join(' ') ?? ''
                return tags ? `${title} ${tags}` : title
            }).filter(Boolean)

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-JUEJIN', '空掘金列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-JUEJIN',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取 V2EX 热门话题
     * @returns Promise<string[]> - 热门话题标题数组
     */
    async getV2EXTopics(): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://www.v2ex.com/api/topics/hot.json',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const topics = response.data ?? []

            const out = topics.map((item: any) => {
                const title = item.title ?? ''
                const node = item.node?.name ?? ''
                return node ? `${title} ${node}` : title
            }).filter(Boolean)

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-V2EX', '空 V2EX 列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-V2EX',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取思否 SegmentFault 热门文章
     * @returns Promise<string[]> - 热门文章标题数组
     */
    async getSegmentFaultArticles(): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://segmentfault.com/api/user/articles?limit=30&offset=0&order=hot',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const articles = response.data?.data?.rows ?? []

            const out = articles.map((item: any) => {
                const title = item.title ?? ''
                const tags = item.tags?.slice(0, 2).map((t: any) => t.name).join(' ') ?? ''
                return tags ? `${title} ${tags}` : title
            }).filter(Boolean)

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-SEGMENTFAULT', '空思否列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-SEGMENTFAULT',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取开源中国 OSChina 热门资讯
     * @returns Promise<string[]> - 热门资讯标题数组
     */
    async getOSChinaNews(): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://www.oschina.net/news/ajax_news_list?show=hot&p=1',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            
            // 解析 HTML 响应
            const html = response.data
            const titleRegex = /<a[^>]*class="title"[^>]*>([^<]+)<\/a>/g
            const titles: string[] = []
            let match

            while ((match = titleRegex.exec(html)) !== null) {
                if (match[1]) {
                    titles.push(match[1].trim())
                }
            }

            const out = titles.slice(0, 30)

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-OSCHINA', '空开源中国列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-OSCHINA',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取 InfoQ 热门文章
     * @returns Promise<string[]> - 热门文章标题数组
     */
    async getInfoQArticles(): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://www.infoq.cn/public/v1/article/getList',
                method: 'POST',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    'Content-Type': 'application/json'
                },
                data: {
                    size: 30,
                    type: 1,
                    sort: 'hot'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const articles = response.data?.data ?? []

            const out = articles.map((item: any) => {
                const title = item.title ?? ''
                const tags = item.topicNames?.slice(0, 2).join(' ') ?? ''
                return tags ? `${title} ${tags}` : title
            }).filter(Boolean)

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-INFOQ', '空 InfoQ 列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-INFOQ',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取 CSDN 热门文章
     * @returns Promise<string[]> - 热门文章标题数组
     */
    async getCSDNHot(): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://blog.csdn.net/api/user/hotwords',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const data = response.data?.data ?? []

            const out = data.map((item: any) => {
                const title = item.title ?? item.keyword ?? ''
                return title
            }).filter(Boolean).slice(0, 30)

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-CSDN', '空 CSDN 列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-CSDN',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取博客园热门文章
     * @returns Promise<string[]> - 热门文章标题数组
     */
    async getCnblogsHot(): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://www.cnblogs.com/aggsite/headline',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            
            // 解析 HTML 响应
            const html = response.data
            const titleRegex = /<a[^>]*class="post-item-title"[^>]*>([^<]+)<\/a>/g
            const titles: string[] = []
            let match

            while ((match = titleRegex.exec(html)) !== null) {
                if (match[1]) {
                    titles.push(match[1].trim())
                }
            }

            const out = titles.slice(0, 30)

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-CNBOOKS', '空博客园列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-CNBOOKS',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }

    /**
     * 获取知乎技术话题热门问题
     * @returns Promise<string[]> - 热门问题标题数组
     */
    async getZhihuTechTopics(): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://www.zhihu.com/api/v4/topics/19554298/feeds/essence?limit=30&offset=0',
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {})
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const data = response.data?.data ?? []

            const out = data.map((item: any) => {
                const title = item.target?.title ?? ''
                const excerpt = item.target?.excerpt?.slice(0, 50) ?? ''
                return excerpt ? `${title} ${excerpt}` : title
            }).filter(Boolean)

            if (!out.length) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ZHIHU', '空知乎列表')
            }

            return out
        } catch (error) {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-ZHIHU',
                `请求失败 | 错误=${
                    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
                }`
            )
            return []
        }
    }
}
