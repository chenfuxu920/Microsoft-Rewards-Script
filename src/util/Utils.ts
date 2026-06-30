import ms, { StringValue } from 'ms'

/**
 * 安全解析 JSON 字符串，容忍 JSON 尾部的非空白垃圾内容。
 * 当 JSON.parse 因 "Unexpected non-whitespace character after JSON" 失败时，
 * 使用 raw_decode 策略提取有效的 JSON 前缀部分重新解析。
 * @param text 待解析的字符串
 * @returns 解析后的 JavaScript 值
 */
export function safeJsonParse(text: string): any {
    try {
        return JSON.parse(text)
    } catch (e) {
        if (e instanceof SyntaxError && /after JSON/i.test(e.message)) {
            const result = extractJsonPrefix(text)
            if (result !== undefined) {
                return result
            }
        }
        throw e
    }
}

/**
 * 从字符串中提取第一个完整的 JSON 值（对象、数组、字符串、数字、布尔、null）。
 * 使用手动扫描确保字符串字面量内的特殊字符不影响边界判断。
 */
function extractJsonPrefix(text: string): any {
    const trimmed = text.trimStart()
    if (trimmed.length === 0) return undefined

    let i = 0
    const len = trimmed.length

    // 跳过前导空白
    while (i < len && /\s/.test(trimmed[i]!)) i++
    if (i >= len) return undefined

    const start = i
    const ch = trimmed[i]

    if (
        ch !== '{' &&
        ch !== '[' &&
        ch !== '"' &&
        ch !== '-' &&
        !/\d/.test(ch ?? '') &&
        ch !== 't' &&
        ch !== 'f' &&
        ch !== 'n'
    ) {
        return undefined
    }

    // 简易状态机扫描完整 JSON 值
    let depth = 0
    let inString = false
    let escape = false

    for (; i < len; i++) {
        const c = trimmed[i]
        if (c === undefined) break

        if (inString) {
            if (escape) {
                escape = false
            } else if (c === '\\') {
                escape = true
            } else if (c === '"') {
                inString = false
            }
            continue
        }

        if (c === '"') {
            inString = true
            continue
        }

        if (c === '{' || c === '[') {
            depth++
            continue
        }

        if (c === '}' || c === ']') {
            depth--
            if (depth === 0) {
                i++
                break
            }
            continue
        }

        // 对于原始值（数字、true、false、null），depth 始终为 0
        if (depth === 0 && ch !== '{' && ch !== '[') {
            // 扫描到非原始值字符为止
            if (c === ',' || c === '}' || c === ']' || /\s/.test(c)) {
                break
            }
        }
    }

    const jsonStr = trimmed.slice(start, i).trim()
    if (jsonStr.length === 0) return undefined

    try {
        return JSON.parse(jsonStr)
    } catch {
        return undefined
    }
}

export default class Util {
    async wait(time: number | string): Promise<void> {
        if (typeof time === 'string') {
            time = this.stringToNumber(time)
        }

        return new Promise<void>(resolve => {
            setTimeout(resolve, time)
        })
    }

    async waitRandom(min_ms: number, max_ms: number, distribution: 'uniform' | 'normal' = 'uniform'): Promise<void> {
        return new Promise<void>(resolve => {
            setTimeout(resolve, this.randomNumber(min_ms, max_ms, distribution))
        })
    }

    getFormattedDate(ms = Date.now()): string {
        const today = new Date(ms)
        const month = String(today.getMonth() + 1).padStart(2, '0') //  一月是0
        const day = String(today.getDate()).padStart(2, '0')
        const year = today.getFullYear()

        return `${month}/${day}/${year}`
    }

    shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))

            const a = array[i]
            const b = array[j]

            if (a === undefined || b === undefined) continue

            array[i] = b
            array[j] = a
        }

        return array
    }

    randomNumber(min: number, max: number, distribution: 'uniform' | 'normal' = 'uniform'): number {
        if (distribution === 'uniform') {
            return Math.floor(Math.random() * (max - min + 1)) + min
        }
        // 正态分布实现 (Box-Muller变换)
        let u = 0,
            v = 0
        while (u === 0) u = Math.random()
        while (v === 0) v = Math.random()
        let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
        num = num / 10.0 + 0.5 // 标准化到0-1范围
        if (num > 1 || num < 0) num = this.randomNumber(min, max, distribution) // 边界处理
        return Math.floor(num * (max - min + 1)) + min
    }

    chunkArray<T>(arr: T[], numChunks: number): T[][] {
        const chunkSize = Math.ceil(arr.length / numChunks)
        const chunks: T[][] = []

        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize)
            chunks.push(chunk)
        }

        return chunks
    }

    stringToNumber(input: string | number): number {
        if (typeof input === 'number') {
            return input
        }
        const value = input.trim()

        const milisec = ms(value as StringValue)

        if (milisec === undefined) {
            throw new Error(
                `提供的输入 (${input}) 无法解析为有效的时间！请使用类似 "1 min"、"1m" 或 "1 minutes" 的格式`
            )
        }

        return milisec
    }

    normalizeString(string: string): string {
        return string
            .normalize('NFD')
            .trim()
            .toLowerCase()
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/[?!]/g, '')
    }

    getEmailUsername(email: string): string {
        return email.split('@')[0] ?? 'Unknown'
    }

    randomDelay(min: string | number, max: string | number): number {
        const minMs = typeof min === 'number' ? min : this.stringToNumber(min)
        const maxMs = typeof max === 'number' ? max : this.stringToNumber(max)
        return Math.floor(this.randomNumber(minMs, maxMs))
    }
}
