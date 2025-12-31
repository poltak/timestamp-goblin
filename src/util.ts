import { DEBUG } from './constants'

export function log(...args: unknown[]): void {
    if (DEBUG) {
        console.log('[TimestampGoblin]', ...args)
    }
}
