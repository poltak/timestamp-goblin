import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    deleteVideoState,
    getAllVideoStates,
    getVideoState,
    setVideoState,
} from '../src/storage'
import type { StoredVideoState } from '../src/types'

type Store = Record<string, StoredVideoState>

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
        await setVideoState('bad', { t: 'nope' } as StoredVideoState)
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
