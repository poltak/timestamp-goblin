import { beforeEach, describe, expect, it, vi } from 'vitest'

const pruneExpiredVideos = vi.fn(async () => 2)
vi.mock('../src/storage', () => ({ pruneExpiredVideos }))
vi.mock('../src/util', () => ({ log: vi.fn() }))

describe('background worker', () => {
    const onStartup = vi.fn()
    const onInstalled = vi.fn()

    beforeEach(() => {
        vi.resetModules()
        pruneExpiredVideos.mockClear()
        onStartup.mockClear()
        onInstalled.mockClear()
        Object.assign(chrome, {
            runtime: {
                onStartup: { addListener: onStartup },
                onInstalled: { addListener: onInstalled },
            },
        })
    })

    it('deletes expired videos when the browser starts or the extension installs', async () => {
        const { prune } = await import('../src/background')
        expect(onStartup).toHaveBeenCalledWith(prune)
        expect(onInstalled).toHaveBeenCalledWith(prune)
        prune()
        expect(pruneExpiredVideos).toHaveBeenCalledTimes(1)
    })

    it('does not fail when the deletion fails', async () => {
        const { prune } = await import('../src/background')
        pruneExpiredVideos.mockRejectedValueOnce(new Error('unavailable'))
        prune()
        await Promise.resolve()
        expect(pruneExpiredVideos).toHaveBeenCalledTimes(1)
    })
})
