import axios, { AxiosRequestConfig } from 'axios'
import PQueue from 'p-queue'
import type { LogLevel } from './Logger'

const DISCORD_LIMIT = 2000

export interface DiscordConfig {
    enabled?: boolean
    url: string
}

let discordQueue: PQueue | null = null

function getDiscordQueue(): PQueue {
    if (!discordQueue) {
        discordQueue = new PQueue({
            interval: 1000,
            intervalCap: 2,
            carryoverConcurrencyCount: false
        })
    }
    return discordQueue
}

export function resetDiscordQueue(): void {
    if (discordQueue) {
        discordQueue.clear()
        discordQueue = null
    }
}

function truncate(text: string) {
    return text.length <= DISCORD_LIMIT ? text : text.slice(0, DISCORD_LIMIT - 14) + ' …(已截断)'
}

export async function sendDiscord(discordUrl: string, content: string, level: LogLevel): Promise<void> {
    if (!discordUrl) return

    const request: AxiosRequestConfig = {
        method: 'POST',
        url: discordUrl,
        headers: { 'Content-Type': 'application/json' },
        data: { content: truncate(content), allowed_mentions: { parse: [] } },
        timeout: 10000
    }

    const queue = getDiscordQueue()
    await queue.add(async () => {
        try {
            await axios(request)
        } catch (err: any) {
            const status = err?.response?.status
            if (status === 429) return
        }
    })
}

export async function flushDiscordQueue(timeoutMs = 5000): Promise<void> {
    const queue = getDiscordQueue()
    await Promise.race([
        (async () => {
            await queue.onIdle()
        })(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('discord flush timeout')), timeoutMs))
    ]).catch(() => {})
}
