import { describe, expect, it, vi } from 'vitest'
import { debounce } from '../src/debounce'

describe('debounce', () => {
    it('delays calls and uses last arguments', () => {
        vi.useFakeTimers()
        const fn = vi.fn()
        const debounced = debounce(fn, 100)

        debounced('a')
        debounced('b')
        expect(fn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(99)
        expect(fn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith('b')
    })
})
