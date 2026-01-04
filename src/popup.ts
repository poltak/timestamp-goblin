import { getAllVideoStates } from './storage'
import type { StoredVideoState, VideoItem } from './types'
import { DEFAULT_UNFINISHED_BUFFER_SECONDS, MAX_POPUP_ITEMS } from './constants'

function isVideoUnfinished(
    state: StoredVideoState,
    bufferSeconds = DEFAULT_UNFINISHED_BUFFER_SECONDS,
): boolean {
    if (!Number.isFinite(state.duration)) {
        return false
    }
    return state.furthestWatchedTimestamp < state.duration - bufferSeconds
}

function formatPercent(item: VideoItem): string {
    if (!Number.isFinite(item.duration) || item.duration <= 0) {
        return '--%'
    }
    const pct = Math.min(
        100,
        Math.max(
            0,
            Math.round((item.furthestWatchedTimestamp / item.duration) * 100),
        ),
    )
    return `${pct}%`
}

function openVideo(videoId: string): void {
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    window.open(url, '_blank')
}

function render(items: VideoItem[]): void {
    const root = document.getElementById('list')
    const empty = document.getElementById('empty')
    if (!root || !empty) {
        return
    }

    if (items.length === 0) {
        root.innerHTML = ''
        empty.classList.remove('hidden')
        return
    }

    empty.classList.add('hidden')
    root.innerHTML = items
        .map((item) => {
            const title = item.title || 'Untitled video'
            const channel = item.channel || 'Unknown channel'
            const percent = formatPercent(item)
            return `
        <button class="card" data-video-id="${item.videoId}">
          <div class="title">${escapeHtml(title)}</div>
          <div class="meta">
            <span class="channel">${escapeHtml(channel)}</span>
            <span class="percent">${percent}</span>
          </div>
          <div class="bar">
            <div class="fill" style="width: ${percent}"></div>
          </div>
        </button>
      `
        })
        .join('')

    root.querySelectorAll<HTMLButtonElement>('button.card').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.videoId
            if (id) {
                openVideo(id)
            }
        })
    })
}

function escapeHtml(value: string): string {
    const div = document.createElement('div')
    div.textContent = value
    return div.innerHTML
}

async function loadItems(): Promise<VideoItem[]> {
    const videos = await getAllVideoStates()
    const items = videos
        .filter(isVideoUnfinished)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_POPUP_ITEMS)
    return items
}

document.addEventListener('DOMContentLoaded', async () => {
    const items = await loadItems()
    render(items)
})
