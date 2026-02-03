import { describe, expect, it, vi } from 'vitest'
import {
    clampResumeTarget,
    getChannelName,
    getThumbnailUrl,
    getVideoId,
    getVideoTitle,
    isLiveVideo,
    isWatchPage,
    waitForVideoElement,
} from '../src/youtube'

describe('youtube helpers', () => {
    it('builds thumbnail URL', () => {
        expect(getThumbnailUrl('abc')).toBe(
            'https://img.youtube.com/vi/abc/mqdefault.jpg',
        )
    })

    it('detects watch page and video id', () => {
        window.history.pushState({}, '', '/watch?v=xyz')
        expect(isWatchPage()).toBe(true)
        expect(getVideoId()).toBe('xyz')

        window.history.pushState({}, '', '/results')
        expect(isWatchPage()).toBe(false)
        expect(getVideoId()).toBeNull()
    })

    it('detects live videos', () => {
        const live = document.createElement('video')
        Object.defineProperty(live, 'duration', { value: Infinity })
        Object.defineProperty(live, 'seekable', {
            value: { length: 0 },
        })
        expect(isLiveVideo(live)).toBe(true)

        const vod = document.createElement('video')
        Object.defineProperty(vod, 'duration', { value: 120 })
        Object.defineProperty(vod, 'seekable', { value: { length: 1 } })
        expect(isLiveVideo(vod)).toBe(false)
    })

    it('clamps resume target', () => {
        expect(clampResumeTarget(10, 100)).toBe(10)
        expect(clampResumeTarget(150, 100)).toBeCloseTo(99.5)
        expect(clampResumeTarget(-5, 100)).toBe(0)
        expect(clampResumeTarget(10, Infinity)).toBe(10)
    })

    it('finds title and channel', () => {
        document.body.innerHTML = `
      <h1 class="title"><yt-formatted-string>Video Title</yt-formatted-string></h1>
      <ytd-channel-name><a>Channel Name</a></ytd-channel-name>
    `
        expect(getVideoTitle()).toBe('Video Title')
        expect(getChannelName()).toBe('Channel Name')
    })

    it('falls back to document title', () => {
        document.body.innerHTML = ''
        document.title = 'Cool Video - YouTube'
        expect(getVideoTitle()).toBe('Cool Video')
    })

    it('waits for video element and can cancel', async () => {
        vi.useFakeTimers()
        document.body.innerHTML = ''

        const handle = waitForVideoElement(1000)
        const promise = handle.promise

        const video = document.createElement('video')
        document.body.appendChild(video)
        await Promise.resolve()
        await expect(promise).resolves.toBe(video)

        document.body.innerHTML = ''
        const handle2 = waitForVideoElement(1000)
        handle2.cancel()
        let resolved = false
        handle2.promise.then(() => {
            resolved = true
        })
        const laterVideo = document.createElement('video')
        document.body.appendChild(laterVideo)
        await Promise.resolve()
        vi.runAllTimers()
        expect(resolved).toBe(false)
    })

    it('times out waiting for video', async () => {
        vi.useFakeTimers()
        document.body.innerHTML = ''
        const handle = waitForVideoElement(10)
        vi.advanceTimersByTime(11)
        await expect(handle.promise).rejects.toThrow('timeout waiting for video')
    })
})
