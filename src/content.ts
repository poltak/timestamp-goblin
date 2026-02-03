import { watchUrlChanges, type UrlChangeHandler } from './spa'
import {
    getIgnoredChannels,
    getVideoState,
    normalizeChannelName,
    setVideoState,
} from './storage'
import {
    clampResumeTarget,
    getChannelName,
    getVideoId,
    getVideoTitle,
    isLiveVideo,
    isWatchPage,
    waitForVideoElement,
} from './youtube'
import type { StoredVideoState } from './types'
import {
    MIN_WRITE_GAP_MS,
    MIN_RESUME_SECONDS,
    DEFAULT_VIDEO_TITLE,
    DEFAULT_CHANNEL_NAME,
    SAVE_INTERVAL_SECONDS,
    NEAR_START_WINDOW_SECONDS,
    DEBUG,
} from './constants'
import { log } from './util'
import { debounce } from './debounce'

let activeVideoId: string | null = null
let activeVideo: HTMLVideoElement | null = null
let saveIntervalId: number | null = null
let lastWriteAt = 0
let initToken = 0
let waitHandle: ReturnType<typeof waitForVideoElement> | null = null
let resumeReapplyId: number | null = null
let currentFurthestTime = 0
let unwatchUrlChanges: (() => void) | null = null
let hasInit = false
let beforeUnloadAttached = false

if (DEBUG) {
    globalThis['getState'] = () => ({
        activeVideo,
        activeVideoId,
        lastWriteAt,
        initToken,
        waitHandle,
        resumeReapplyId,
        saveIntervalId,
    })
}

export function teardown(): void {
    initToken += 1

    if (saveIntervalId !== null) {
        window.clearInterval(saveIntervalId)
        saveIntervalId = null
    }

    if (resumeReapplyId !== null) {
        window.clearTimeout(resumeReapplyId)
        resumeReapplyId = null
    }

    if (waitHandle) {
        waitHandle.cancel()
        waitHandle = null
    }

    if (activeVideo) {
        activeVideo.removeEventListener('pause', onPause)
        activeVideo.removeEventListener('play', onPlay)
    }
    document.removeEventListener('visibilitychange', onVisibilityChange)

    activeVideo = null
    activeVideoId = null
    lastWriteAt = 0
    currentFurthestTime = 0
}

export function isSafeToSave(video: HTMLVideoElement): boolean {
    if (!isWatchPage()) {
        return false
    }
    if (!activeVideoId) {
        return false
    }
    if (isLiveVideo(video)) {
        return false
    }
    const t = video.currentTime
    if (!Number.isFinite(t) || t <= 0) {
        return false
    }
    return true
}

async function isIgnoredChannel(name: string): Promise<boolean> {
    const normalized = normalizeChannelName(name)
    if (!normalized) {
        return false
    }
    const ignored = await getIgnoredChannels()
    return ignored.includes(normalized)
}

export async function saveNow(reason: string): Promise<void> {
    const videoId = activeVideoId
    const video = activeVideo
    const now = Date.now()
    if (
        !videoId ||
        !video ||
        videoId !== getVideoId() ||
        !isSafeToSave(video) ||
        now - lastWriteAt < MIN_WRITE_GAP_MS
    ) {
        log('not saving', { videoId, video, now, lastWriteAt })
        return
    }

    const duration =
        Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : Infinity
    const title = getVideoTitle() ?? DEFAULT_VIDEO_TITLE
    const channel = getChannelName() ?? DEFAULT_CHANNEL_NAME

    if (await isIgnoredChannel(channel)) {
        log('not saving (ignored channel)', { videoId, channel })
        return
    }

    lastWriteAt = now
    currentFurthestTime = Math.max(currentFurthestTime, video.currentTime)

    const payload: StoredVideoState = {
        t: video.currentTime,
        ft: currentFurthestTime,
        updatedAt: now,
        duration,
        channel,
        title,
    }

    log('save', reason, payload)
    await setVideoState(videoId, payload)
}

export function onPause(): void {
    void saveNow('pause')
    stopSavingLoop()
}

export function onPlay(): void {
    startSavingLoop()
}

export function onVisibilityChange(): void {
    if (document.hidden) {
        void saveNow('hidden')
        stopSavingLoop()
    } else if (activeVideo && !activeVideo.paused) {
        startSavingLoop()
    }
}

export function stopSavingLoop(): void {
    if (saveIntervalId !== null) {
        log('stop saving loop')
        window.clearInterval(saveIntervalId)
        saveIntervalId = null
    }
}

export function startSavingLoop(): void {
    if (saveIntervalId !== null) {
        return
    }
    log('start saving loop')
    saveIntervalId = window.setInterval(() => {
        void saveNow('interval')
    }, SAVE_INTERVAL_SECONDS * 1000)
}

export async function tryResume(
    video: HTMLVideoElement,
    videoId: string,
    token: number,
): Promise<void> {
    const channel = getChannelName() ?? DEFAULT_CHANNEL_NAME
    if (await isIgnoredChannel(channel)) {
        log('not resuming (ignored channel)', { videoId, channel })
        return
    }

    const state = await getVideoState(videoId)
    if (token !== initToken) {
        return
    }

    if (state) {
        currentFurthestTime = typeof state.ft === 'number' ? state.ft : state.t
    } else {
        currentFurthestTime = 0
    }

    if (
        !state ||
        state.t < MIN_RESUME_SECONDS ||
        isLiveVideo(video) ||
        video.currentTime > NEAR_START_WINDOW_SECONDS
    ) {
        return
    }

    const target = clampResumeTarget(state.t, video.duration)
    log('resume', { videoId, target, current: video.currentTime })
    video.currentTime = target

    resumeReapplyId = window.setTimeout(() => {
        resumeReapplyId = null
        if (token !== initToken || videoId !== activeVideoId) {
            return
        }
        if (Math.abs(video.currentTime - target) > 1.5) {
            log('resume reapply', { target, current: video.currentTime })
            video.currentTime = target
        }
    }, 500)
}

export async function initForVideo(videoId: string): Promise<void> {
    const token = ++initToken
    log('init', videoId)

    waitHandle = waitForVideoElement(15000)
    let video: HTMLVideoElement
    try {
        video = await waitHandle.promise
    } catch (err) {
        log('video wait failed', err)
        return
    } finally {
        if (waitHandle) {
            waitHandle = null
        }
    }

    if (token !== initToken) {
        return
    }

    activeVideo = video

    await tryResume(video, videoId, token)
    if (token !== initToken) {
        return
    }

    video.addEventListener('pause', onPause)
    video.addEventListener('play', onPlay)
    document.addEventListener('visibilitychange', onVisibilityChange)

    if (!video.paused && !document.hidden) {
        startSavingLoop()
    }
}

export const handleUrlChange: UrlChangeHandler = () => {
    const nextVideoId = getVideoId()
    log('url change', { nextVideoId, activeVideoId })
    if (nextVideoId === activeVideoId) {
        return
    }
    teardown()
    activeVideoId = nextVideoId
    if (!nextVideoId) {
        return
    }
    void initForVideo(nextVideoId)
}

const debouncedHandleUrlChange = debounce(handleUrlChange, 150)

function cleanupGlobalListeners(): void {
    if (unwatchUrlChanges) {
        unwatchUrlChanges()
        unwatchUrlChanges = null
    }
    if (beforeUnloadAttached) {
        window.removeEventListener('yt-navigate-finish', debouncedHandleUrlChange)
        window.removeEventListener('beforeunload', onBeforeUnload)
        beforeUnloadAttached = false
    }
}

function onBeforeUnload(): void {
    cleanupGlobalListeners()
}

export function initContentScript(): void {
    if (hasInit) {
        return
    }
    hasInit = true
    unwatchUrlChanges = watchUrlChanges(debouncedHandleUrlChange, {
        debounceMs: 0,
    })
    window.addEventListener('yt-navigate-finish', debouncedHandleUrlChange)
    window.addEventListener('beforeunload', onBeforeUnload)
    beforeUnloadAttached = true
    handleUrlChange()
}

initContentScript()

export const __testing = {
    getState: () => ({
        activeVideo,
        activeVideoId,
        lastWriteAt,
        initToken,
        waitHandle,
        resumeReapplyId,
        saveIntervalId,
        currentFurthestTime,
        hasInit,
    }),
    setActive: (videoId: string | null, video: HTMLVideoElement | null) => {
        activeVideoId = videoId
        activeVideo = video
    },
    setLastWriteAt: (value: number) => {
        lastWriteAt = value
    },
    setInitToken: (value: number) => {
        initToken = value
    },
    resetForTests: () => {
        teardown()
        cleanupGlobalListeners()
        hasInit = false
        beforeUnloadAttached = false
    },
}
