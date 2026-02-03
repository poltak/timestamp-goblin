import { vi } from 'vitest'

const storage = {
    get: vi.fn(async () => ({})),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
}

Object.defineProperty(globalThis, 'chrome', {
    value: {
        storage: {
            local: storage,
        },
    },
    writable: true,
})
