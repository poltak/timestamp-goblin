import type { StoredVideoState, VideoItem } from './types'

const VIDEO_KEY_PREFIX = 'ytp:'
type RawStoredVideoState = Omit<StoredVideoState, 'maxT'> &
    Partial<Pick<StoredVideoState, 'maxT'>>

function keyFor(videoId: string): string {
    return `${VIDEO_KEY_PREFIX}${videoId}`
}

function isVideoKey(key: string): boolean {
    return key.startsWith(VIDEO_KEY_PREFIX)
}

function videoIdFromKey(key: string): string {
    return key.slice(VIDEO_KEY_PREFIX.length)
}

function normalizeState(state?: RawStoredVideoState): StoredVideoState | null {
    if (
        !state ||
        typeof state.lastWatchedTimestamp !== 'number' ||
        typeof state.updatedAt !== 'number'
    ) {
        return null
    }
    const maxT =
        typeof state.furthestWatchedTimestamp === 'number'
            ? state.furthestWatchedTimestamp
            : state.lastWatchedTimestamp
    return {
        ...state,
        furthestWatchedTimestamp: maxT,
    } as StoredVideoState
}

export async function getAllVideoStates(): Promise<VideoItem[]> {
    const all = await chrome.storage.local.get()
    const items = Object.entries(all ?? {})
        .filter(([key]) => isVideoKey(key))
        .map(([key, value]) => {
            const state = normalizeState(value as RawStoredVideoState)
            if (!state) {
                return null
            }
            return {
                lastWatchedTimestamp: state.lastWatchedTimestamp,
                furthestWatchedTimestamp: state.furthestWatchedTimestamp,
                title: state.title,
                channel: state.channel,
                duration: state.duration,
                updatedAt: state.updatedAt,
                videoId: videoIdFromKey(key),
            } as VideoItem
        })
        .filter((item): item is VideoItem => item !== null)
    return items
}

export async function getVideoState(
    videoId: string,
): Promise<StoredVideoState | null> {
    const key = keyFor(videoId)
    const result = await chrome.storage.local.get(key)
    const value = result[key] as RawStoredVideoState | undefined
    return normalizeState(value)
}

export async function setVideoState(
    videoId: string,
    state: StoredVideoState,
): Promise<void> {
    const key = keyFor(videoId)
    await chrome.storage.local.set({ [key]: state })
}
