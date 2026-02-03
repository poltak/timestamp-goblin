import {
    addIgnoredChannel,
    deleteVideoState,
    getAllVideoStates,
    getIgnoredChannels,
    normalizeChannelName,
    removeIgnoredChannel,
} from './storage'
import type { StoredVideoState, VideoItem } from './types'
import {
    DEFAULT_UNFINISHED_BUFFER_SECONDS,
    DEFAULT_CHANNEL_NAME,
    MAX_POPUP_ITEMS,
    MIN_RESUME_SECONDS,
} from './constants'
import { getThumbnailUrl } from './youtube'

type Tab = 'unfinished' | 'unwatched' | 'finished'

let currentTab: Tab = 'unfinished'
let allVideos: VideoItem[] = []
let ignoredChannels: string[] = []

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
    const ignoredRoot = document.getElementById('ignored-list')
    if (!root || !empty) {
        return
    }

    const ignoredSet = new Set(ignoredChannels)
    const visibleVideos = allVideos.filter((v) => {
        const channel = v.channel || DEFAULT_CHANNEL_NAME
        return !ignoredSet.has(normalizeChannelName(channel))
    })

    const items = visibleVideos
        .filter((v) => categorizeVideo(v) === currentTab)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_POPUP_ITEMS)

    const counts: Record<Tab, number> = {
        unfinished: 0,
        unwatched: 0,
        finished: 0,
    }
    visibleVideos.forEach((v) => {
        counts[categorizeVideo(v)]++
    })

    document.querySelectorAll('.tab-btn').forEach((btn) => {
        const tab = (btn as HTMLElement).dataset.tab as Tab
        if (tab === currentTab) {
            btn.classList.add('active')
        } else {
            btn.classList.remove('active')
        }

        let badge = btn.querySelector('.tab-count')
        const count = counts[tab]
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
        root.innerHTML = ''
        empty.classList.remove('hidden')
        empty.textContent = `No ${currentTab} videos yet.`
    } else {
        empty.classList.add('hidden')
    }

    root.innerHTML = items
        .map((item) => {
            const title = item.title || 'Untitled video'
            const channel = item.channel || DEFAULT_CHANNEL_NAME
            const lastPercent = formatPercent(item.t, item.duration)
            const furthestPercent = formatPercent(item.ft, item.duration)
            const thumb = getThumbnailUrl(item.videoId)
            const canIgnore = channel !== DEFAULT_CHANNEL_NAME
            return `
        <div class="card" data-video-id="${item.videoId}">
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
            <button class="action-btn last-btn" title="Watch from last watched time" data-video-id="${item.videoId}" data-time="${item.t}">
              <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
            <button class="action-btn furthest-btn" title="Watch from furthest watched time" data-video-id="${item.videoId}" data-time="${item.ft}">
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
            <button class="action-btn delete-btn" title="Remove from list" data-video-id="${item.videoId}">
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

    root.querySelectorAll<HTMLDivElement>('div.card').forEach((card) => {
        card.addEventListener('click', (e) => {
            const target = e.target as HTMLElement
            if (target.closest('.action-btn')) {
                return
            }
            const id = card.dataset.videoId
            if (id) {
                // Default to last watched time if clicking the card
                const item = allVideos.find((v) => v.videoId === id)
                openVideo(id, item?.t)
            }
        })
    })

    root.querySelectorAll<HTMLButtonElement>('button.last-btn').forEach(
        (btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                const id = btn.dataset.videoId
                const time = parseFloat(btn.dataset.time || '0')
                if (id) openVideo(id, time)
            })
        },
    )

    root.querySelectorAll<HTMLButtonElement>('button.furthest-btn').forEach(
        (btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                const id = btn.dataset.videoId
                const time = parseFloat(btn.dataset.time || '0')
                if (id) openVideo(id, time)
            })
        },
    )

    root.querySelectorAll<HTMLButtonElement>('button.delete-btn').forEach(
        (btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation()
                const id = btn.dataset.videoId
                if (id) {
                    await deleteVideoState(id)
                    await refreshData()
                }
            })
        },
    )

    root.querySelectorAll<HTMLButtonElement>('button.ignore-btn').forEach(
        (btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation()
                const channel = btn.dataset.channel
                if (channel) {
                    await addIgnoredChannel(channel)
                    await refreshData()
                }
            })
        },
    )

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

            ignoredRoot
                .querySelectorAll<HTMLButtonElement>('button.ignored-remove')
                .forEach((btn) => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation()
                        const channel = btn.dataset.channel
                        if (channel) {
                            await removeIgnoredChannel(channel)
                            await refreshData()
                        }
                    })
                })
        }
    }
}

function escapeHtml(value: string): string {
    const div = document.createElement('div')
    div.textContent = value
    return div.innerHTML
}

async function refreshData(): Promise<void> {
    allVideos = await getAllVideoStates()
    ignoredChannels = await getIgnoredChannels()
    render()
}

document.addEventListener('DOMContentLoaded', async () => {
    // Setup tab listeners
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            currentTab = (btn as HTMLElement).dataset.tab as Tab
            render()
        })
    })

    await refreshData()
})
