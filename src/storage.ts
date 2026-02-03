import type { StoredVideoState, VideoItem } from './types'

const VIDEO_KEY_PREFIX = 'ytp:'
const IGNORED_CHANNELS_KEY = 'ignored:channels'

function keyFor(videoId: string): string {
    return `${VIDEO_KEY_PREFIX}${videoId}`
}

function isVideoKey(key: string): boolean {
    return key.startsWith(VIDEO_KEY_PREFIX)
}

function videoIdFromKey(key: string): string {
    return key.slice(VIDEO_KEY_PREFIX.length)
}

function isValidState(state?: StoredVideoState): boolean {
    return (
        !!state &&
        typeof state.t === 'number' &&
        typeof state.updatedAt === 'number'
    )
}

export function normalizeChannelName(name: string): string {
    return name.trim().toLowerCase()
}

export async function getAllVideoStates(): Promise<VideoItem[]> {
    const all = await chrome.storage.local.get()
    const items = Object.entries(all)
        .filter(([key, value]) => isVideoKey(key) && isValidState(value))
        .map(([key, value]) => {
            const state = value as StoredVideoState
            return {
                t: state.t,
                ft: typeof state.ft === 'number' ? state.ft : state.t,
                title: state.title,
                channel: state.channel,
                duration: state.duration,
                updatedAt: state.updatedAt,
                videoId: videoIdFromKey(key),
            } as VideoItem
        })
    return items
}

export async function getVideoState(
    videoId: string,
): Promise<StoredVideoState | null> {
    const key = keyFor(videoId)
    const result = await chrome.storage.local.get(key)
    const value = result[key] as StoredVideoState | undefined
    if (!value || typeof value.t !== 'number') {
        return null
    }
    return value
}

export async function setVideoState(
    videoId: string,
    state: StoredVideoState,
): Promise<void> {
    const key = keyFor(videoId)
    await chrome.storage.local.set({ [key]: state })
}

export async function deleteVideoState(videoId: string): Promise<void> {
    const key = keyFor(videoId)
    await chrome.storage.local.remove(key)
}

export async function getIgnoredChannels(): Promise<string[]> {
    const result = await chrome.storage.local.get(IGNORED_CHANNELS_KEY)
    const value = result[IGNORED_CHANNELS_KEY]
    if (!Array.isArray(value)) {
        return []
    }
    return value.filter((item): item is string => typeof item === 'string')
}

export async function addIgnoredChannel(name: string): Promise<string[]> {
    const normalized = normalizeChannelName(name)
    if (!normalized) {
        return getIgnoredChannels()
    }
    const existing = await getIgnoredChannels()
    if (existing.includes(normalized)) {
        return existing
    }
    const next = [...existing, normalized]
    await chrome.storage.local.set({ [IGNORED_CHANNELS_KEY]: next })
    return next
}

export async function removeIgnoredChannel(name: string): Promise<string[]> {
    const normalized = normalizeChannelName(name)
    if (!normalized) {
        return getIgnoredChannels()
    }
    const existing = await getIgnoredChannels()
    const next = existing.filter((item) => item !== normalized)
    if (next.length !== existing.length) {
        await chrome.storage.local.set({ [IGNORED_CHANNELS_KEY]: next })
    }
    return next
}
