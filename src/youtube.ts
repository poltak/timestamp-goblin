export function getThumbnailUrl(videoId: string): string {
    return `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`
}

export function isWatchPage(): boolean {
    return location.pathname === '/watch'
}

export function getVideoId(): string | null {
    if (!isWatchPage()) {
        return null
    }
    const params = new URLSearchParams(location.search)
    return params.get('v')
}

export function isLiveVideo(video: HTMLVideoElement): boolean {
    return video.duration === Infinity
}

export function clampResumeTarget(t: number, duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) {
        return t
    }
    const maxTarget = Math.max(0, duration - 0.5)
    return Math.min(Math.max(0, t), maxTarget)
}

function pickText(selectors: string[]): string | null {
    for (const selector of selectors) {
        const el = document.querySelector(selector)
        if (el && el.textContent) {
            const text = el.textContent.trim()
            if (text) {
                return text
            }
        }
    }
    return null
}

export function getVideoTitle(): string | null {
    const title = pickText([
        'h1.title yt-formatted-string',
        'h1.ytd-watch-metadata yt-formatted-string',
        'h1.title',
    ])
    if (title) {
        return title
    }
    const raw = document.title
    if (!raw) {
        return null
    }
    return raw.replace(/\s+-\s+YouTube\s*$/, '').trim() ?? null
}

export function getChannelName(): string | null {
    return pickText([
        'ytd-channel-name a',
        '#owner-name a',
        '#text-container.ytd-channel-name',
        'ytd-video-owner-renderer a',
    ])
}

type WaitHandle = {
    promise: Promise<HTMLVideoElement>
    cancel: () => void
}

export function waitForVideoElement(timeoutMs = 15000): WaitHandle {
    let cancel = () => {}
    const promise = new Promise<HTMLVideoElement>((resolve, reject) => {
        let observer: MutationObserver | null = null
        let timeoutId: number | null = null
        let video: HTMLVideoElement | null = null
        let settled = false

        const finish = (error?: Error) => {
            if (settled) return
            settled = true
            observer?.disconnect()
            if (timeoutId !== null) window.clearTimeout(timeoutId)
            video?.removeEventListener('loadedmetadata', onReady)
            if (error) reject(error)
            else resolve(video!)
        }
        const onReady = () => {
            if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA)
                finish()
        }
        const findVideo = () => {
            const found = document.querySelector<HTMLVideoElement>('video')
            if (found !== video) {
                video?.removeEventListener('loadedmetadata', onReady)
                video = found
                video?.addEventListener('loadedmetadata', onReady)
            }
            onReady()
        }

        cancel = () => finish(new Error('cancelled waiting for video'))
        findVideo()
        if (settled) return
        if (!document.body) {
            finish(new Error('document.body missing'))
            return
        }

        observer = new MutationObserver(findVideo)
        observer.observe(document.body, { childList: true, subtree: true })
        timeoutId = window.setTimeout(() => {
            finish(new Error('timeout waiting for video'))
        }, timeoutMs)
    })

    return { promise, cancel }
}
