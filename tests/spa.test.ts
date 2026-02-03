import { describe, expect, it, vi } from 'vitest'

describe('spa', () => {
    it('dispatches on pushState and popstate', async () => {
        vi.useFakeTimers()
        vi.resetModules()
        const { watchUrlChanges } = await import('../src/spa')
        const handler = vi.fn()
        const unwatch = watchUrlChanges(handler, { debounceMs: 50 })

        history.pushState({}, '', '/watch?v=1')
        expect(handler).not.toHaveBeenCalled()
        vi.advanceTimersByTime(50)
        expect(handler).toHaveBeenCalledTimes(1)

        window.dispatchEvent(new PopStateEvent('popstate'))
        vi.advanceTimersByTime(50)
        expect(handler).toHaveBeenCalledTimes(2)

        unwatch()
    })

    it('patches history only once', async () => {
        vi.useFakeTimers()
        vi.resetModules()
        const { watchUrlChanges } = await import('../src/spa')
        const handler1 = vi.fn()
        const handler2 = vi.fn()
        watchUrlChanges(handler1, { debounceMs: 0 })
        watchUrlChanges(handler2, { debounceMs: 0 })

        history.pushState({}, '', '/watch?v=2')
        vi.runAllTimers()
        expect(handler1).toHaveBeenCalledTimes(1)
        expect(handler2).toHaveBeenCalledTimes(0)
    })
})
