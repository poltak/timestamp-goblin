import { describe, expect, it } from 'vitest'
import {
    clampResumeTarget,
    getChannelName,
    getMainVideo,
    getThumbnailUrl,
    getVideoId,
    getVideoTitle,
    hasExplicitStartTime,
    isLiveVideo,
    isWatchPage,
} from '../src/youtube'

describe('youtube helpers', () => {
    it('builds thumbnail URL', () => {
        expect(getThumbnailUrl('abc')).toBe(
            'https://img.youtube.com/vi/abc/mqdefault.jpg',
        )
        expect(getThumbnailUrl('a/b"c')).toBe(
            'https://img.youtube.com/vi/a%2Fb%22c/mqdefault.jpg',
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

    it.each(['?v=abc&t=0', '?v=abc&t=1h2m', '?v=abc&start=60', '?v=abc#t=30s'])(
        'detects an explicit timestamp in %s',
        (suffix) => {
            history.replaceState({}, '', `/watch${suffix}`)
            expect(hasExplicitStartTime()).toBe(true)
        },
    )

    it('allows resume for links without a timestamp', () => {
        history.replaceState({}, '', '/watch?v=abc')
        expect(hasExplicitStartTime()).toBe(false)
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
        const loadingVod = document.createElement('video')
        Object.defineProperty(loadingVod, 'duration', { value: 120 })
        expect(isLiveVideo(loadingVod)).toBe(false)
    })

    it('clamps resume target', () => {
        expect(clampResumeTarget(10, 100)).toBe(10)
        expect(clampResumeTarget(150, 100)).toBeCloseTo(99.5)
        expect(clampResumeTarget(-5, 100)).toBe(0)
        expect(clampResumeTarget(10, Infinity)).toBe(10)
        expect(clampResumeTarget(10, 0.75)).toBe(0.25)
    })

    it('finds title and channel', () => {
        document.body.innerHTML = `
      <h1 class="title"><yt-formatted-string>Video Title</yt-formatted-string></h1>
      <ytd-video-owner-renderer><ytd-channel-name><a>Channel Name</a></ytd-channel-name></ytd-video-owner-renderer>
    `
        expect(getVideoTitle()).toBe('Video Title')
        expect(getChannelName()).toBe('Channel Name')
    })

    it('falls back to document title', () => {
        document.body.innerHTML = ''
        document.title = 'Cool Video - YouTube'
        expect(getVideoTitle()).toBe('Cool Video')
        document.title = ' - YouTube'
        expect(getVideoTitle()).toBeNull()
    })

    it('gets the owner channel instead of a recommended channel', () => {
        document.body.innerHTML = `
            <ytd-channel-name><a>Recommendation</a></ytd-channel-name>
            <ytd-video-owner-renderer>
                <a aria-label="Avatar"></a>
                <ytd-channel-name><a>Video owner</a></ytd-channel-name>
            </ytd-video-owner-renderer>`
        expect(getChannelName()).toBe('Video owner')
        document.querySelector('ytd-video-owner-renderer')!.remove()
        expect(getChannelName()).toBeNull()
    })

    it('selects the watch player instead of an earlier preview', () => {
        const preview = document.createElement('video')
        const player = document.createElement('div')
        player.id = 'movie_player'
        const video = document.createElement('video')
        player.appendChild(video)
        document.body.replaceChildren(preview, player)
        expect(getMainVideo()).toBe(video)
    })

    it('finds the main video by its class, or reports that there is none', () => {
        document.body.replaceChildren()
        expect(getMainVideo()).toBeNull()
        const video = document.createElement('video')
        video.className = 'html5-main-video'
        document.body.replaceChildren(document.createElement('video'), video)
        expect(getMainVideo()).toBe(video)
    })
})
