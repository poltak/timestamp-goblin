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

vi.mock('../src/storage', () => ({
    getAllVideoStates: vi.fn(async () => videos),
    deleteVideoState: vi.fn(async (id: string) => {
        videos = videos.filter((v) => v.videoId !== id)
    }),
}))

vi.mock('../src/youtube', () => ({
    getThumbnailUrl: (videoId: string) => `thumb://${videoId}`,
}))

describe('popup', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <header>
        <nav class="tabs">
          <button class="tab-btn active" data-tab="unfinished">Unfinished</button>
          <button class="tab-btn" data-tab="unwatched">Unwatched</button>
          <button class="tab-btn" data-tab="finished">Finished</button>
        </nav>
      </header>
      <main>
        <div id="empty" class="empty hidden"></div>
        <div id="list" class="list"></div>
      </main>
    `
        videos = [...seedVideos]
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
        document.body.innerHTML = `
      <header>
        <nav class="tabs">
          <button class="tab-btn active" data-tab="unfinished">Unfinished</button>
          <button class="tab-btn" data-tab="unwatched">Unwatched</button>
          <button class="tab-btn" data-tab="finished">Finished</button>
        </nav>
      </header>
      <main>
        <div id="empty" class="empty hidden"></div>
        <div id="list" class="list"></div>
      </main>
    `
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
        await Promise.resolve()

        const titles = Array.from(
            document.querySelectorAll('.card .title'),
        ).map((el) => el.textContent)
        expect(titles[0]).toBe('New')
        expect(titles[1]).toBe('Old')
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
