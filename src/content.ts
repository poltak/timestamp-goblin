import {
    getVideoState,
    normalizeChannelName,
    setVideoState,
    watchTrackingSettings,
    type TrackingSettings,
} from './storage'
import {
    clampResumeTarget,
    getChannelName,
    getMainVideo,
    getVideoId,
    getVideoTitle,
    hasExplicitStartTime,
    isAdShowing,
    isLiveVideo,
} from './youtube'
import type { StoredVideoState } from './types'
import {
    MIN_WRITE_GAP_MS,
    MIN_RESUME_SECONDS,
    DEFAULT_VIDEO_TITLE,
    DEFAULT_CHANNEL_NAME,
    SAVE_INTERVAL_SECONDS,
    NEAR_START_WINDOW_SECONDS,
    DURATION_MATCH_SECONDS,
    DEBUG,
} from './constants'
import { log } from './util'
import { isFinished } from './progress'

let activeVideoId: string | null = null
/** Changes with each video, so that late storage replies for an old one are dropped. */
let sessionToken = 0
/** `undefined` until the stored state of the active video is read. */
let storedState: StoredVideoState | null | undefined = undefined
let settings: TrackingSettings | null = null
let resumePending = false
/**
 * The video that the media in the player belongs to: the active video when
 * that media loaded. During an in-page navigation the URL names the next video
 * before the player has it, so this is then not the active video. `null` for
 * media that loaded on a page that is not a watch page.
 */
let mediaVideoId: string | null = null
let currentFurthestTime = 0
let saveIntervalId: number | null = null
let lastWriteAt = 0
let savingToken: number | null = null
let resumeReapplyId: number | null = null
let stopWatchingSettings: (() => void) | null = null
let hasInit = false

function getState() {
    return {
        activeVideoId,
        sessionToken,
        storedState,
        settings,
        resumePending,
        mediaVideoId,
        currentFurthestTime,
        saveIntervalId,
        lastWriteAt,
        resumeReapplyId,
        hasInit,
    }
}

if (DEBUG) {
    Object.assign(globalThis, { getState })
}

export function teardown(): void {
    sessionToken += 1
    stopSavingLoop()

    if (resumeReapplyId !== null) {
        window.clearTimeout(resumeReapplyId)
        resumeReapplyId = null
    }

    activeVideoId = null
    storedState = undefined
    resumePending = false
    lastWriteAt = 0
    savingToken = null
    currentFurthestTime = 0
}

function isMainVideo(target: EventTarget | null): target is HTMLVideoElement {
    return target instanceof HTMLVideoElement && target === getMainVideo()
}

function isIgnoredChannel(channel: string | null | undefined): boolean {
    return (
        !!channel &&
        !!settings?.ignoredChannels.includes(normalizeChannelName(channel))
    )
}

/** True when the player holds the active video, with its metadata available. */
function hasActiveMedia(video: HTMLVideoElement): boolean {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA || isAdShowing()) {
        return false
    }
    if (mediaVideoId !== null) {
        return mediaVideoId === activeVideoId
    }
    // The miniplayer loaded this media. It is the active video only if its
    // length is the stored length.
    return (
        !!storedState &&
        Math.abs(storedState.duration - video.duration) <=
            DURATION_MATCH_SECONDS
    )
}

export async function saveNow(
    reason: string,
    options: { leaving?: boolean } = {},
): Promise<void> {
    // A resume that is still possible must come before the position is replaced.
    tryResume()
    const token = sessionToken
    const videoId = activeVideoId
    const video = getMainVideo()
    const now = Date.now()
    if (
        !videoId ||
        !video ||
        !settings?.enabled ||
        // The furthest time is not known before the stored state is read.
        storedState === undefined ||
        savingToken === token ||
        now - lastWriteAt < MIN_WRITE_GAP_MS ||
        // During a navigation the URL changes before the player does.
        (!options.leaving && videoId !== getVideoId()) ||
        !hasActiveMedia(video) ||
        isLiveVideo(video)
    ) {
        return
    }

    const time = video.currentTime
    if (!Number.isFinite(time) || time <= 0 || time === storedState?.t) {
        return
    }
    const channel =
        getChannelName() ?? storedState?.channel ?? DEFAULT_CHANNEL_NAME
    if (isIgnoredChannel(channel)) {
        return
    }

    const payload: StoredVideoState = {
        t: time,
        ft: Math.max(currentFurthestTime, time),
        updatedAt: now,
        duration:
            Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : Infinity,
        channel,
        title: getVideoTitle() ?? storedState?.title ?? DEFAULT_VIDEO_TITLE,
    }
    log('save', reason, payload)

    savingToken = token
    try {
        // No await comes before this call, so a save at page close is sent.
        await setVideoState(videoId, payload)
        if (token === sessionToken) {
            lastWriteAt = now
            currentFurthestTime = payload.ft
            storedState = payload
            // The stored time is now the current time, so a seek has no use.
            resumePending = false
        }
    } catch (error) {
        log('save failed', error)
    } finally {
        if (savingToken === token) savingToken = null
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
    if (saveIntervalId !== null || !activeVideoId) {
        return
    }
    log('start saving loop')
    saveIntervalId = window.setInterval(() => {
        void saveNow('interval')
    }, SAVE_INTERVAL_SECONDS * 1000)
}

/**
 * Seeks to the stored time once the stored state, the settings, and the
 * metadata of the active video are all available. It is safe to call often.
 */
export function tryResume(): void {
    const video = getMainVideo()
    const videoId = activeVideoId
    if (
        !resumePending ||
        !videoId ||
        !settings ||
        storedState === undefined ||
        !video ||
        !hasActiveMedia(video)
    ) {
        return
    }
    const state = storedState
    // An ad can load before the player marks it, but it does not have the
    // length of the video. The video loads its own metadata after the ad.
    if (
        state &&
        Number.isFinite(state.duration) &&
        Number.isFinite(video.duration) &&
        Math.abs(state.duration - video.duration) > DURATION_MATCH_SECONDS
    ) {
        return
    }
    resumePending = false

    if (
        !settings.enabled ||
        !state ||
        // After a navigation the page can still show the previous channel, so
        // only the stored name is used here.
        isIgnoredChannel(state.channel) ||
        state.t < MIN_RESUME_SECONDS ||
        hasExplicitStartTime() ||
        isLiveVideo(video) ||
        video.currentTime > NEAR_START_WINDOW_SECONDS ||
        // A finished video starts again, as it would end immediately otherwise.
        isFinished({
            time: state.t,
            duration: Number.isFinite(video.duration)
                ? video.duration
                : state.duration,
        })
    ) {
        return
    }

    const token = sessionToken
    const target = clampResumeTarget(state.t, video.duration)
    log('resume', { videoId, target, current: video.currentTime })
    video.currentTime = target

    resumeReapplyId = window.setTimeout(() => {
        resumeReapplyId = null
        if (
            token !== sessionToken ||
            video !== getMainVideo() ||
            videoId !== getVideoId() ||
            hasExplicitStartTime() ||
            // An ad can start in this element after the seek.
            !hasActiveMedia(video)
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

function startSession(videoId: string): void {
    const token = ++sessionToken
    log('init', videoId)
    activeVideoId = videoId
    resumePending = true

    getVideoState(videoId).then(
        (state) => {
            if (token !== sessionToken) return
            storedState = state
            currentFurthestTime = state ? state.ft : 0
            tryResume()
        },
        (error) => log('state read failed', error),
    )

    const video = getMainVideo()
    if (video && !video.paused) {
        startSavingLoop()
    }
}

export function handleUrlChange(): void {
    const nextVideoId = getVideoId()
    if (nextVideoId === activeVideoId) {
        return
    }
    log('url change', { nextVideoId, activeVideoId })
    teardown()
    if (nextVideoId) {
        startSession(nextVideoId)
    }
}

export function onNavigate(): void {
    // Last chance to save: the player still holds the video the user leaves.
    if (activeVideoId && activeVideoId !== getVideoId()) {
        void saveNow('navigate', { leaving: true })
    }
    handleUrlChange()
}

export function onLoadedMetadata(event: Event): void {
    if (!isMainVideo(event.target)) {
        return
    }
    handleUrlChange()
    mediaVideoId = activeVideoId
    tryResume()
    if (!event.target.paused) {
        startSavingLoop()
    }
}

export function onPlay(event: Event): void {
    if (isMainVideo(event.target)) {
        // The player can remove its ad mark after the video metadata loads.
        tryResume()
        startSavingLoop()
    }
}

export function onPause(event: Event): void {
    if (isMainVideo(event.target)) {
        void saveNow('pause')
        stopSavingLoop()
    }
}

export function onVisibilityChange(): void {
    // A hidden tab can continue to play, so only the pause event stops the loop.
    if (document.hidden) void saveNow('hidden')
}

export function onPageHide(): void {
    void saveNow('pagehide')
}

// Media events do not bubble. The capture phase gets them for a player that
// does not exist yet, so there is no need to observe the DOM for it.
const globalListeners: [EventTarget, string, EventListener, boolean][] = [
    [document, 'loadedmetadata', onLoadedMetadata, true],
    [document, 'play', onPlay, true],
    [document, 'playing', onPlay, true],
    [document, 'pause', onPause, true],
    [document, 'visibilitychange', onVisibilityChange, false],
    [window, 'pagehide', onPageHide, false],
    [window, 'yt-navigate-start', onNavigate, false],
    [window, 'yt-navigate-finish', onNavigate, false],
    [window, 'popstate', onNavigate, false],
]

export function initContentScript(): void {
    if (hasInit) {
        return
    }
    hasInit = true
    stopWatchingSettings = watchTrackingSettings((next) => {
        settings = next
        tryResume()
    })
    for (const [target, type, listener, capture] of globalListeners) {
        target.addEventListener(type, listener, capture)
    }
    handleUrlChange()
    // The first player of a document cannot hold a previous video.
    mediaVideoId = activeVideoId
    tryResume()
}

initContentScript()

export const __testing = {
    getState,
    setLastWriteAt: (value: number) => {
        lastWriteAt = value
    },
    resetForTests: () => {
        teardown()
        for (const [target, type, listener, capture] of globalListeners) {
            target.removeEventListener(type, listener, capture)
        }
        stopWatchingSettings?.()
        stopWatchingSettings = null
        settings = null
        mediaVideoId = null
        hasInit = false
    },
}
