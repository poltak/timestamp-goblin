import {
    addIgnoredChannel,
    deleteVideoState,
    getPopupData,
    normalizeChannelName,
    removeIgnoredChannel,
    setEnabled,
} from './storage'
import type { StoredVideoState, VideoItem } from './types'
import {
    DEFAULT_UNFINISHED_BUFFER_SECONDS,
    DEFAULT_CHANNEL_NAME,
    DEFAULT_VIDEO_TITLE,
    MAX_POPUP_ITEMS,
    MIN_RESUME_SECONDS,
} from './constants'
import { buildVideoSearchIndex, findVideoIds } from './search'
import { getThumbnailUrl } from './youtube'
import type { VideoSearchIndex } from './search'

type Tab = 'unfinished' | 'unwatched' | 'finished'

let currentTab: Tab = 'unfinished'
let videosByTab: Record<Tab, VideoItem[]> = {
    unfinished: [],
    unwatched: [],
    finished: [],
}
let ignoredChannels: string[] = []
let enabled = true
let searchQuery = ''
let videoSearchIndex: VideoSearchIndex | null = null
let settingsOpen = false
let renderedItems: VideoItem[] = []

function categorizeVideo(state: StoredVideoState): Tab {
    if (!Number.isFinite(state.duration)) {
        return 'unwatched'
    }

    if (state.t < MIN_RESUME_SECONDS) {
        return 'unwatched'
    }

    if (state.t >= state.duration - DEFAULT_UNFINISHED_BUFFER_SECONDS) {
        return 'finished'
    }

    return 'unfinished'
}

function formatPercent(time: number, duration: number): string {
    if (!Number.isFinite(duration) || duration <= 0) {
        return '--%'
    }
    const pct = Math.min(100, Math.max(0, Math.round((time / duration) * 100)))
    return `${pct}%`
}

function openVideo(videoId: string, time?: number): void {
    let url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    if (typeof time === 'number' && time > 0) {
        url += `&t=${Math.floor(time)}s`
    }
    window.open(url, '_blank')
}

function render(): void {
    const root = document.getElementById('list')
    const empty = document.getElementById('empty')
    const videoView = document.getElementById('video-view')
    const settingsView = document.getElementById('settings-view')
    const settingsToggle = document.getElementById('settings-toggle')
    const searchInput = document.getElementById(
        'video-search',
    ) as HTMLInputElement | null
    const enabledToggle = document.getElementById(
        'toggle-enabled',
    ) as HTMLInputElement | null
    if (!root || !empty) {
        return
    }

    if (enabledToggle) {
        enabledToggle.checked = enabled
    }
    if (searchInput && searchInput.value !== searchQuery) {
        searchInput.value = searchQuery
    }
    document.body.classList.toggle('is-disabled', !enabled)

    videoView?.classList.toggle('hidden', settingsOpen)
    settingsView?.classList.toggle('hidden', !settingsOpen)
    settingsToggle?.classList.toggle('active', settingsOpen)
    settingsToggle?.setAttribute('aria-pressed', String(settingsOpen))
    videoView?.setAttribute('aria-hidden', String(settingsOpen))
    settingsView?.setAttribute('aria-hidden', String(!settingsOpen))

    const normalizedSearchQuery = searchQuery.trim()
    const matchingVideoIds =
        normalizedSearchQuery && videoSearchIndex
            ? findVideoIds(videoSearchIndex, normalizedSearchQuery)
            : null
    const items: VideoItem[] = []
    for (const video of videosByTab[currentTab]) {
        if (normalizedSearchQuery && !matchingVideoIds?.has(video.videoId))
            continue
        items.push(video)
        if (items.length === MAX_POPUP_ITEMS) break
    }

    document.querySelectorAll('.tab-btn').forEach((btn) => {
        const tab = (btn as HTMLElement).dataset.tab as Tab
        if (!settingsOpen && tab === currentTab) {
            btn.classList.add('active')
        } else {
            btn.classList.remove('active')
        }

        let badge = btn.querySelector('.tab-count')
        const count = videosByTab[tab].length
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span')
                badge.className = 'tab-count'
                btn.appendChild(badge)
            }
            badge.textContent = count.toString()
        } else if (badge) {
            badge.remove()
        }
    })

    if (items.length === 0) {
        empty.classList.remove('hidden')
        empty.textContent = normalizedSearchQuery
            ? `No ${currentTab} videos match "${normalizedSearchQuery}".`
            : `No ${currentTab} videos yet.`
    } else {
        empty.classList.add('hidden')
    }

    if (
        items.length === renderedItems.length &&
        items.every((item, index) => item === renderedItems[index])
    )
        return
    renderedItems = items
    root.innerHTML = items
        .map((item) => {
            const title = item.title || DEFAULT_VIDEO_TITLE
            const channel = item.channel || DEFAULT_CHANNEL_NAME
            const lastPercent = formatPercent(item.t, item.duration)
            const furthestPercent = formatPercent(item.ft, item.duration)
            const thumb = escapeHtml(getThumbnailUrl(item.videoId))
            const videoId = escapeHtml(item.videoId)
            const canIgnore = channel !== DEFAULT_CHANNEL_NAME
            return `
        <div class="card" data-video-id="${videoId}" data-time="${item.t}">
          <div class="card-content">
            <div class="thumbnail">
              <img src="${thumb}" alt="" loading="lazy">
            </div>
            <div class="info">
              <div class="title">${escapeHtml(title)}</div>
              <div class="meta">
                <span class="channel">${escapeHtml(channel)}</span>
                <div class="percents">
                  <span class="percent last" title="Last watched">L: ${lastPercent}</span>
                  <span class="percent-sep">|</span>
                  <span class="percent furthest" title="Furthest watched">F: ${furthestPercent}</span>
                </div>
              </div>
              <div class="bar" title="Last: ${lastPercent}, Furthest: ${furthestPercent}">
                <div class="fill furthest" style="width: ${furthestPercent}"></div>
                <div class="fill last" style="width: ${lastPercent}"></div>
              </div>
            </div>
          </div>
          <div class="actions">
            <button class="action-btn last-btn" title="Watch from last watched time" data-video-id="${videoId}" data-time="${item.t}">
              <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
            <button class="action-btn furthest-btn" title="Watch from furthest watched time" data-video-id="${videoId}" data-time="${item.ft}">
              <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 19 22 12 13 5 13 19"></polygon>
                <polygon points="2 19 11 12 2 5 2 19"></polygon>
              </svg>
            </button>
            <button class="action-btn ignore-btn" title="Ignore channel" data-channel="${escapeHtml(channel)}" ${
                canIgnore ? '' : 'disabled'
            }>
              <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.9" y1="4.9" x2="19.1" y2="19.1"></line>
              </svg>
            </button>
            <button class="action-btn delete-btn" title="Remove from list" data-video-id="${videoId}">
              <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `
        })
        .join('')
}

function renderIgnoredChannels(): void {
    const ignoredRoot = document.getElementById('ignored-list')
    if (ignoredRoot) {
        if (ignoredChannels.length === 0) {
            ignoredRoot.innerHTML = `<div class="ignored-empty">None</div>`
        } else {
            ignoredRoot.innerHTML = ignoredChannels
                .slice()
                .sort()
                .map(
                    (channel) => `
            <span class="ignored-pill" data-channel="${escapeHtml(channel)}">
              <span class="ignored-name">${escapeHtml(channel)}</span>
              <button class="ignored-remove" title="Stop ignoring" data-channel="${escapeHtml(channel)}">×</button>
            </span>
          `,
                )
                .join('')
        }
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

async function refreshData(): Promise<void> {
    const data = await getPopupData()
    videoSearchIndex = buildVideoSearchIndex(data.videos)
    ignoredChannels = data.ignoredChannels
    enabled = data.enabled
    const ignoredSet = new Set(ignoredChannels)
    videosByTab = { unfinished: [], unwatched: [], finished: [] }
    for (const video of data.videos
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)) {
        if (
            !ignoredSet.has(
                normalizeChannelName(video.channel || DEFAULT_CHANNEL_NAME),
            )
        ) {
            videosByTab[categorizeVideo(video)].push(video)
        }
    }
    renderIgnoredChannels()
    render()
}

async function handleVideoClick(event: Event): Promise<void> {
    if (!(event.target instanceof Element)) return
    const card = event.target.closest<HTMLElement>('.card')
    const id = card?.dataset.videoId
    if (!id) return
    const button = event.target.closest<HTMLButtonElement>('.action-btn')
    if (button?.disabled) return
    if (button?.classList.contains('delete-btn')) {
        await deleteVideoState(id)
        await refreshData()
    } else if (button?.classList.contains('ignore-btn')) {
        const channel = button.dataset.channel
        if (channel) {
            await addIgnoredChannel(channel)
            await refreshData()
        }
    } else {
        openVideo(id, Number(button?.dataset.time ?? card?.dataset.time))
    }
}

async function handleIgnoredClick(event: Event): Promise<void> {
    if (!(event.target instanceof Element)) return
    const channel =
        event.target.closest<HTMLButtonElement>('.ignored-remove')?.dataset
            .channel
    if (channel) {
        await removeIgnoredChannel(channel)
        await refreshData()
    }
}

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        document
            .getElementById('list')
            ?.addEventListener('click', handleVideoClick)
        document
            .getElementById('ignored-list')
            ?.addEventListener('click', handleIgnoredClick)
        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                currentTab = (btn as HTMLElement).dataset.tab as Tab
                settingsOpen = false
                render()
            })
        })

        const settingsToggle = document.getElementById('settings-toggle')
        settingsToggle?.addEventListener('click', () => {
            settingsOpen = !settingsOpen
            render()
        })

        const toggle = document.getElementById(
            'toggle-enabled',
        ) as HTMLInputElement | null
        if (toggle) {
            toggle.addEventListener('change', async () => {
                enabled = toggle.checked
                await setEnabled(enabled)
                render()
            })
        }

        const searchInput = document.getElementById(
            'video-search',
        ) as HTMLInputElement | null
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                searchQuery = searchInput.value
                render()
            })
        }

        await refreshData()
    },
    { once: true },
)
