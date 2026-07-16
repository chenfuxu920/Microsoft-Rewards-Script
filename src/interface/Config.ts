export interface Config {
    baseURL: string
    sessionPath: string
    headless: boolean
    clusters: number
    errorDiagnostics: boolean
    workers: ConfigWorkers
    claimPoints: ConfigClaimPoints
    searchOnBingLocalQueries: boolean
    globalTimeout: number | string
    searchSettings: ConfigSearchSettings
    continuousSearch: ConfigContinuousSearch
    debugLogs: boolean
    proxy: ConfigProxy
    consoleLogFilter: LogFilter
    webhook: ConfigWebhook
}

export type QueryEngine =
    | 'china'
    | 'google'
    | 'wikipedia'
    | 'reddit'
    | 'local'
    | 'hackernews'
    | 'github'
    | 'stackoverflow'
    | 'juejin'
    | 'v2ex'
    | 'segmentfault'
    | 'oschina'
    | 'infoq'
    | 'csdn'
    | 'cnblogs'
    | 'zhihu'

export interface ConfigSearchSettings {
    scrollRandomResults: boolean
    clickRandomResults: boolean
    parallelSearching: boolean
    queryEngines: QueryEngine[]
    searchResultVisitTime: number | string
    searchDelay: ConfigDelay
    readDelay: ConfigDelay
}

export interface ConfigDelay {
    min: number | string
    max: number | string
}

export interface ConfigProxy {
    queryEngine: boolean
}

export interface ConfigWorkers {
    doDailySet: boolean
    doSpecialPromotions: boolean
    doMorePromotions: boolean
    doPunchCards: boolean
    doAppPromotions: boolean
    doDesktopSearch: boolean
    doMobileSearch: boolean
    doDailyCheckIn: boolean
    doReadToEarn: boolean
    doContinuousSearch: boolean
    doClaimDashboardPoints: boolean
}

export interface ConfigClaimPoints {
    /** Next.js Server Action hash —— 从 HAR 抓包中提取，随网页部署版本变化 */
    nextActionHash: string
    /** 部署版本 ID —— 从页面 response header 或 script 标签的 dpl 参数提取，留空则自动检测 */
    deploymentId: string
}

export interface ConfigContinuousSearch {
    enabled: boolean
    depthMin: number
    depthMax: number
    queryIntervalMin: number
    queryIntervalMax: number
    durationMin: number
    durationMax: number
    useMobile: boolean
    useDesktop: boolean
}

// Webhooks
export interface ConfigWebhook {
    discord?: WebhookDiscordConfig
    ntfy?: WebhookNtfyConfig
    webhookLogFilter: LogFilter
}

export interface LogFilter {
    enabled: boolean
    mode: 'whitelist' | 'blacklist'
    levels?: Array<'debug' | 'info' | 'warn' | 'error'>
    keywords?: string[]
    regexPatterns?: string[]
}

export interface WebhookDiscordConfig {
    enabled: boolean
    url: string
}

export interface WebhookNtfyConfig {
    enabled?: boolean
    url: string
    topic?: string
    token?: string
    title?: string
    tags?: string[]
    priority?: 1 | 2 | 3 | 4 | 5 // 5 highest (important)
}
