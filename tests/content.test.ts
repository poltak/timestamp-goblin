import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_RESUME_SECONDS, NEAR_START_WINDOW_SECONDS } from '../src/constants'
import { deferred } from './helpers'

const storageMocks = {
    getVideoState: vi.fn(async () => null),
    setVideoState: vi.fn(async () => {}),
    getIgnoredChannels: vi.fn(async () => []),
    normalizeChannelName: (value: string) => value.trim().toLowerCase(),
    getEnabled: vi.fn(async () => true),
}

const youtubeMocks = {
    clampResumeTarget: vi.fn((t: number, duration: number) =>
        Math.min(Math.max(t, 0), duration - 0.5),
    ),
    getChannelName: vi.fn(() => 'Channel'),
    getVideoId: vi.fn(() => 'vid1'),
    getVideoTitle: vi.fn(() => 'Title'),
    isLiveVideo: vi.fn(() => false),
    isWatchPage: vi.fn(() => true),
    waitForVideoElement: vi.fn(),
}

vi.mock('../src/storage', () => ({
    ...storageMocks,
    getTrackingSettings: async () => ({
        enabled: await storageMocks.getEnabled(),
        ignoredChannels: await storageMocks.getIgnoredChannels(),
    }),
}))
vi.mock('../src/youtube', () => youtubeMocks)
vi.mock('../src/spa', () => ({
    watchUrlChanges: vi.fn(() => vi.fn()),
}))
vi.mock('../src/util', () => ({ log: vi.fn() }))
vi.mock('../src/debounce', () => ({
    debounce: (fn: () => void) => Object.assign(fn, { cancel: vi.fn() }),
}))

describe('content script', () => {
    beforeEach(async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
        storageMocks.getVideoState.mockReset()
        storageMocks.setVideoState.mockReset()
        storageMocks.getIgnoredChannels.mockReset()
        storageMocks.getIgnoredChannels.mockResolvedValue([])
        storageMocks.getEnabled.mockReset()
        storageMocks.getEnabled.mockResolvedValue(true)
        youtubeMocks.isWatchPage.mockReturnValue(true)
        youtubeMocks.getVideoId.mockReturnValue('vid1')
        youtubeMocks.isLiveVideo.mockReturnValue(false)
        youtubeMocks.getVideoTitle.mockReturnValue('Title')
        youtubeMocks.getChannelName.mockReturnValue('Channel')
        youtubeMocks.waitForVideoElement.mockReset()
        vi.resetModules()
        const mod = await import('../src/content')
        mod.__testing.resetForTests()
    })

    it('saves video state when safe', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', {
            value: 42,
            writable: true,
        })
        Object.defineProperty(video, 'duration', { value: 100 })

        mod.__testing.setActive('vid1', video)
        await mod.saveNow('test')

        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)
        const [videoId, payload] = storageMocks.setVideoState.mock.calls[0]
        expect(videoId).toBe('vid1')
        expect(payload.t).toBe(42)
        expect(payload.ft).toBe(42)
        expect(payload.title).toBe('Title')
        expect(payload.channel).toBe('Channel')
    })

    it('skips saving and resuming for ignored channels', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', {
            value: 42,
            writable: true,
        })
        Object.defineProperty(video, 'duration', { value: 100 })

        storageMocks.getIgnoredChannels.mockResolvedValue(['channel'])
        youtubeMocks.getChannelName.mockReturnValue('Channel')
        mod.__testing.setActive('vid1', video)
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        storageMocks.getVideoState.mockResolvedValue({
            t: 50,
            ft: 60,
            updatedAt: 1,
            duration: 100,
            title: 'Title',
            channel: 'Channel',
        })
        await mod.tryResume(video, 'vid1', mod.__testing.getState().initToken)
        expect(video.currentTime).toBe(42)
    })

    it('skips saving and resuming when disabled', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', {
            value: 42,
            writable: true,
        })
        Object.defineProperty(video, 'duration', { value: 100 })

        storageMocks.getEnabled.mockResolvedValue(false)
        mod.__testing.setActive('vid1', video)
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        storageMocks.getVideoState.mockResolvedValue({
            t: 50,
            ft: 60,
            updatedAt: 1,
            duration: 100,
            title: 'Title',
            channel: 'Channel',
        })
        await mod.tryResume(video, 'vid1', mod.__testing.getState().initToken)
        expect(video.currentTime).toBe(42)
    })

    it('skips saving when conditions fail', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', {
            value: 0,
            writable: true,
        })
        Object.defineProperty(video, 'duration', { value: 100 })

        mod.__testing.setActive('vid1', video)
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        youtubeMocks.isWatchPage.mockReturnValue(false)
        Object.defineProperty(video, 'currentTime', {
            value: 10,
            writable: true,
        })
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()
    })

    it('respects minimum write gap', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', {
            value: 10,
            writable: true,
        })
        Object.defineProperty(video, 'duration', { value: 100 })
        mod.__testing.setActive('vid1', video)
        mod.__testing.setLastWriteAt(Date.now())

        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()
    })

    it('resumes to saved position and reapplies if needed', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', {
            value: 0,
            writable: true,
        })
        Object.defineProperty(video, 'duration', { value: 200 })

        storageMocks.getVideoState.mockResolvedValue({
            t: 120,
            ft: 130,
            updatedAt: 1,
            duration: 200,
            title: 'Title',
            channel: 'Channel',
        })

        mod.__testing.setActive('vid1', video)
        mod.__testing.setInitToken(5)
        await mod.tryResume(video, 'vid1', 5)
        expect(video.currentTime).toBeCloseTo(120)
        const state = mod.__testing.getState()
        expect(state.currentFurthestTime).toBe(130)

        video.currentTime = 0
        vi.advanceTimersByTime(500)
        expect(video.currentTime).toBeCloseTo(120)
    })

    it('does not overwrite a user seek during resume reapply', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'duration', { value: 300 })
        storageMocks.getVideoState.mockResolvedValue({
            t: 120,
            ft: 130,
            updatedAt: 1,
            duration: 300,
            title: 'Title',
            channel: 'Channel',
        })
        mod.__testing.setActive('vid1', video)
        await mod.tryResume(video, 'vid1', mod.__testing.getState().initToken)
        video.currentTime = 200
        vi.advanceTimersByTime(500)
        expect(video.currentTime).toBe(200)
    })

    it('allows only one save while storage is pending', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        video.currentTime = 42
        mod.__testing.setActive('vid1', video)
        await Promise.all([mod.saveNow('pause'), mod.saveNow('hidden')])
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(1)
    })

    it('discards a save when navigation changes during a settings read', async () => {
        const mod = await import('../src/content')
        const settings = deferred<boolean>()
        storageMocks.getEnabled.mockReturnValueOnce(settings.promise)
        const video = document.createElement('video')
        video.currentTime = 42
        mod.__testing.setActive('vid1', video)
        const saving = mod.saveNow('pause')
        mod.teardown()
        mod.__testing.setActive('vid2', video)
        youtubeMocks.getVideoId.mockReturnValue('vid2')
        video.currentTime = 90
        settings.resolve(true)
        await saving
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()
        expect(mod.__testing.getState().currentFurthestTime).toBe(0)
    })

    it('catches storage failures and permits the next save to retry', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        video.currentTime = 42
        mod.__testing.setActive('vid1', video)
        storageMocks.setVideoState.mockRejectedValueOnce(
            new Error('storage unavailable'),
        )
        await expect(mod.saveNow('pause')).resolves.toBeUndefined()
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).toHaveBeenCalledTimes(2)
    })

    it('keeps furthest progress when tracking is enabled after initialization', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        video.currentTime = 42
        mod.__testing.setActive('vid1', video)
        storageMocks.getEnabled.mockResolvedValue(false)
        storageMocks.getVideoState.mockResolvedValue({
            t: 120,
            ft: 150,
            updatedAt: 1,
            duration: 300,
            title: 'Title',
            channel: 'Channel',
        })
        await mod.tryResume(video, 'vid1', mod.__testing.getState().initToken)
        storageMocks.getEnabled.mockResolvedValue(true)
        await mod.saveNow('pause')
        expect(storageMocks.setVideoState).toHaveBeenCalledWith(
            'vid1',
            expect.objectContaining({ t: 42, ft: 150 }),
        )
    })

    it('does not resume after a URL change while storage is pending', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'duration', { value: 300 })
        mod.__testing.setActive('vid1', video)
        const state = deferred<import('../src/types').StoredVideoState>()
        storageMocks.getVideoState.mockReturnValueOnce(state.promise)
        const resuming = mod.tryResume(
            video,
            'vid1',
            mod.__testing.getState().initToken,
        )
        youtubeMocks.getVideoId.mockReturnValue('vid2')
        state.resolve({
            t: 120,
            ft: 130,
            updatedAt: 1,
            duration: 300,
            title: 'Title',
            channel: 'Channel',
        })
        await resuming
        expect(video.currentTime).toBe(0)
        expect(mod.__testing.getState().resumeReapplyId).toBeNull()
    })

    it('does not resume when guards fail', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', {
            value: 10,
            writable: true,
        })
        Object.defineProperty(video, 'duration', { value: 200 })

        storageMocks.getVideoState.mockResolvedValue({
            t: MIN_RESUME_SECONDS - 1,
            ft: 20,
            updatedAt: 1,
            duration: 200,
            title: 'Title',
            channel: 'Channel',
        })
        await mod.tryResume(video, 'vid1', mod.__testing.getState().initToken)
        expect(video.currentTime).toBe(10)

        youtubeMocks.isLiveVideo.mockReturnValue(true)
        storageMocks.getVideoState.mockResolvedValue({
            t: MIN_RESUME_SECONDS + 10,
            ft: 20,
            updatedAt: 1,
            duration: 200,
            title: 'Title',
            channel: 'Channel',
        })
        await mod.tryResume(video, 'vid1', mod.__testing.getState().initToken)
        expect(video.currentTime).toBe(10)

        youtubeMocks.isLiveVideo.mockReturnValue(false)
        Object.defineProperty(video, 'currentTime', {
            value: NEAR_START_WINDOW_SECONDS + 1,
            writable: true,
        })
        storageMocks.getVideoState.mockResolvedValue({
            t: MIN_RESUME_SECONDS + 10,
            ft: 20,
            updatedAt: 1,
            duration: 200,
            title: 'Title',
            channel: 'Channel',
        })
        await mod.tryResume(video, 'vid1', mod.__testing.getState().initToken)
        expect(video.currentTime).toBe(NEAR_START_WINDOW_SECONDS + 1)

        storageMocks.getVideoState.mockResolvedValue(null)
        await mod.tryResume(video, 'vid1', mod.__testing.getState().initToken)
        expect(mod.__testing.getState().currentFurthestTime).toBe(0)
    })

    it('uses defaults for missing title/channel and handles infinite duration', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', {
            value: 12,
            writable: true,
        })
        Object.defineProperty(video, 'duration', { value: Infinity })
        youtubeMocks.getVideoTitle.mockReturnValue(null)
        youtubeMocks.getChannelName.mockReturnValue(null)

        mod.__testing.setActive('vid1', video)
        await mod.saveNow('test')
        const [, payload] = storageMocks.setVideoState.mock.calls[0]
        expect(payload.title).toBe('Untitled video')
        expect(payload.channel).toBe('Unknown channel')
        expect(payload.duration).toBe(Infinity)
    })

    it('initializes when video element is found', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'paused', { value: false })
        youtubeMocks.waitForVideoElement.mockReturnValue({
            promise: Promise.resolve(video),
            cancel: vi.fn(),
        })

        const addSpy = vi.spyOn(video, 'addEventListener')
        await mod.initForVideo('vid1')
        expect(addSpy).toHaveBeenCalled()
        const state = mod.__testing.getState()
        expect(state.saveIntervalId).not.toBeNull()
    })

    it('saves on interval loop', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', {
            value: 22,
            writable: true,
        })
        Object.defineProperty(video, 'duration', { value: 100 })
        mod.__testing.setActive('vid1', video)

        mod.startSavingLoop()
        await vi.advanceTimersByTimeAsync(8000)
        expect(storageMocks.setVideoState).toHaveBeenCalled()
    })

    it('keeps the new wait handle when an older initialization finishes', async () => {
        const mod = await import('../src/content')
        const first = deferred<HTMLVideoElement>()
        const second = deferred<HTMLVideoElement>()
        const firstHandle = {
            promise: first.promise,
            cancel: vi.fn(() => first.reject(new Error('cancelled'))),
        }
        const secondHandle = {
            promise: second.promise,
            cancel: vi.fn(() => second.reject(new Error('cancelled'))),
        }
        youtubeMocks.waitForVideoElement
            .mockReturnValueOnce(firstHandle)
            .mockReturnValueOnce(secondHandle)
        const init1 = mod.initForVideo('vid1')
        mod.teardown()
        const init2 = mod.initForVideo('vid2')
        await init1
        expect(mod.__testing.getState().waitHandle).toBe(secondHandle)
        mod.teardown()
        expect(secondHandle.cancel).toHaveBeenCalledTimes(1)
        await init2
    })
})
