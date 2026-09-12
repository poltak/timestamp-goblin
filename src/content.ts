import { watchUrlChanges, type UrlChangeHandler } from './spa'
import {
    getTrackingSettings,
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
let savingToken: number | null = null
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
    savingToken = null
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

export async function saveNow(reason: string): Promise<void> {
    const token = initToken
    const videoId = activeVideoId
    const video = activeVideo
    const now = Date.now()
    if (
        !videoId ||
        !video ||
        videoId !== getVideoId() ||
        !isSafeToSave(video) ||
        now - lastWriteAt < MIN_WRITE_GAP_MS ||
        savingToken === token
    ) {
        log('not saving', { videoId, video, now, lastWriteAt })
        return
    }

    const time = video.currentTime
    const duration =
        Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : Infinity
    const title = getVideoTitle() ?? DEFAULT_VIDEO_TITLE
    const channel = getChannelName() ?? DEFAULT_CHANNEL_NAME

    savingToken = token
    try {
        const settings = await getTrackingSettings()
        if (
            token !== initToken ||
            video !== activeVideo ||
            videoId !== getVideoId() ||
            !settings.enabled ||
            settings.ignoredChannels.includes(normalizeChannelName(channel))
        )
            return

        const payload: StoredVideoState = {
            t: time,
            ft: Math.max(currentFurthestTime, time),
            updatedAt: now,
            duration,
            channel,
            title,
        }
        log('save', reason, payload)
        await setVideoState(videoId, payload)
        if (token === initToken) {
            lastWriteAt = now
            currentFurthestTime = payload.ft
        }
    } catch (error) {
        log('save failed', error)
    } finally {
        if (savingToken === token) savingToken = null
    }
}

export function onPause(): void {
    void saveNow('pause')
    stopSavingLoop()
}

export function onPlay(): void {
    if (!document.hidden) startSavingLoop()
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
    const [state, settings] = await Promise.all([
        getVideoState(videoId),
        getTrackingSettings(),
    ])
    if (token !== initToken || videoId !== getVideoId()) {
        return
    }

    if (state) {
        currentFurthestTime = typeof state.ft === 'number' ? state.ft : state.t
    } else {
        currentFurthestTime = 0
    }

    if (
        !settings.enabled ||
        settings.ignoredChannels.includes(
            normalizeChannelName(getChannelName() ?? DEFAULT_CHANNEL_NAME),
        ) ||
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
        if (
            token !== initToken ||
            videoId !== activeVideoId ||
            videoId !== getVideoId()
        ) {
            return
        }
        if (
            video.currentTime <= NEAR_START_WINDOW_SECONDS &&
            Math.abs(video.currentTime - target) > 1.5
        ) {
            log('resume reapply', { target, current: video.currentTime })
            video.currentTime = target
        }
    }, 500)
}

export async function initForVideo(videoId: string): Promise<void> {
    const token = ++initToken
    log('init', videoId)

    const handle = waitForVideoElement(15000)
    waitHandle = handle
    let video: HTMLVideoElement
    try {
        video = await handle.promise
    } catch (err) {
        log('video wait failed', err)
        return
    } finally {
        if (waitHandle === handle) {
            waitHandle = null
        }
    }

    if (token !== initToken) {
        return
    }

    activeVideo = video

    try {
        await tryResume(video, videoId, token)
    } catch (error) {
        log('resume failed', error)
        return
    }
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
    debouncedHandleUrlChange.cancel()
    if (unwatchUrlChanges) {
        unwatchUrlChanges()
        unwatchUrlChanges = null
    }
    if (beforeUnloadAttached) {
        window.removeEventListener(
            'yt-navigate-finish',
            debouncedHandleUrlChange,
        )
        window.removeEventListener('beforeunload', onBeforeUnload)
        beforeUnloadAttached = false
    }
}

function onBeforeUnload(): void {
    cleanupGlobalListeners()
}

export function initContentScript(): void {
    if (document.documentElement.dataset.timestampGoblinDisabled === 'true') {
        return
    }
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
