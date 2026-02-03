import { describe, expect, it, vi } from 'vitest'

describe('log', () => {
    it('logs when DEBUG is true', async () => {
        vi.resetModules()
        vi.unmock('../src/constants')
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const { log } = await import('../src/util')

        log('hello', 123)
        expect(spy).toHaveBeenCalledTimes(1)
        spy.mockRestore()
    })

    it('does nothing when DEBUG is false', async () => {
        vi.resetModules()
        vi.doMock('../src/constants', () => ({ DEBUG: false }))
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const { log } = await import('../src/util')

        log('nope')
        expect(spy).not.toHaveBeenCalled()
        spy.mockRestore()
        vi.unmock('../src/constants')
    })
})
