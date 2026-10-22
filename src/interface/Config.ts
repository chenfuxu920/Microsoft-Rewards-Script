export interface Config {
    baseURL: string
    sessionPath: string
    headless: boolean
    clusters: number
    errorDiagnostics: boolean
    workers: ConfigWorkers
    searchOnBingLocalQueries: boolean
    globalTimeout: number | string
    searchSettings: ConfigSearchSettings
    continuousSearch: ConfigContinuousSearch
    debugLogs: boolean
    proxy: ConfigProxy
    consoleLogFilter: LogFilter
    webhook: ConfigWebhook
    /** 账号未显式声明 intensity 时使用的档位，缺省 normal */
    defaultIntensity?: string
    /** 强度档位定义（键名即账号 intensity 的取值） */
    intensityProfiles?: Record<string, IntensityProfile>
}

/**
 * 强度档位：按账号覆盖搜索量、搜索间隔与活动开关，用于给被风控账号降强度。
 * 所有字段均可选，未声明的字段沿用全局 config。
 */
export interface IntensityProfile {
    /** 每轮搜索最多获取的积分（0 或省略 = 不限，搜满为止） */
    searchCap?: IntensitySearchCap
    /** 搜索之间的等待区间，覆盖 searchSettings.searchDelay */
    searchDelay?: ConfigDelay
    /** 阅读类活动等待区间，覆盖 searchSettings.readDelay */
    readDelay?: ConfigDelay
    /** 与下一个账号之间的间隔，覆盖默认的 14min~32min */
    accountGap?: ConfigDelay
    /** true = 该档位账号每天最多执行一次（用于 07:00 与 20:00 两轮 cron 的降频） */
    oncePerDay?: boolean
    /** 覆盖 workers 开关（只写需要覆盖的键） */
    workers?: Partial<ConfigWorkers>
}

export interface IntensitySearchCap {
    mobile: number
    desktop: number
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
