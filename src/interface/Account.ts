export interface Account {
    email: string
    password: string
    totpSecret?: string
    recoveryEmail: string
    geoLocale: 'auto' | string
    langCode: 'en' | string
    proxy: AccountProxy
    saveFingerprint: ConfigSaveFingerprint
    /**
     * 强度档位名，对应 config.intensityProfiles 的键；缺省时使用 config.defaultIntensity。
     * 'normal' = 全速；'low' = 降强度（搜索限量 + 间隔拉长 + 关闭高特征活动 + 每日只跑一轮）。
     * accounts.json 里单账号写 "intensity": "low" 即可降档，删掉或写 "normal" 即恢复。
     */
    intensity?: string
}

export interface AccountProxy {
    proxyAxios: boolean
    url: string
    port: number
    password: string
    username: string
}

export interface ConfigSaveFingerprint {
    mobile: boolean
    desktop: boolean
}
