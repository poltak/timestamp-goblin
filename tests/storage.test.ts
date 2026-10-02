import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    deleteVideoState,
    getAllVideoStates,
    getVideoState,
    setVideoState,
} from '../src/storage'
import type { StoredVideoState } from '../src/types'

type Store = Record<string, unknown>

describe('storage', () => {
    let store: Store

    beforeEach(() => {
        store = {}
        const local = {
            get: vi.fn(async (key?: string | string[]) => {
                if (!key) return { ...store }
                if (Array.isArray(key))
                    return Object.fromEntries(
                        key.map((name) => [name, store[name]]),
                    )
                return { [key]: store[key] }
            }),
            set: vi.fn(async (value: Store) => {
                store = { ...store, ...value }
            }),
            remove: vi.fn(async (key: string) => {
                delete store[key]
            }),
        }
        Object.assign(globalThis.chrome.storage, { local })
    })

    it('sets and gets video state', async () => {
        const state: StoredVideoState = {
            t: 10,
            ft: 12,
            updatedAt: 123,
            duration: 100,
            title: 'Title',
            channel: 'Channel',
        }
        await setVideoState('abc', state)
        const result = await getVideoState('abc')
        expect(result).toEqual(state)
    })

    it('returns null for missing or invalid state', async () => {
        expect(await getVideoState('missing')).toBeNull()
        await chrome.storage.local.set({ 'ytp:bad': { t: 'nope' } })
        expect(await getVideoState('bad')).toBeNull()
    })

    it('lists all valid states', async () => {
        await setVideoState('one', {
            t: 10,
            ft: 20,
            updatedAt: 1,
            duration: 100,
            title: 'One',
            channel: 'Chan',
        })
        await setVideoState('two', {
            t: 5,
            ft: 5,
            updatedAt: 2,
            duration: 50,
            title: 'Two',
            channel: 'Chan2',
        })
        const all = await getAllVideoStates()
        expect(all).toHaveLength(2)
        expect(all.map((item) => item.videoId).sort()).toEqual(['one', 'two'])
    })

    it('filters out invalid and non-video keys', async () => {
        const local = globalThis.chrome.storage.local
        await local.set({
            random: { t: 10, updatedAt: 1 },
            'ytp:bad': { updatedAt: 1 },
            'ytp:ok': {
                t: 5,
                ft: 5,
                updatedAt: 2,
                duration: 50,
                title: 'Ok',
                channel: 'Chan',
            },
        })
        const all = await getAllVideoStates()
        expect(all).toHaveLength(1)
        expect(all[0].videoId).toBe('ok')
    })

    it.each([
        null,
        [],
        { t: -1, updatedAt: 1 },
        { t: NaN, updatedAt: 1 },
        { t: Infinity, updatedAt: 1 },
        { t: 10 },
        { t: 10, updatedAt: -1 },
        { t: 10, updatedAt: Infinity },
    ])('rejects invalid state %j on both read paths', async (value) => {
        await chrome.storage.local.set({ 'ytp:bad': value })
        expect(await getVideoState('bad')).toBeNull()
        expect(await getAllVideoStates()).toEqual([])
    })

    it('normalizes legacy fields without changing stored data', async () => {
        const legacy = { t: 20, updatedAt: 1, ft: -5, title: 42, channel: {} }
        await chrome.storage.local.set({ 'ytp:legacy': legacy, 'ytp:': legacy })
        const expected = {
            t: 20,
            ft: 20,
            updatedAt: 1,
            duration: Infinity,
            title: 'Untitled video',
            channel: 'Unknown channel',
        }
        expect(await getVideoState('legacy')).toEqual(expected)
        expect(await getAllVideoStates()).toEqual([
            { ...expected, videoId: 'legacy' },
        ])
        expect(
            (await chrome.storage.local.get('ytp:legacy'))['ytp:legacy'],
        ).toEqual(legacy)
    })

    it('normalizes ignored channels from storage', async () => {
        const { getIgnoredChannels } = await import('../src/storage')
        await chrome.storage.local.set({
            'ignored:channels': [' My Channel ', 'my channel', '', 42],
        })
        expect(await getIgnoredChannels()).toEqual(['my channel'])
    })

    it('manages ignored channel list', async () => {
        const { addIgnoredChannel, getIgnoredChannels, removeIgnoredChannel } =
            await import('../src/storage')
        expect(await getIgnoredChannels()).toEqual([])

        await addIgnoredChannel('  My Channel ')
        expect(await getIgnoredChannels()).toEqual(['my channel'])

        await addIgnoredChannel('My Channel')
        expect(await getIgnoredChannels()).toEqual(['my channel'])

        await removeIgnoredChannel('MY CHANNEL')
        expect(await getIgnoredChannels()).toEqual([])
    })

    it('defaults enabled to true and can toggle', async () => {
        const { getEnabled, setEnabled } = await import('../src/storage')
        expect(await getEnabled()).toBe(true)
        await setEnabled(false)
        expect(await getEnabled()).toBe(false)
    })

    it('loads tracking settings in one storage call', async () => {
        const { getTrackingSettings } = await import('../src/storage')
        await chrome.storage.local.set({
            enabled: false,
            'ignored:channels': [' Channel '],
        })
        expect(await getTrackingSettings()).toEqual({
            enabled: false,
            ignoredChannels: ['channel'],
        })
        expect(chrome.storage.local.get).toHaveBeenCalledTimes(1)
        expect(chrome.storage.local.get).toHaveBeenCalledWith([
            'enabled',
            'ignored:channels',
        ])
    })

    it('reports tracking settings now and after each settings change', async () => {
        const { watchTrackingSettings } = await import('../src/storage')
        type Listener = (changes: Record<string, unknown>) => void
        const listeners = new Set<Listener>()
        Object.assign(chrome.storage.local, {
            onChanged: {
                addListener: (listener: Listener) => listeners.add(listener),
                removeListener: (listener: Listener) =>
                    listeners.delete(listener),
            },
        })
        const change = async (values: Store) => {
            await chrome.storage.local.set(values)
            listeners.forEach((listener) => listener(values))
            await Promise.resolve()
            await Promise.resolve()
        }
        const onSettings = vi.fn()
        const stop = watchTrackingSettings(onSettings)
        await Promise.resolve()
        await Promise.resolve()
        expect(onSettings).toHaveBeenLastCalledWith({
            enabled: true,
            ignoredChannels: [],
        })

        await change({ enabled: false, 'ignored:channels': [' Channel '] })
        expect(onSettings).toHaveBeenLastCalledWith({
            enabled: false,
            ignoredChannels: ['channel'],
        })

        // A progress save is not a settings change and must not cause a read.
        vi.mocked(chrome.storage.local.get).mockClear()
        await change({ 'ytp:abc': { t: 1, updatedAt: 1 } })
        expect(chrome.storage.local.get).not.toHaveBeenCalled()
        expect(onSettings).toHaveBeenCalledTimes(2)

        stop()
        expect(listeners.size).toBe(0)
        await change({ enabled: true })
        expect(onSettings).toHaveBeenCalledTimes(2)
    })

    it('drops a settings read that a stop call or a newer read replaces', async () => {
        const { watchTrackingSettings } = await import('../src/storage')
        let notify: (changes: Record<string, unknown>) => void = () => {}
        Object.assign(chrome.storage.local, {
            onChanged: {
                addListener: (listener: typeof notify) => {
                    notify = listener
                },
                removeListener: () => {},
            },
        })
        const onSettings = vi.fn()
        const stop = watchTrackingSettings(onSettings)
        await chrome.storage.local.set({ enabled: false })
        notify({ enabled: {} })
        await Promise.resolve()
        await Promise.resolve()
        expect(onSettings).toHaveBeenCalledTimes(1)
        expect(onSettings).toHaveBeenCalledWith({
            enabled: false,
            ignoredChannels: [],
        })

        vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
            new Error('unavailable'),
        )
        notify({ enabled: {} })
        stop()
        await Promise.resolve()
        await Promise.resolve()
        expect(onSettings).toHaveBeenCalledTimes(1)
    })

    it('loads popup records and settings in one storage call', async () => {
        const { getPopupData } = await import('../src/storage')
        await chrome.storage.local.set({
            enabled: false,
            'ignored:channels': [' Channel '],
            'ytp:legacy': { t: 20, updatedAt: 1 },
        })
        const data = await getPopupData()
        expect(data.enabled).toBe(false)
        expect(data.ignoredChannels).toEqual(['channel'])
        expect(data.videos).toEqual([
            expect.objectContaining({
                videoId: 'legacy',
                t: 20,
                ft: 20,
                title: 'Untitled video',
            }),
        ])
        expect(chrome.storage.local.get).toHaveBeenCalledTimes(1)
        expect(chrome.storage.local.get).toHaveBeenCalledWith()
    })

    it('deletes state', async () => {
        await setVideoState('gone', {
            t: 1,
            ft: 1,
            updatedAt: 1,
            duration: 10,
            title: 'Gone',
            channel: 'Chan',
        })
        await deleteVideoState('gone')
        expect(await getVideoState('gone')).toBeNull()
    })
})
