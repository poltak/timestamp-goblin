import { watchUrlChanges, type UrlChangeHandler } from './spa'
import { getVideoState, setVideoState } from './storage'
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

function teardown(): void {
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
    }
    document.removeEventListener('visibilitychange', onVisibilityChange)

    activeVideo = null
    activeVideoId = null
    lastWriteAt = 0
    currentFurthestTime = 0
}

function isSafeToSave(video: HTMLVideoElement): boolean {
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

async function saveNow(reason: string): Promise<void> {
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

    lastWriteAt = now
    const duration =
        Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : Infinity
    const title = getVideoTitle() ?? DEFAULT_VIDEO_TITLE
    const channel = getChannelName() ?? DEFAULT_CHANNEL_NAME

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

function onPause(): void {
    void saveNow('pause')
}

function onVisibilityChange(): void {
    if (document.hidden) {
        void saveNow('hidden')
    }
}

function startSavingLoop(): void {
    if (saveIntervalId !== null) {
        window.clearInterval(saveIntervalId)
    }
    saveIntervalId = window.setInterval(() => {
        void saveNow('interval')
    }, SAVE_INTERVAL_SECONDS * 1000)
}

async function tryResume(
    video: HTMLVideoElement,
    videoId: string,
    token: number,
): Promise<void> {
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

async function initForVideo(videoId: string): Promise<void> {
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
    document.addEventListener('visibilitychange', onVisibilityChange)
    startSavingLoop()
}

const handleUrlChange: UrlChangeHandler = () => {
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

const unwatchUrlChanges = watchUrlChanges(debouncedHandleUrlChange, {
    debounceMs: 0,
})
window.addEventListener('yt-navigate-finish', debouncedHandleUrlChange)
handleUrlChange()

// TODO: some way to disable the ext behavior
window.addEventListener('beforeunload', () => {
    unwatchUrlChanges()
    window.removeEventListener('yt-navigate-finish', debouncedHandleUrlChange)
})
