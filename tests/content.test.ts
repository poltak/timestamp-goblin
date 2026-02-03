import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_RESUME_SECONDS, NEAR_START_WINDOW_SECONDS } from '../src/constants'

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

vi.mock('../src/storage', () => storageMocks)
vi.mock('../src/youtube', () => youtubeMocks)
vi.mock('../src/spa', () => ({
    watchUrlChanges: vi.fn(() => vi.fn()),
}))
vi.mock('../src/util', () => ({ log: vi.fn() }))
vi.mock('../src/debounce', () => ({ debounce: (fn: () => void) => fn }))

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
        Object.defineProperty(video, 'currentTime', { value: 42, writable: true })
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
        Object.defineProperty(video, 'currentTime', { value: 42, writable: true })
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
        Object.defineProperty(video, 'currentTime', { value: 42, writable: true })
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
        Object.defineProperty(video, 'currentTime', { value: 0, writable: true })
        Object.defineProperty(video, 'duration', { value: 100 })

        mod.__testing.setActive('vid1', video)
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()

        youtubeMocks.isWatchPage.mockReturnValue(false)
        Object.defineProperty(video, 'currentTime', { value: 10, writable: true })
        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()
    })

    it('respects minimum write gap', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', { value: 10, writable: true })
        Object.defineProperty(video, 'duration', { value: 100 })
        mod.__testing.setActive('vid1', video)
        mod.__testing.setLastWriteAt(Date.now())

        await mod.saveNow('test')
        expect(storageMocks.setVideoState).not.toHaveBeenCalled()
    })

    it('resumes to saved position and reapplies if needed', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', { value: 0, writable: true })
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

        video.currentTime = 200
        vi.advanceTimersByTime(500)
        expect(video.currentTime).toBeCloseTo(120)
    })

    it('does not resume when guards fail', async () => {
        const mod = await import('../src/content')
        const video = document.createElement('video')
        Object.defineProperty(video, 'currentTime', { value: 10, writable: true })
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
        Object.defineProperty(video, 'currentTime', { value: 12, writable: true })
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
        Object.defineProperty(video, 'currentTime', { value: 22, writable: true })
        Object.defineProperty(video, 'duration', { value: 100 })
        mod.__testing.setActive('vid1', video)

        mod.startSavingLoop()
        await vi.advanceTimersByTimeAsync(8000)
        expect(storageMocks.setVideoState).toHaveBeenCalled()
    })
})
