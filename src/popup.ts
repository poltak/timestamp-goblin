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
    DEFAULT_CHANNEL_NAME,
    DEFAULT_VIDEO_TITLE,
    MAX_POPUP_ITEMS,
    MIN_RESUME_SECONDS,
} from './constants'
import { isFinished } from './progress'
import { createVideoMatcher } from './search'
import { getThumbnailUrl } from './youtube'

type Tab = 'unfinished' | 'unwatched' | 'finished'

let currentTab: Tab = 'unfinished'
/** All stored videos, newest first. `null` until the first storage read. */
let allVideos: VideoItem[] | null = null
let videosByTab: Record<Tab, VideoItem[]> = {
    unfinished: [],
    unwatched: [],
    finished: [],
}
let ignoredChannels: string[] = []
let enabled = true
let searchQuery = ''
let settingsOpen = false
let renderedItems: VideoItem[] = []
let refreshVersion = 0
let mutationQueue = Promise.resolve()

const tabHeadings: Record<Tab, string> = {
    unfinished: 'Continue watching',
    unwatched: 'Waiting for you',
    finished: 'All wrapped up',
}

const icons = {
    play: '<path d="m8 5 11 7-11 7Z"/>',
    forward: '<path d="m4 5 9 7-9 7Zm9 0 9 7-9 7Z"/>',
    ignore: '<circle cx="12" cy="12" r="8"/><path d="m6.3 6.3 11.4 11.4"/>',
    delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/>',
}

function icon(name: keyof typeof icons): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`
}

function categorizeVideo(state: StoredVideoState): Tab {
    if (!Number.isFinite(state.duration) || state.t < MIN_RESUME_SECONDS) {
        return 'unwatched'
    }
    if (isFinished({ time: state.t, duration: state.duration })) {
        return 'finished'
    }
    return 'unfinished'
}

function getPercent(time: number, duration: number): number | null {
    if (!Number.isFinite(duration) || duration <= 0) return null
    return Math.min(100, Math.max(0, Math.round((time / duration) * 100)))
}

function formatTime(time: number): string {
    if (!Number.isFinite(time)) return '--:--'
    const seconds = Math.max(0, Math.floor(time))
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainder = String(seconds % 60).padStart(2, '0')
    return hours
        ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
        : `${minutes}:${remainder}`
}

function openVideo(videoId: string, time?: number): void {
    let url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    if (typeof time === 'number' && time > 0) {
        url += `&t=${Math.floor(time)}s`
    }
    window.open(url, '_blank')
}

function renderVideo(item: VideoItem): string {
    const title = item.title || DEFAULT_VIDEO_TITLE
    const channel = item.channel || DEFAULT_CHANNEL_NAME
    const lastTime = formatTime(item.t)
    const furthestTime = formatTime(item.ft)
    const lastPercent = getPercent(item.t, item.duration)
    const furthestPercent = getPercent(item.ft, item.duration)
    const progressLabel = `Last watched: ${lastTime}. Furthest watched: ${furthestTime}. Duration: ${formatTime(item.duration)}.`
    const videoId = escapeHtml(item.videoId)
    const canIgnore = channel !== DEFAULT_CHANNEL_NAME

    return `
        <li class="card" data-video-id="${videoId}">
            <button class="card-open last-btn" type="button" data-time="${item.t}" aria-label="${escapeHtml(`${item.t > 0 ? 'Resume' : 'Play'} ${title} at ${lastTime}`)}">
                <span class="thumbnail">
                    <img src="${escapeHtml(getThumbnailUrl(item.videoId))}" alt="" loading="lazy" width="112" height="63">
                    <span class="thumbnail-play">${icon('play')}</span>
                    <span class="video-duration">${formatTime(item.duration)}</span>
                </span>
                <span class="info">
                    <span class="video-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
                    <span class="channel" title="${escapeHtml(channel)}">${escapeHtml(channel)}</span>
                    <span class="resume-label">${icon('play')}${item.t > 0 ? 'Resume' : 'Play'} <span class="resume-time">${lastTime}</span></span>
                </span>
            </button>
            <div class="bar" role="img" aria-label="${escapeHtml(progressLabel)}" title="Last: ${lastPercent ?? '--'}%, furthest: ${furthestPercent ?? '--'}%">
                <span class="fill furthest" style="width: ${furthestPercent ?? 0}%"></span>
                <span class="fill last" style="width: ${lastPercent ?? 0}%"></span>
            </div>
            <div class="card-footer">
                <button class="action-btn furthest-btn" type="button" data-time="${item.ft}" aria-label="${escapeHtml(`Watch ${title} from furthest point at ${furthestTime}`)}" title="Watch from furthest point">
                    ${icon('forward')}Furthest <span class="resume-time">${furthestTime}</span>
                </button>
                <div class="actions">
                    <button class="action-btn ignore-btn" type="button" title="Ignore channel" aria-label="${escapeHtml(`Ignore channel ${channel}`)}" data-channel="${escapeHtml(channel)}" ${canIgnore ? '' : 'disabled'}>${icon('ignore')}</button>
                    <button class="action-btn delete-btn" type="button" title="Remove from list" aria-label="${escapeHtml(`Remove ${title} from saved videos`)}">${icon('delete')}</button>
                </div>
            </div>
        </li>
    `
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
    if (!root || !empty) return

    if (enabledToggle) enabledToggle.checked = enabled
    if (searchInput && searchInput.value !== searchQuery)
        searchInput.value = searchQuery
    document.body.classList.toggle('is-disabled', !enabled)
    document.getElementById('loading')?.classList.add('hidden')
    document
        .getElementById('search-clear')
        ?.classList.toggle('hidden', !searchQuery)
    root.setAttribute('aria-busy', 'false')
    const savingState = document.getElementById('saving-state')
    const savingDescription = document.getElementById('saving-description')
    if (savingState) savingState.textContent = enabled ? 'on' : 'paused'
    if (savingDescription)
        savingDescription.textContent = enabled
            ? 'Ready when you are'
            : 'Progress saving paused'

    videoView?.classList.toggle('hidden', settingsOpen)
    settingsView?.classList.toggle('hidden', !settingsOpen)
    settingsToggle?.classList.toggle('active', settingsOpen)
    settingsToggle?.setAttribute('aria-pressed', String(settingsOpen))
    videoView?.setAttribute('aria-hidden', String(settingsOpen))
    settingsView?.setAttribute('aria-hidden', String(!settingsOpen))

    const normalizedSearchQuery = searchQuery.trim()
    const matches = createVideoMatcher(normalizedSearchQuery)
    const items: VideoItem[] = []
    for (const video of videosByTab[currentTab]) {
        if (normalizedSearchQuery && !matches?.(video)) continue
        items.push(video)
        if (items.length === MAX_POPUP_ITEMS) break
    }

    document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
        const tab = btn.dataset.tab as Tab
        const active = !settingsOpen && tab === currentTab
        btn.classList.toggle('active', active)
        btn.setAttribute('aria-pressed', String(active))
        let badge = btn.querySelector('.tab-count')
        const count = videosByTab[tab].length
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span')
                badge.className = 'tab-count'
                btn.appendChild(badge)
            }
            badge.textContent = count.toString()
        } else {
            badge?.remove()
        }
    })

    const heading = document.getElementById('list-heading')
    const summary = document.getElementById('result-summary')
    if (heading)
        heading.textContent = normalizedSearchQuery
            ? 'Search results'
            : tabHeadings[currentTab]
    if (summary) {
        summary.textContent =
            normalizedSearchQuery && items.length === MAX_POPUP_ITEMS
                ? `${items.length} shown`
                : !normalizedSearchQuery &&
                    videosByTab[currentTab].length > items.length
                  ? `${items.length} of ${videosByTab[currentTab].length} videos`
                  : `${items.length} ${items.length === 1 ? 'video' : 'videos'}`
    }

    empty.classList.toggle('hidden', items.length > 0)
    if (items.length === 0) {
        const emptyTitle = document.getElementById('empty-title')
        const emptyDescription = document.getElementById('empty-description')
        const messages: Record<Tab, [string, string]> = {
            unfinished: [
                'Your next video awaits',
                enabled
                    ? "Start watching on YouTube. We'll keep your place here."
                    : 'Turn on auto-save to keep your place in the next video.',
            ],
            unwatched: [
                'No videos waiting',
                'Videos you have opened but barely started will appear here.',
            ],
            finished: [
                'Nothing finished yet',
                'Videos you reach the end of will appear here.',
            ],
        }
        if (emptyTitle)
            emptyTitle.textContent = normalizedSearchQuery
                ? 'No matching videos'
                : messages[currentTab][0]
        if (emptyDescription)
            emptyDescription.textContent = normalizedSearchQuery
                ? `No ${currentTab} videos match "${normalizedSearchQuery}". Try another title or channel.`
                : messages[currentTab][1]
    }

    if (
        items.length === renderedItems.length &&
        items.every((item, index) => item === renderedItems[index])
    )
        return
    const focusedCard = document.activeElement?.closest<HTMLElement>('.card')
    const focusedId =
        focusedCard && root.contains(focusedCard)
            ? focusedCard.dataset.videoId
            : undefined
    const focusedIndex = renderedItems.findIndex(
        (item) => item.videoId === focusedId,
    )
    renderedItems = items
    root.innerHTML = items.map(renderVideo).join('')
    if (focusedId) {
        const cards = Array.from(root.querySelectorAll<HTMLElement>('.card'))
        const nextCard =
            cards.find((card) => card.dataset.videoId === focusedId) ??
            cards[Math.min(focusedIndex, cards.length - 1)]
        const nextButton =
            nextCard?.querySelector<HTMLButtonElement>('.last-btn')
        ;(nextButton ?? searchInput)?.focus()
    }
}

function renderIgnoredChannels(): void {
    const count = document.getElementById('ignored-count')
    if (count) count.textContent = String(ignoredChannels.length)
    const ignoredRoot = document.getElementById('ignored-list')
    if (!ignoredRoot) return
    const focusedIndex = Array.from(
        ignoredRoot.querySelectorAll('.ignored-remove'),
    ).indexOf(document.activeElement as Element)
    ignoredRoot.innerHTML =
        ignoredChannels.length === 0
            ? '<p class="ignored-empty">No ignored channels. Everyone is welcome.</p>'
            : ignoredChannels
                  .slice()
                  .sort()
                  .map(
                      (channel) => `
            <div class="ignored-pill">
                <span class="ignored-name">${escapeHtml(channel)}</span>
                <button class="ignored-remove" type="button" aria-label="${escapeHtml(`Restore channel ${channel}`)}" data-channel="${escapeHtml(channel)}">Restore</button>
            </div>
        `,
                  )
                  .join('')
    if (focusedIndex >= 0) {
        const buttons =
            ignoredRoot.querySelectorAll<HTMLButtonElement>('.ignored-remove')
        const nextButton = buttons[Math.min(focusedIndex, buttons.length - 1)]
        ;(nextButton ?? document.getElementById('settings-back'))?.focus()
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

function groupVideos(): void {
    const ignoredSet = new Set(ignoredChannels)
    videosByTab = { unfinished: [], unwatched: [], finished: [] }
    for (const video of allVideos ?? []) {
        if (
            !ignoredSet.has(
                normalizeChannelName(video.channel || DEFAULT_CHANNEL_NAME),
            )
        ) {
            videosByTab[categorizeVideo(video)].push(video)
        }
    }
}

function renderAll(): void {
    groupVideos()
    renderIgnoredChannels()
    render()
}

async function refreshData(): Promise<void> {
    const version = ++refreshVersion
    const data = await getPopupData().catch((error: unknown) => {
        if (version === refreshVersion) throw error
        return null
    })
    if (!data || version !== refreshVersion) return
    allVideos = data.videos.slice().sort((a, b) => b.updatedAt - a.updatedAt)
    ignoredChannels = data.ignoredChannels
    enabled = data.enabled
    renderAll()
}

function showError(message: string): void {
    document.getElementById('loading')?.classList.add('hidden')
    document.getElementById('list')?.setAttribute('aria-busy', 'false')
    const error = document.getElementById('error')
    if (!error) return
    error.textContent = message
    error.classList.toggle('hidden', !message)
}

/**
 * Runs storage writes in the order of the user actions. Each operation also
 * applies its result to the data in memory, so the full store is read only
 * when a write completes before the first read did.
 */
function runMutation(operation: () => Promise<void>): void {
    mutationQueue = mutationQueue.then(async () => {
        try {
            await operation()
            if (allVideos) renderAll()
            else await refreshData()
            showError('')
        } catch {
            render()
            showError('Could not update saved videos. Try again.')
        }
    })
}

function handleVideoClick(event: Event): void {
    if (!(event.target instanceof Element)) return
    const card = event.target.closest<HTMLElement>('.card')
    const id = card?.dataset.videoId
    const button = event.target.closest<HTMLButtonElement>('button')
    if (!id || !button || button.disabled) return
    if (button.classList.contains('delete-btn')) {
        runMutation(async () => {
            await deleteVideoState(id)
            allVideos =
                allVideos?.filter((video) => video.videoId !== id) ?? null
        })
    } else if (button.classList.contains('ignore-btn')) {
        const channel = button.dataset.channel
        if (channel)
            runMutation(async () => {
                ignoredChannels = await addIgnoredChannel(channel)
            })
    } else {
        openVideo(id, Number(button.dataset.time))
    }
}

function handleIgnoredClick(event: Event): void {
    if (!(event.target instanceof Element)) return
    const channel =
        event.target.closest<HTMLButtonElement>('.ignored-remove')?.dataset
            .channel
    if (channel)
        runMutation(async () => {
            ignoredChannels = await removeIgnoredChannel(channel)
        })
}

function setSettingsOpen(open: boolean): void {
    settingsOpen = open
    render()
    document.getElementById(open ? 'settings-back' : 'settings-toggle')?.focus()
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
        document
            .querySelectorAll<HTMLButtonElement>('.tab-btn')
            .forEach((btn) => {
                btn.addEventListener('click', () => {
                    currentTab = btn.dataset.tab as Tab
                    settingsOpen = false
                    render()
                })
            })
        document
            .getElementById('settings-toggle')
            ?.addEventListener('click', () => setSettingsOpen(!settingsOpen))
        document
            .getElementById('settings-back')
            ?.addEventListener('click', () => setSettingsOpen(false))
        document
            .getElementById('settings-view')
            ?.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault()
                    setSettingsOpen(false)
                }
            })

        const toggle = document.getElementById(
            'toggle-enabled',
        ) as HTMLInputElement | null
        toggle?.addEventListener('change', () => {
            const nextEnabled = toggle.checked
            runMutation(async () => {
                await setEnabled(nextEnabled)
                enabled = nextEnabled
            })
        })

        const searchInput = document.getElementById(
            'video-search',
        ) as HTMLInputElement | null
        searchInput?.addEventListener('input', () => {
            searchQuery = searchInput.value
            render()
        })
        const clearSearch = () => {
            searchQuery = ''
            render()
            searchInput?.focus()
        }
        document
            .getElementById('search-clear')
            ?.addEventListener('click', clearSearch)
        searchInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && searchQuery) {
                event.preventDefault()
                clearSearch()
            }
        })

        try {
            await refreshData()
        } catch {
            showError(
                'Could not load saved videos. Reopen this popup to try again.',
            )
        }
    },
    { once: true },
)
