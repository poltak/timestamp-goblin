import { beforeEach, describe, expect, it, vi } from 'vitest'

const seedVideos = [
    {
        videoId: 'a1',
        t: 30,
        ft: 40,
        updatedAt: 3,
        duration: 100,
        title: 'Unfinished',
        channel: 'Chan A',
    },
    {
        videoId: 'b2',
        t: 0,
        ft: 0,
        updatedAt: 2,
        duration: 100,
        title: 'Unwatched',
        channel: 'Chan B',
    },
    {
        videoId: 'c3',
        t: 95,
        ft: 95,
        updatedAt: 1,
        duration: 100,
        title: 'Finished',
        channel: 'Chan C',
    },
]
let videos = [...seedVideos]
let ignored: string[] = []
let enabled = true

vi.mock('../src/storage', () => ({
    getAllVideoStates: vi.fn(async () => videos),
    deleteVideoState: vi.fn(async (id: string) => {
        videos = videos.filter((v) => v.videoId !== id)
    }),
    getEnabled: vi.fn(async () => enabled),
    setEnabled: vi.fn(async (value: boolean) => {
        enabled = value
    }),
    getIgnoredChannels: vi.fn(async () => ignored),
    addIgnoredChannel: vi.fn(async (channel: string) => {
        const next = channel.trim().toLowerCase()
        if (!ignored.includes(next)) {
            ignored = [...ignored, next]
        }
        return ignored
    }),
    removeIgnoredChannel: vi.fn(async (channel: string) => {
        const next = channel.trim().toLowerCase()
        ignored = ignored.filter((item) => item !== next)
        return ignored
    }),
    normalizeChannelName: (value: string) => value.trim().toLowerCase(),
}))

vi.mock('../src/youtube', () => ({
    getThumbnailUrl: (videoId: string) => `thumb://${videoId}`,
}))

describe('popup', () => {
    const setBaseDom = () => {
        document.body.innerHTML = `
      <header>
        <div class="banner-actions">
          <label class="toggle toggle-compact">
            <input id="toggle-enabled" type="checkbox" checked />
            <span class="toggle-ui" aria-hidden="true"></span>
            <span class="toggle-text">Auto-saving</span>
          </label>
        </div>
        <nav class="tabs">
          <button class="tab-btn active" data-tab="unfinished">Unfinished</button>
          <button class="tab-btn" data-tab="unwatched">Unwatched</button>
          <button class="tab-btn" data-tab="finished">Finished</button>
        </nav>
      </header>
      <main>
        <section class="ignored">
          <div class="ignored-title">Ignored channels</div>
          <div id="ignored-list" class="ignored-list"></div>
        </section>
        <div id="empty" class="empty hidden"></div>
        <div id="list" class="list"></div>
      </main>
    `
    }

    beforeEach(async () => {
        setBaseDom()
        videos = [...seedVideos]
        ignored = []
        enabled = true
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await Promise.resolve()
    })

    it('renders unfinished videos by default', () => {
        const cards = document.querySelectorAll('.card')
        expect(cards).toHaveLength(1)
        expect(cards[0].textContent).toContain('Unfinished')
    })

    it('shows tab counts and empty states', async () => {
        const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
        const counts = Array.from(tabs).map((tab) =>
            tab.querySelector('.tab-count')?.textContent,
        )
        expect(counts).toEqual(['1', '1', '1'])

        const deleteBtn = document.querySelector<HTMLButtonElement>(
            'button.delete-btn',
        )
        deleteBtn?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        const empty = document.getElementById('empty')
        expect(empty?.classList.contains('hidden')).toBe(false)
    })

    it('switches tabs and renders other categories', () => {
        const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
        tabs[1].click()
        let cards = document.querySelectorAll('.card')
        expect(cards).toHaveLength(1)
        expect(cards[0].textContent).toContain('Unwatched')

        tabs[2].click()
        cards = document.querySelectorAll('.card')
        expect(cards).toHaveLength(1)
        expect(cards[0].textContent).toContain('Finished')
    })

    it('sorts items by updatedAt descending', async () => {
        setBaseDom()
        ignored = []
        videos = [
            {
                videoId: 'x1',
                t: 20,
                ft: 20,
                updatedAt: 1,
                duration: 100,
                title: 'Old',
                channel: 'Chan',
            },
            {
                videoId: 'x2',
                t: 25,
                ft: 25,
                updatedAt: 5,
                duration: 100,
                title: 'New',
                channel: 'Chan',
            },
        ]
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))

        const titles = Array.from(
            document.querySelectorAll('.card .title'),
        ).map((el) => el.textContent)
        expect(titles[0]).toBe('New')
        expect(titles[1]).toBe('Old')
    })

    it('ignores a channel and updates the ignored list', async () => {
        const ignoreBtn = document.querySelector<HTMLButtonElement>(
            'button.ignore-btn',
        )
        ignoreBtn?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))

        const cards = document.querySelectorAll('.card')
        expect(cards).toHaveLength(0)
        const ignoredList = document.getElementById('ignored-list')
        expect(ignoredList?.textContent).toContain('chan a')

        const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
        const counts = Array.from(tabs).map((tab) =>
            tab.querySelector('.tab-count')?.textContent,
        )
        expect(counts).toEqual([undefined, '1', '1'])
    })

    it('toggles enabled state', async () => {
        setBaseDom()
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))

        const toggle = document.getElementById(
            'toggle-enabled',
        ) as HTMLInputElement
        expect(toggle.checked).toBe(true)
        toggle.checked = false
        toggle.dispatchEvent(new Event('change'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(enabled).toBe(false)
        expect(document.body.classList.contains('is-disabled')).toBe(true)
    })

    it('opens videos on card or buttons', () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const card = document.querySelector<HTMLDivElement>('.card')
        card?.click()
        expect(openSpy).toHaveBeenCalledTimes(1)

        const lastBtn = document.querySelector<HTMLButtonElement>('button.last-btn')
        lastBtn?.click()
        const furthestBtn = document.querySelector<HTMLButtonElement>(
            'button.furthest-btn',
        )
        furthestBtn?.click()
        expect(openSpy).toHaveBeenCalledTimes(3)
        openSpy.mockRestore()
    })

    it('deletes video entries', async () => {
        const deleteBtn = document.querySelector<HTMLButtonElement>(
            'button.delete-btn',
        )
        deleteBtn?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        const cards = document.querySelectorAll('.card')
        expect(cards).toHaveLength(0)
        const empty = document.getElementById('empty')
        expect(empty?.classList.contains('hidden')).toBe(false)
    })
})
