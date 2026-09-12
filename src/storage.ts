import type { StoredVideoState, VideoItem } from './types'
import { DEFAULT_CHANNEL_NAME, DEFAULT_VIDEO_TITLE } from './constants'

const VIDEO_KEY_PREFIX = 'ytp:'
const IGNORED_CHANNELS_KEY = 'ignored:channels'
const ENABLED_KEY = 'enabled'

function keyFor(videoId: string): string {
    return `${VIDEO_KEY_PREFIX}${videoId}`
}

function isNonNegativeNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function readVideoState(value: unknown): StoredVideoState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const state = value as Record<string, unknown>
    if (
        !isNonNegativeNumber(state.t) ||
        !isNonNegativeNumber(state.updatedAt)
    ) {
        return null
    }

    return {
        t: state.t,
        ft: isNonNegativeNumber(state.ft)
            ? Math.max(state.ft, state.t)
            : state.t,
        updatedAt: state.updatedAt,
        duration:
            isNonNegativeNumber(state.duration) && state.duration > 0
                ? state.duration
                : Infinity,
        title:
            typeof state.title === 'string' && state.title.trim()
                ? state.title
                : DEFAULT_VIDEO_TITLE,
        channel:
            typeof state.channel === 'string' && state.channel.trim()
                ? state.channel
                : DEFAULT_CHANNEL_NAME,
    }
}

export function normalizeChannelName(name: string): string {
    return name.trim().toLowerCase()
}

export async function getAllVideoStates(): Promise<VideoItem[]> {
    const all = await chrome.storage.local.get()
    const items: VideoItem[] = []
    for (const [key, value] of Object.entries(all)) {
        if (
            !key.startsWith(VIDEO_KEY_PREFIX) ||
            key.length === VIDEO_KEY_PREFIX.length
        )
            continue
        const state = readVideoState(value)
        if (state)
            items.push({
                ...state,
                videoId: key.slice(VIDEO_KEY_PREFIX.length),
            })
    }
    return items
}

export async function getVideoState(
    videoId: string,
): Promise<StoredVideoState | null> {
    const key = keyFor(videoId)
    const result = await chrome.storage.local.get(key)
    return readVideoState(result[key])
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

function readIgnoredChannels(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }
    return [
        ...new Set(
            value
                .filter((item): item is string => typeof item === 'string')
                .map(normalizeChannelName)
                .filter(Boolean),
        ),
    ]
}

export async function getIgnoredChannels(): Promise<string[]> {
    const result = await chrome.storage.local.get(IGNORED_CHANNELS_KEY)
    return readIgnoredChannels(result[IGNORED_CHANNELS_KEY])
}

export async function getTrackingSettings(): Promise<{
    enabled: boolean
    ignoredChannels: string[]
}> {
    const result = await chrome.storage.local.get([
        ENABLED_KEY,
        IGNORED_CHANNELS_KEY,
    ])
    return {
        enabled:
            typeof result[ENABLED_KEY] === 'boolean'
                ? result[ENABLED_KEY]
                : true,
        ignoredChannels: readIgnoredChannels(result[IGNORED_CHANNELS_KEY]),
    }
}

export async function getEnabled(): Promise<boolean> {
    const result = await chrome.storage.local.get(ENABLED_KEY)
    const value = result[ENABLED_KEY]
    if (typeof value === 'boolean') {
        return value
    }
    return true
}

export async function setEnabled(enabled: boolean): Promise<void> {
    await chrome.storage.local.set({ [ENABLED_KEY]: enabled })
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
