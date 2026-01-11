import { getAllVideoStates, deleteVideoState } from './storage'
import type { StoredVideoState, VideoItem } from './types'
import { DEFAULT_UNFINISHED_BUFFER_SECONDS, MAX_POPUP_ITEMS } from './constants'

function isVideoUnfinished(
    state: StoredVideoState,
    bufferSeconds = DEFAULT_UNFINISHED_BUFFER_SECONDS,
): boolean {
    if (!Number.isFinite(state.duration)) {
        return false
    }
    return state.t < state.duration - bufferSeconds
}

function formatPercent(item: VideoItem): string {
    if (!Number.isFinite(item.duration) || item.duration <= 0) {
        return '--%'
    }
    const pct = Math.min(
        100,
        Math.max(0, Math.round((item.t / item.duration) * 100)),
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
        <div class="card" data-video-id="${item.videoId}">
          <div class="title">${escapeHtml(title)}</div>
          <div class="meta">
            <span class="channel">${escapeHtml(channel)}</span>
            <span class="percent">${percent}</span>
          </div>
          <div class="bar">
            <div class="fill" style="width: ${percent}"></div>
          </div>
          <button class="delete-btn" title="Remove from list" data-video-id="${item.videoId}">
            <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `
        })
        .join('')

    root.querySelectorAll<HTMLDivElement>('div.card').forEach((card) => {
        card.addEventListener('click', (e) => {
            // Only open video if the card itself (or its non-button children) was clicked
            const target = e.target as HTMLElement
            if (target.closest('.delete-btn')) {
                return
            }
            const id = card.dataset.videoId
            if (id) {
                openVideo(id)
            }
        })
    })

    root.querySelectorAll<HTMLButtonElement>('button.delete-btn').forEach(
        (btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation()
                const id = btn.dataset.videoId
                if (id) {
                    await deleteVideoState(id)
                    const updatedItems = await loadItems()
                    render(updatedItems)
                }
            })
        },
    )
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
