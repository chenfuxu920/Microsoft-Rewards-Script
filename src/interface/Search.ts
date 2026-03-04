// Google Trends
export type GoogleTrendsResponse = [string, [string, ...null[], [string, ...string[]]][]]

export interface GoogleSearch {
    topic: string
    related: string[]
}

// Bing Suggestions
export interface BingSuggestionResponse {
    _type: string
    instrumentation: BingInstrumentation
    queryContext: BingQueryContext
    suggestionGroups: BingSuggestionGroup[]
}

export interface BingInstrumentation {
    _type: string
    pingUrlBase: string
    pageLoadPingUrl: string
    llmPingUrlBase: string
    llmLogPingUrlBase: string
}

export interface BingQueryContext {
    originalQuery: string
}

export interface BingSuggestionGroup {
    name: string
    searchSuggestions: BingSearchSuggestion[]
}

export interface BingSearchSuggestion {
    url: string
    urlPingSuffix: string
    displayText: string
    query: string
    result?: BingResult[]
    searchKind?: string
}

export interface BingResult {
    id: string
    readLink: string
    readLinkPingSuffix: string
    webSearchUrl: string
    webSearchUrlPingSuffix: string
    name: string
    image: BingSuggestionImage
    description: string
    entityPresentationInfo: BingEntityPresentationInfo
    bingId: string
}

export interface BingEntityPresentationInfo {
    entityScenario: string
    entityTypeDisplayHint: string
    query: string
}

export interface BingSuggestionImage {
    thumbnailUrl: string
    hostPageUrl: string
    hostPageUrlPingSuffix: string
    width: number
    height: number
    sourceWidth: number
    sourceHeight: number
}

// Bing Tending Topics
export interface BingTrendingTopicsResponse {
    _type: string
    instrumentation: BingInstrumentation
    value: BingValue[]
}

export interface BingValue {
    webSearchUrl: string
    webSearchUrlPingSuffix: string
    name: string
    image: BingTrendingImage
    isBreakingNews: boolean
    query: BingTrendingQuery
    newsSearchUrl: string
    newsSearchUrlPingSuffix: string
}

export interface BingTrendingImage {
    url: string
}

export interface BingTrendingQuery {
    text: string
}

export interface WikipediaTopResponse {
    items: Array<{
        articles: Array<{
            article: string
            views: number
        }>
    }>
}

export interface RedditListing {
    data: {
        children: Array<{
            data: {
                title: string
                over_18: boolean
            }
        }>
    }
}

// Hacker News
export interface HackerNewsItem {
    id: number
    title: string
    by: string
    score: number
    url?: string
    text?: string
}

// GitHub Trending (第三方API)
export interface GitHubTrendingRepo {
    name: string
    full_name: string
    html_url: string
    description: string
    language: string
    stargazers_count: number
}

// Stack Overflow
export interface StackOverflowResponse {
    items: Array<{
        title: string
        link: string
        score: number
        tags: string[]
    }>
}

// 掘金热门
export interface JuejinHotItem {
    article_id: string
    title: string
    brief_content: string
    category: {
        category_name: string
    }
    tags: Array<{
        tag_name: string
    }>
}

// V2EX
export interface V2EXTopic {
    id: number
    title: string
    node: {
        name: string
        title: string
    }
}

// 思否 SegmentFault
export interface SegmentFaultArticle {
    id: number
    title: string
    summary: string
    tags: Array<{
        name: string
    }>
}

// 开源中国 OSChina
export interface OSChinaNews {
    id: number
    title: string
    summary: string
}

// InfoQ
export interface InfoQArticle {
    title: string
    summary: string
    tags: Array<{
        name: string
    }>
}

// 36氪技术
export interface Kr36TechItem {
    id: number
    title: string
    summary: string
}

// CSDN 热门
export interface CSDNHotItem {
    title: string
    url: string
    tags: string[]
}

// 博客园 热门
export interface CnblogsHotItem {
    title: string
    summary: string
    tags: string[]
}

// 知乎技术话题
export interface ZhihuTechTopic {
    id: number
    title: string
    excerpt: string
}
