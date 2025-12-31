type StoredVideo = {
    t: number
    updatedAt: number
    duration?: number
    title?: string
    channel?: string
}

type VideoItem = StoredVideo & {
    videoId: string
}

const maxItems = 20

function isVideoKey(key: string): boolean {
    return key.startsWith('ytp:')
}

function videoIdFromKey(key: string): string {
    return key.slice(4)
}

function isUnfinished(item: VideoItem): boolean {
    if (!item.duration || !Number.isFinite(item.duration)) {
        return true
    }
    return item.t < item.duration - 5
}

function formatPercent(item: VideoItem): string {
    if (
        !item.duration ||
        !Number.isFinite(item.duration) ||
        item.duration <= 0
    ) {
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
    const all = await chrome.storage.local.get(null)
    const items: VideoItem[] = []

    for (const [key, value] of Object.entries(all)) {
        if (!isVideoKey(key)) {
            continue
        }
        const state = value as StoredVideo | undefined
        if (
            !state ||
            typeof state.t !== 'number' ||
            typeof state.updatedAt !== 'number'
        ) {
            continue
        }
        items.push({
            videoId: videoIdFromKey(key),
            t: state.t,
            updatedAt: state.updatedAt,
            duration: state.duration,
            title: state.title,
            channel: state.channel,
        })
    }

    return items
        .filter(isUnfinished)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, maxItems)
}

document.addEventListener('DOMContentLoaded', async () => {
    const items = await loadItems()
    render(items)
})
