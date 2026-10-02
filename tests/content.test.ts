import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_RESUME_SECONDS, NEAR_START_WINDOW_SECONDS } from '../src/constants'
import { deferred } from './helpers'
import type { TrackingSettings } from '../src/storage'
import type { StoredVideoState } from '../src/types'

type ContentModule = typeof import('../src/content')

let settings: TrackingSettings | null = null
let reportSettings: (next: TrackingSettings) => void = () => {}
let video: HTMLVideoElement

const storageMocks = {
    getVideoState: vi.fn<(videoId: string) => Promise<StoredVideoState | null>>(
        async () => null,
    ),
    setVideoState: vi.fn<
        (videoId: string, state: StoredVideoState) => Promise<void>
    >(async () => {}),
    normalizeChannelName: (value: string) => value.trim().toLowerCase(),
    watchTrackingSettings: vi.fn(
        (onSettings: (next: TrackingSettings) => void) => {
            reportSettings = onSettings
            if (settings) onSettings(settings)
            return vi.fn()
        },
    ),
}

const youtubeMocks = {
    clampResumeTarget: vi.fn((t: number, duration: number) =>
        Math.min(Math.max(t, 0), duration - 0.5),
    ),
    getChannelName: vi.fn<() => string | null>(() => 'Channel'),
    getMainVideo: vi.fn<() => HTMLVideoElement | null>(() => video),
    getVideoId: vi.fn<() => string | null>(() => 'vid1'),
    hasExplicitStartTime: vi.fn(() => false),
    getVideoTitle: vi.fn<() => string | null>(() => 'Title'),
    isAdShowing: vi.fn(() => false),
    isLiveVideo: vi.fn(() => false),
}

vi.mock('../src/storage', () => storageMocks)
vi.mock('../src/youtube', () => youtubeMocks)
vi.mock('../src/util', () => ({ log: vi.fn() }))

type Media = Partial<
    Record<'currentTime' | 'duration' | 'readyState', number> & {
        paused: boolean
    }
>

function setMedia(target: HTMLVideoElement, values: Media): void {
    for (const [name, value] of Object.entries(values)) {
        Object.defineProperty(target, name, {
            value,
            writable: true,
            configurable: true,
        })
    }
}

function makeVideo(values: Media = {}): HTMLVideoElement {
    const element = document.createElement('video')
    setMedia(element, {
        currentTime: 0,
        duration: 100,
        readyState: 1,
        paused: true,
        ...values,
    })
    document.body.appendChild(element)
    return element
}

function storedState(values: Partial<StoredVideoState>): StoredVideoState {
    return {
        t: 50,
        ft: 60,
        updatedAt: 1,
        duration: 100,
        title: 'Title',
        channel: 'Channel',
        ...values,
    }
}

describe('content script', () => {
    let mod: ContentModule

    /** Loads the content script on a watch page and waits for the stored state. */
    async function start(): Promise<void> {
        vi.resetModules()
        mod = await import('../src/content')
        await vi.advanceTimersByTimeAsync(0)
    }

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
        settings = { enabled: true, ignoredChannels: [] }
        storageMocks.getVideoState.mockReset()
        storageMocks.getVideoState.mockResolvedValue(null)
        storageMocks.setVideoState.mockReset()
        storageMocks.setVideoState.mockResolvedValue(undefined)
        storageMocks.watchTrackingSettings.mockClear()
        youtubeMocks.getVideoId.mockReturnValue('vid1')
        youtubeMocks.hasExplicitStartTime.mockReturnValue(false)
        youtubeMocks.isAdShowing.mockReturnValue(false)
        youtubeMocks.isLiveVideo.mockReturnValue(false)
        youtubeMocks.getVideoTitle.mockReturnValue('Title')
        youtubeMocks.getChannelName.mockReturnValue('Channel')
        document.body.replaceChildren()
        video = makeVideo()
    })

    afterEach(() => {
        mod.__testing.resetForTests()
    })

    it('saves video state when safe', async () => {
        setMedia(video, { currentTime: 42 })
        await start()
        await mod.saveNow('test')

        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)
        expect(storageMocks.setVideoState).toHaveBeenCalledWith('vid1', {
            t: 42,
            ft: 42,
            updatedAt: Date.now(),
            duration: 100,
            title: 'Title',
            channel: 'Channel',
        })
    })

    it('starts the storage write with no wait, so a save at page close is sent', async () => {
        setMedia(video, { currentTime: 42 })
        await start()
        window.dispatchEvent(new Event('pagehide'))
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)
    })

    it('skips saving and resuming for ignored channels', async () => {
        settings = { enabled: true, ignoredChannels: ['channel'] }
        storageMocks.getVideoState.mockResolvedValue(storedState({ t: 50 }))
        await start()
        expect(video.currentTime).toBe(0)
        expect(mod.__testing.getState().resumePending).toBe(false)

        video.currentTime = 42
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()
    })

    it('uses the stored title and channel when the page does not show them yet', async () => {
        settings = { enabled: true, ignoredChannels: ['channel'] }
        youtubeMocks.getChannelName.mockReturnValue(null)
        youtubeMocks.getVideoTitle.mockReturnValue(null)
        storageMocks.getVideoState.mockResolvedValue(storedState({ t: 50 }))
        await start()
        expect(video.currentTime).toBe(0)

        video.currentTime = 42
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        reportSettings({ enabled: true, ignoredChannels: [] })
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).toHaveBeenCalledWith(
            'vid1',
            expect.objectContaining({ title: 'Title', channel: 'Channel' }),
        )
    })

    it('skips saving and resuming when disabled', async () => {
        settings = { enabled: false, ignoredChannels: [] }
        storageMocks.getVideoState.mockResolvedValue(storedState({ t: 50 }))
        await start()
        expect(video.currentTime).toBe(0)

        video.currentTime = 42
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()
    })

    it('applies a settings change with no storage read for each save', async () => {
        setMedia(video, { currentTime: 42 })
        await start()
        reportSettings({ enabled: false, ignoredChannels: [] })
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        reportSettings({ enabled: true, ignoredChannels: [] })
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)
        expect(storageMocks.watchTrackingSettings).toHaveBeenCalledTimes(1)
    })

    it('waits for the settings before it resumes or saves', async () => {
        settings = null
        storageMocks.getVideoState.mockResolvedValue(storedState({ t: 50 }))
        await start()
        expect(video.currentTime).toBe(0)
        video.currentTime = 3
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        reportSettings({ enabled: true, ignoredChannels: [] })
        expect(video.currentTime).toBe(50)
    })

    it('skips saving when conditions fail', async () => {
        await start()
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        video.currentTime = 10
        youtubeMocks.getVideoId.mockReturnValue('vid2')
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        youtubeMocks.getVideoId.mockReturnValue('vid1')
        youtubeMocks.isLiveVideo.mockReturnValue(true)
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        youtubeMocks.isLiveVideo.mockReturnValue(false)
        setMedia(video, { readyState: 0 })
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()
    })

    it('does not save before the stored state is read', async () => {
        const state = deferred<StoredVideoState | null>()
        storageMocks.getVideoState.mockReturnValue(state.promise)
        setMedia(video, { currentTime: 3 })
        await start()
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        state.resolve(storedState({ t: 120, ft: 150, duration: 100 }))
        await vi.advanceTimersByTimeAsync(0)
        video.currentTime = 30
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).toHaveBeenCalledWith(
            'vid1',
            expect.objectContaining({ t: 30, ft: 150 }),
        )
    })

    it('respects minimum write gap', async () => {
        setMedia(video, { currentTime: 10 })
        await start()
        mod.__testing.setLastWriteAt(Date.now())

        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()
    })

    it('does not write again when the position did not change', async () => {
        setMedia(video, { currentTime: 10 })
        await start()
        await mod.saveNow('pause')
        await vi.advanceTimersByTimeAsync(5000)
        await mod.saveNow('hidden')
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)

        video.currentTime = 11
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(2)
    })

    it('resumes to saved position and reapplies if needed', async () => {
        setMedia(video, { duration: 200 })
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, ft: 130, duration: 200 }),
        )
        await start()
        expect(video.currentTime).toBeCloseTo(120)
        expect(mod.__testing.getState().currentFurthestTime).toBe(130)

        video.currentTime = 0
        vi.advanceTimersByTime(500)
        expect(video.currentTime).toBeCloseTo(120)
    })

    it('does not overwrite a user seek during resume reapply', async () => {
        setMedia(video, { duration: 300 })
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, ft: 130, duration: 300 }),
        )
        await start()
        video.currentTime = 200
        vi.advanceTimersByTime(500)
        expect(video.currentTime).toBe(200)
    })

    it('preserves a timestamp link before the player applies its seek', async () => {
        setMedia(video, { duration: 300 })
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, ft: 150, duration: 300 }),
        )
        youtubeMocks.hasExplicitStartTime.mockReturnValue(true)
        await start()
        expect(video.currentTime).toBe(0)
        expect(mod.__testing.getState().currentFurthestTime).toBe(150)
        expect(mod.__testing.getState().resumeReapplyId).toBeNull()
    })

    it('resumes when the metadata arrives, however late that is', async () => {
        setMedia(video, { duration: NaN, readyState: 0 })
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, duration: 300 }),
        )
        await start()
        // A tab that opens in the background loads its video much later.
        await vi.advanceTimersByTimeAsync(60_000)
        expect(video.currentTime).toBe(0)
        expect(mod.__testing.getState().resumePending).toBe(true)

        setMedia(video, { duration: 300, readyState: 1, paused: false })
        video.dispatchEvent(new Event('loadedmetadata'))
        expect(video.currentTime).toBe(120)
        expect(mod.__testing.getState().saveIntervalId).not.toBeNull()
    })

    it('resumes one time only for each video', async () => {
        setMedia(video, { duration: 300 })
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, duration: 300 }),
        )
        await start()
        expect(video.currentTime).toBe(120)

        // The player loads the video again, for example after an error.
        vi.advanceTimersByTime(500)
        video.currentTime = 0
        video.dispatchEvent(new Event('loadedmetadata'))
        vi.advanceTimersByTime(500)
        expect(video.currentTime).toBe(0)
    })

    it('does not resume into an ad or save its time as progress', async () => {
        youtubeMocks.isAdShowing.mockReturnValue(true)
        setMedia(video, { currentTime: 4, duration: 15, paused: false })
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, ft: 130, duration: 300 }),
        )
        await start()
        expect(video.currentTime).toBe(4)

        video.dispatchEvent(new Event('pause'))
        await vi.advanceTimersByTimeAsync(8000)
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        // The video loads in the same element when the ad ends.
        youtubeMocks.isAdShowing.mockReturnValue(false)
        setMedia(video, { currentTime: 0, duration: 300 })
        video.dispatchEvent(new Event('loadedmetadata'))
        expect(video.currentTime).toBe(120)
    })

    it('does not resume into an ad that the player has not marked yet', async () => {
        setMedia(video, { duration: 15 })
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, duration: 300 }),
        )
        await start()
        expect(video.currentTime).toBe(0)
        expect(mod.__testing.getState().resumePending).toBe(true)

        setMedia(video, { duration: 300.4 })
        video.dispatchEvent(new Event('loadedmetadata'))
        expect(video.currentTime).toBe(120)
    })

    it('does not seek after it saved progress for a video with a new length', async () => {
        setMedia(video, { duration: 280 })
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, duration: 300 }),
        )
        await start()
        expect(mod.__testing.getState().resumePending).toBe(true)

        video.currentTime = 3
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).toHaveBeenCalledWith(
            'vid1',
            expect.objectContaining({ t: 3, duration: 280 }),
        )
        video.dispatchEvent(new Event('loadedmetadata'))
        expect(video.currentTime).toBe(3)
    })

    it('allows only one save while storage is pending', async () => {
        setMedia(video, { currentTime: 42 })
        await start()
        await Promise.all([mod.saveNow('pause'), mod.saveNow('hidden')])
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)
    })

    it('catches storage failures and permits the next save to retry', async () => {
        setMedia(video, { currentTime: 42 })
        await start()
        storageMocks.setVideoState.mockRejectedValueOnce(
            new Error('storage unavailable'),
        )
        await expect(mod.saveNow('pause')).resolves.toBeUndefined()
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(2)
    })

    it('keeps furthest progress when tracking is enabled after initialization', async () => {
        settings = { enabled: false, ignoredChannels: [] }
        setMedia(video, { duration: 300 })
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, ft: 150, duration: 300 }),
        )
        await start()
        video.currentTime = 42
        reportSettings({ enabled: true, ignoredChannels: [] })
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).toHaveBeenCalledWith(
            'vid1',
            expect.objectContaining({ t: 42, ft: 150 }),
        )
    })

    it('does not resume after a URL change while storage is pending', async () => {
        setMedia(video, { duration: 300 })
        const state = deferred<StoredVideoState | null>()
        storageMocks.getVideoState.mockReturnValueOnce(state.promise)
        await start()
        youtubeMocks.getVideoId.mockReturnValue('vid2')
        mod.handleUrlChange()
        state.resolve(storedState({ t: 120, ft: 130, duration: 300 }))
        await vi.advanceTimersByTimeAsync(0)
        expect(video.currentTime).toBe(0)
        expect(mod.__testing.getState().resumeReapplyId).toBeNull()
        expect(mod.__testing.getState().activeVideoId).toBe('vid2')
    })

    it.each<[string, Partial<StoredVideoState>, Media]>([
        ['a short stored time', { t: MIN_RESUME_SECONDS - 1 }, {}],
        [
            'a player past the start',
            {},
            { currentTime: NEAR_START_WINDOW_SECONDS + 1 },
        ],
        ['a finished video', { t: 195, ft: 195 }, {}],
    ])('does not resume for %s', async (_name, state, media) => {
        setMedia(video, { duration: 200, ...media })
        const before = video.currentTime
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 50, ft: 60, duration: 200, ...state }),
        )
        await start()
        expect(video.currentTime).toBe(before)
        expect(mod.__testing.getState().resumeReapplyId).toBeNull()
        expect(mod.__testing.getState().currentFurthestTime).toBe(
            state.ft ?? 60,
        )
    })

    it('does not resume a live video or a video with no stored state', async () => {
        youtubeMocks.isLiveVideo.mockReturnValue(true)
        storageMocks.getVideoState.mockResolvedValue(storedState({ t: 50 }))
        await start()
        expect(video.currentTime).toBe(0)
        mod.__testing.resetForTests()

        youtubeMocks.isLiveVideo.mockReturnValue(false)
        storageMocks.getVideoState.mockResolvedValue(null)
        await start()
        expect(video.currentTime).toBe(0)
        expect(mod.__testing.getState().currentFurthestTime).toBe(0)
        expect(mod.__testing.getState().resumePending).toBe(false)
    })

    it('uses defaults for missing title/channel and handles infinite duration', async () => {
        setMedia(video, { currentTime: 12, duration: Infinity })
        youtubeMocks.getVideoTitle.mockReturnValue(null)
        youtubeMocks.getChannelName.mockReturnValue(null)
        await start()
        await mod.saveNow('test')
        const [, payload] = storageMocks.setVideoState.mock.calls[0]
        expect(payload.title).toBe('Untitled video')
        expect(payload.channel).toBe('Unknown channel')
        expect(payload.duration).toBe(Infinity)
    })

    it('starts and stops the save loop with the main video only', async () => {
        setMedia(video, { currentTime: 22 })
        await start()
        expect(mod.__testing.getState().saveIntervalId).toBeNull()

        const preview = makeVideo()
        preview.dispatchEvent(new Event('play'))
        expect(mod.__testing.getState().saveIntervalId).toBeNull()

        video.dispatchEvent(new Event('play'))
        expect(mod.__testing.getState().saveIntervalId).not.toBeNull()
        await vi.advanceTimersByTimeAsync(8000)
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)

        preview.dispatchEvent(new Event('pause'))
        expect(mod.__testing.getState().saveIntervalId).not.toBeNull()

        await vi.advanceTimersByTimeAsync(2000)
        video.currentTime = 30
        video.dispatchEvent(new Event('pause'))
        expect(mod.__testing.getState().saveIntervalId).toBeNull()
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(2)
    })

    it('starts the save loop for a video that already plays', async () => {
        setMedia(video, { currentTime: 22, paused: false })
        await start()
        expect(mod.__testing.getState().saveIntervalId).not.toBeNull()
    })

    it('does not run the save loop when no video is active', async () => {
        youtubeMocks.getVideoId.mockReturnValue(null)
        setMedia(video, { paused: false })
        await start()
        video.dispatchEvent(new Event('play'))
        expect(mod.__testing.getState().saveIntervalId).toBeNull()
        expect(storageMocks.getVideoState).not.toHaveBeenCalled()
    })

    it('keeps saving while the video plays in a hidden tab', async () => {
        setMedia(video, { currentTime: 22 })
        await start()
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

        video.dispatchEvent(new Event('play'))
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(0)
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)
        expect(mod.__testing.getState().saveIntervalId).not.toBeNull()

        video.currentTime = 30
        await vi.advanceTimersByTimeAsync(8000)
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(2)
        expect(storageMocks.setVideoState.mock.calls[1][1].t).toBe(30)
        hidden.mockRestore()
    })

    it('saves the video the user leaves, then waits for the next video to load', async () => {
        setMedia(video, { currentTime: 80, paused: false })
        await start()
        storageMocks.getVideoState.mockResolvedValue(
            storedState({ t: 120, ft: 120, duration: 300 }),
        )

        // YouTube changes the URL first. The player still holds the old video.
        youtubeMocks.getVideoId.mockReturnValue('vid2')
        window.dispatchEvent(new Event('yt-navigate-start'))
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)
        expect(storageMocks.setVideoState).toHaveBeenCalledWith(
            'vid1',
            expect.objectContaining({ t: 80, duration: 100 }),
        )
        await vi.advanceTimersByTimeAsync(0)
        expect(mod.__testing.getState().activeVideoId).toBe('vid2')
        expect(video.currentTime).toBe(80)

        video.dispatchEvent(new Event('pause'))
        await vi.advanceTimersByTimeAsync(8000)
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)

        setMedia(video, { currentTime: 0, duration: 300 })
        video.dispatchEvent(new Event('loadedmetadata'))
        expect(video.currentTime).toBe(120)
        video.currentTime = 125
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).toHaveBeenLastCalledWith(
            'vid2',
            expect.objectContaining({ t: 125, duration: 300 }),
        )
    })

    it('finds a URL change when the next video loads with no navigation event', async () => {
        await start()
        youtubeMocks.getVideoId.mockReturnValue('vid2')
        setMedia(video, { currentTime: 12, duration: 300 })
        video.dispatchEvent(new Event('loadedmetadata'))
        await vi.advanceTimersByTimeAsync(0)
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).toHaveBeenCalledWith(
            'vid2',
            expect.objectContaining({ t: 12, duration: 300 }),
        )
    })

    it('trusts a player that continues the same video across pages', async () => {
        setMedia(video, { currentTime: 40, paused: false })
        await start()

        // The miniplayer continues the video on a page that is not a watch page.
        youtubeMocks.getVideoId.mockReturnValue(null)
        window.dispatchEvent(new Event('yt-navigate-start'))
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)
        const [, saved] = storageMocks.setVideoState.mock.calls[0]
        storageMocks.getVideoState.mockResolvedValue(saved)
        expect(mod.__testing.getState().saveIntervalId).toBeNull()

        youtubeMocks.getVideoId.mockReturnValue('vid1')
        window.dispatchEvent(new Event('yt-navigate-finish'))
        await vi.advanceTimersByTimeAsync(0)
        expect(video.currentTime).toBe(40)
        expect(mod.__testing.getState().saveIntervalId).not.toBeNull()

        video.currentTime = 55
        await vi.advanceTimersByTimeAsync(8000)
        expect(storageMocks.setVideoState).toHaveBeenLastCalledWith(
            'vid1',
            expect.objectContaining({ t: 55, ft: 55 }),
        )
    })

    it('follows history navigation', async () => {
        await start()
        youtubeMocks.getVideoId.mockReturnValue('vid2')
        window.dispatchEvent(new PopStateEvent('popstate'))
        expect(mod.__testing.getState().activeVideoId).toBe('vid2')
        expect(mod.__testing.getState().mediaFresh).toBe(false)
        expect(storageMocks.getVideoState).toHaveBeenLastCalledWith('vid2')
    })

    it('initializes one time and removes its listeners on reset', async () => {
        await start()
        mod.initContentScript()
        expect(storageMocks.watchTrackingSettings).toHaveBeenCalledTimes(1)
        mod.__testing.resetForTests()
        video.dispatchEvent(new Event('play'))
        expect(mod.__testing.getState().saveIntervalId).toBeNull()
    })
})
