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

const DEBUG = import.meta.env.MODE !== 'production'

const minResumeSeconds = 15
const nearStartWindowSeconds = 6
const saveIntervalSeconds = 8
const minWriteGapMs = 1000

let activeVideoId: string | null = null
let activeVideo: HTMLVideoElement | null = null
let saveIntervalId: number | null = null
let lastWriteAt = 0
let initToken = 0
let waitHandle: ReturnType<typeof waitForVideoElement> | null = null
let resumeReapplyId: number | null = null

function log(...args: unknown[]): void {
    if (DEBUG) {
        console.log('[TimestampGoblin]', ...args)
    }
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
    if (!videoId || !video) {
        return
    }
    if (videoId !== getVideoId()) {
        return
    }
    if (!isSafeToSave(video)) {
        return
    }
    const now = Date.now()
    if (now - lastWriteAt < minWriteGapMs) {
        return
    }
    lastWriteAt = now

    const duration =
        Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : undefined
    const title = getVideoTitle() ?? undefined
    const channel = getChannelName() ?? undefined
    const payload = {
        t: video.currentTime,
        updatedAt: now,
        duration,
        title,
        channel,
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
    }, saveIntervalSeconds * 1000)
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
    if (!state) {
        return
    }
    if (state.t < minResumeSeconds) {
        return
    }
    if (isLiveVideo(video)) {
        return
    }
    if (video.currentTime > nearStartWindowSeconds) {
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

const unwatchUrlChanges = watchUrlChanges(handleUrlChange, { debounceMs: 150 })
handleUrlChange()

// TODO: some way to disable the ext behavior
window.addEventListener('beforeunload', () => {
    unwatchUrlChanges()
})
