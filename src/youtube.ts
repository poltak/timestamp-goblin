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

export function hasExplicitStartTime(): boolean {
    const params = new URLSearchParams(location.search)
    return (
        params.has('t') ||
        params.has('start') ||
        new URLSearchParams(location.hash.slice(1)).has('t')
    )
}

export function isLiveVideo(video: HTMLVideoElement): boolean {
    return video.duration === Infinity
}

/** Ads play in the main video element, so their time is not video progress. */
export function isAdShowing(): boolean {
    return (
        document.querySelector(
            '#movie_player.ad-showing, #movie_player.ad-interrupting',
        ) !== null
    )
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
    // Before the page data arrives, the document title is only the site name.
    const raw = document.title.replace(/(?:^|\s+)-\s+YouTube\s*$/, '').trim()
    return raw && raw !== 'YouTube' ? raw : null
}

export function getChannelName(): string | null {
    return pickText([
        'ytd-video-owner-renderer ytd-channel-name a',
        '#owner #channel-name a',
        '#owner-name a',
        'ytd-video-owner-renderer #text-container.ytd-channel-name',
    ])
}

/** The watch player, not a hover preview or another player on the page. */
export function getMainVideo(): HTMLVideoElement | null {
    return (
        document.querySelector<HTMLVideoElement>('#movie_player video') ??
        document.querySelector<HTMLVideoElement>('video.html5-main-video')
    )
}
