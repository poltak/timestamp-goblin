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
          <button
            id="settings-toggle"
            class="settings-toggle"
            type="button"
            title="Settings"
            aria-label="Settings"
            aria-controls="settings-view"
            aria-pressed="false"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.12.6.6 1.06 1.2 1.15h.08a2 2 0 1 1 0 4h-.08c-.6.09-1.08.55-1.2 1.15Z"></path>
            </svg>
          </button>
        </div>
        <nav class="tabs">
          <button class="tab-btn active" data-tab="unfinished">Unfinished</button>
          <button class="tab-btn" data-tab="unwatched">Unwatched</button>
          <button class="tab-btn" data-tab="finished">Finished</button>
        </nav>
      </header>
      <main>
        <section id="video-view" class="video-view">
          <section class="search">
            <label class="search-label" for="video-search">Search videos</label>
            <input id="video-search" class="search-input" type="search" />
          </section>
          <div id="empty" class="empty hidden"></div>
          <div id="list" class="list"></div>
        </section>
        <section id="settings-view" class="settings-view hidden" aria-labelledby="settings-heading">
          <h1 id="settings-heading" class="settings-heading">Settings</h1>
          <section class="ignored">
            <div class="ignored-title">Ignored channels</div>
            <div id="ignored-list" class="ignored-list"></div>
          </section>
        </section>
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
        const counts = Array.from(tabs).map(
            (tab) => tab.querySelector('.tab-count')?.textContent,
        )
        expect(counts).toEqual(['1', '1', '1'])

        const deleteBtn =
            document.querySelector<HTMLButtonElement>('button.delete-btn')
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

    it('opens and closes settings without losing the active video view', () => {
        const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
        tabs[1].click()

        const search = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        search.value = 'CHAN'
        search.dispatchEvent(new Event('input'))

        const settingsToggle = document.getElementById(
            'settings-toggle',
        ) as HTMLButtonElement
        settingsToggle.click()

        expect(
            document.getElementById('video-view')?.classList.contains('hidden'),
        ).toBe(true)
        expect(
            document
                .getElementById('settings-view')
                ?.classList.contains('hidden'),
        ).toBe(false)
        expect(document.getElementById('settings-view')?.textContent).toContain(
            'Settings',
        )
        expect(settingsToggle.classList.contains('active')).toBe(true)
        expect(settingsToggle.getAttribute('aria-pressed')).toBe('true')
        expect(
            Array.from(tabs).filter((tab) => tab.classList.contains('active')),
        ).toHaveLength(0)

        settingsToggle.click()

        expect(
            document.getElementById('video-view')?.classList.contains('hidden'),
        ).toBe(false)
        expect(
            document
                .getElementById('settings-view')
                ?.classList.contains('hidden'),
        ).toBe(true)
        expect(settingsToggle.classList.contains('active')).toBe(false)
        expect(settingsToggle.getAttribute('aria-pressed')).toBe('false')
        expect(tabs[1].classList.contains('active')).toBe(true)
        expect(search.value).toBe('CHAN')
        expect(document.querySelectorAll('.card')).toHaveLength(1)
        expect(document.querySelector('.card')?.textContent).toContain(
            'Unwatched',
        )
    })

    it('closes settings when selecting another video tab', () => {
        const settingsToggle = document.getElementById(
            'settings-toggle',
        ) as HTMLButtonElement
        settingsToggle.click()

        const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
        tabs[2].click()

        expect(
            document
                .getElementById('settings-view')
                ?.classList.contains('hidden'),
        ).toBe(true)
        expect(tabs[2].classList.contains('active')).toBe(true)
        expect(document.querySelector('.card')?.textContent).toContain(
            'Finished',
        )
    })

    it('searches titles and channels with case-insensitive prefixes', () => {
        const search = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        search.value = 'UNFIN'
        search.dispatchEvent(new Event('input'))

        expect(document.querySelectorAll('.card')).toHaveLength(1)
        expect(document.querySelector('.card')?.textContent).toContain(
            'Unfinished',
        )
        const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
        const counts = Array.from(tabs).map(
            (tab) => tab.querySelector('.tab-count')?.textContent,
        )
        expect(counts).toEqual(['1', '1', '1'])

        search.value = 'CHAN'
        search.dispatchEvent(new Event('input'))
        tabs[1].click()

        expect(document.querySelectorAll('.card')).toHaveLength(1)
        expect(document.querySelector('.card')?.textContent).toContain(
            'Unwatched',
        )
        expect(search.value).toBe('CHAN')
    })

    it('shows a distinct no-results state and restores results when cleared', () => {
        const search = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        search.value = 'missing'
        search.dispatchEvent(new Event('input'))

        expect(document.querySelectorAll('.card')).toHaveLength(0)
        const empty = document.getElementById('empty')
        expect(empty?.textContent).toBe('No unfinished videos match "missing".')
        expect(empty?.classList.contains('hidden')).toBe(false)

        search.value = ''
        search.dispatchEvent(new Event('input'))

        expect(document.querySelectorAll('.card')).toHaveLength(1)
        expect(empty?.classList.contains('hidden')).toBe(true)
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
        const search = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        search.value = 'unfin'
        search.dispatchEvent(new Event('input'))

        const ignoreBtn =
            document.querySelector<HTMLButtonElement>('button.ignore-btn')
        ignoreBtn?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))

        const cards = document.querySelectorAll('.card')
        expect(cards).toHaveLength(0)
        expect(search.value).toBe('unfin')
        const settingsToggle = document.getElementById(
            'settings-toggle',
        ) as HTMLButtonElement
        settingsToggle.click()
        expect(
            document
                .getElementById('settings-view')
                ?.classList.contains('hidden'),
        ).toBe(false)
        const ignoredList = document.getElementById('ignored-list')
        expect(ignoredList?.textContent).toContain('chan a')

        const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
        const counts = Array.from(tabs).map(
            (tab) => tab.querySelector('.tab-count')?.textContent,
        )
        expect(counts).toEqual([undefined, '1', '1'])
    })

    it('finds a matching video beyond the 20-item display cap', async () => {
        setBaseDom()
        ignored = []
        videos = Array.from({ length: 25 }, (_, index) => ({
            videoId: `video-${index}`,
            t: 20,
            ft: 20,
            updatedAt: 25 - index,
            duration: 100,
            title: index === 24 ? 'Needle Beyond Cap' : `Common video ${index}`,
            channel: 'Channel',
        }))
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))

        const search = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        search.value = 'needle'
        search.dispatchEvent(new Event('input'))

        expect(document.querySelectorAll('.card')).toHaveLength(1)
        expect(document.querySelector('.card')?.textContent).toContain(
            'Needle Beyond Cap',
        )
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

        const lastBtn =
            document.querySelector<HTMLButtonElement>('button.last-btn')
        lastBtn?.click()
        const furthestBtn = document.querySelector<HTMLButtonElement>(
            'button.furthest-btn',
        )
        furthestBtn?.click()
        expect(openSpy).toHaveBeenCalledTimes(3)
        openSpy.mockRestore()
    })

    it('deletes video entries', async () => {
        const search = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        search.value = 'UNFIN'
        search.dispatchEvent(new Event('input'))

        const deleteBtn =
            document.querySelector<HTMLButtonElement>('button.delete-btn')
        deleteBtn?.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        const cards = document.querySelectorAll('.card')
        expect(cards).toHaveLength(0)
        const empty = document.getElementById('empty')
        expect(empty?.classList.contains('hidden')).toBe(false)
        expect(empty?.textContent).toBe('No unfinished videos match "UNFIN".')
        expect(search.value).toBe('UNFIN')
    })
})
