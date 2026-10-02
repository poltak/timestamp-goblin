import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { deferred } from './helpers'

const popupHtml = readFileSync('src/popup.html', 'utf8')

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
    getPopupData: vi.fn(async () => ({
        videos,
        ignoredChannels: ignored,
        enabled,
    })),
    deleteVideoState: vi.fn(async (id: string) => {
        videos = videos.filter((v) => v.videoId !== id)
    }),
    setEnabled: vi.fn(async (value: boolean) => {
        enabled = value
    }),
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
        document.body.innerHTML = new DOMParser().parseFromString(
            popupHtml,
            'text/html',
        ).body.innerHTML
        document.body.className = ''
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
        expect(document.getElementById('result-summary')?.textContent).toBe(
            '1 video',
        )
        expect(document.getElementById('list')?.getAttribute('aria-busy')).toBe(
            'false',
        )
        expect(
            document.getElementById('loading')?.classList.contains('hidden'),
        ).toBe(true)
    })

    it('clears search with its button or Escape and keeps keyboard focus', () => {
        const search = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        const clear = document.getElementById(
            'search-clear',
        ) as HTMLButtonElement
        search.value = 'missing'
        search.dispatchEvent(new Event('input'))
        expect(document.querySelectorAll('.card')).toHaveLength(0)
        expect(clear.classList.contains('hidden')).toBe(false)
        clear.click()
        expect(search.value).toBe('')
        expect(document.activeElement).toBe(search)
        expect(document.querySelectorAll('.card')).toHaveLength(1)
        expect(clear.classList.contains('hidden')).toBe(true)
        search.value = 'another'
        search.dispatchEvent(new Event('input'))
        const escape = new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        })
        search.dispatchEvent(escape)
        expect(escape.defaultPrevented).toBe(true)
        expect(search.value).toBe('')
        expect(document.activeElement).toBe(search)
    })

    it('returns from settings with Escape or Back and restores focus', () => {
        const settings = document.getElementById(
            'settings-toggle',
        ) as HTMLButtonElement
        const back = document.getElementById(
            'settings-back',
        ) as HTMLButtonElement
        settings.click()
        expect(document.activeElement).toBe(back)
        back.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
            }),
        )
        expect(document.activeElement).toBe(settings)
        expect(settings.getAttribute('aria-pressed')).toBe('false')
        settings.click()
        back.click()
        expect(document.activeElement).toBe(settings)
        expect(
            document.getElementById('video-view')?.classList.contains('hidden'),
        ).toBe(false)
    })

    it('displays full hour timestamps and both progress positions', async () => {
        videos = [{ ...seedVideos[0], t: 3725, ft: 5410, duration: 7600 }]
        setBaseDom()
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(document.querySelector('.last-btn')?.textContent).toContain(
            '1:02:05',
        )
        expect(document.querySelector('.furthest-btn')?.textContent).toContain(
            '1:30:10',
        )
        expect(document.querySelector('.video-duration')?.textContent).toBe(
            '2:06:40',
        )
        expect(
            document.querySelector<HTMLElement>('.fill.last')?.style.width,
        ).toBe('49%')
        expect(
            document.querySelector<HTMLElement>('.fill.furthest')?.style.width,
        ).toBe('71%')
        expect(
            document.querySelector('.bar')?.getAttribute('aria-label'),
        ).toContain('Furthest watched: 1:30:10')
    })

    it('shows a useful first-use state when saving is paused', async () => {
        videos = []
        enabled = false
        setBaseDom()
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(
            document.getElementById('empty')?.classList.contains('hidden'),
        ).toBe(false)
        expect(
            document.getElementById('empty-description')?.textContent,
        ).toContain('Turn on auto-save')
        expect(document.getElementById('saving-state')?.textContent).toBe(
            'paused',
        )
        expect(
            document.getElementById('loading')?.classList.contains('hidden'),
        ).toBe(true)
        expect(document.getElementById('list')?.getAttribute('aria-busy')).toBe(
            'false',
        )
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
        const getCounts = () =>
            Array.from(tabs).map(
                (tab) => tab.querySelector('.tab-count')?.textContent,
            )
        // During a search, a tab shows the number of its videos that match.
        expect(getCounts()).toEqual(['1', undefined, undefined])

        search.value = 'CHAN'
        search.dispatchEvent(new Event('input'))
        expect(getCounts()).toEqual(['1', '1', '1'])
        tabs[1].click()

        expect(document.querySelectorAll('.card')).toHaveLength(1)
        expect(document.querySelector('.card')?.textContent).toContain(
            'Unwatched',
        )
        expect(search.value).toBe('CHAN')
    })

    it('reuses popup data and listeners while typing', async () => {
        const storage = await import('../src/storage')
        vi.mocked(storage.getPopupData).mockClear()
        const addListener = vi.spyOn(EventTarget.prototype, 'addEventListener')
        const ignoredNode = document.getElementById('ignored-list')!.firstChild
        const input = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        for (const query of ['unfin', 'chan', 'missing', '']) {
            input.value = query
            input.dispatchEvent(new Event('input'))
        }
        expect(storage.getPopupData).not.toHaveBeenCalled()
        expect(addListener).not.toHaveBeenCalled()
        expect(document.getElementById('ignored-list')!.firstChild).toBe(
            ignoredNode,
        )
        addListener.mockRestore()
    })

    it('keeps existing cards when a search prefix matches the same items', () => {
        const input = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        const card = document.querySelector('.card')
        for (const query of ['un', 'unfi', 'UNFIN']) {
            input.value = query
            input.dispatchEvent(new Event('input'))
            expect(document.querySelector('.card')).toBe(card)
        }
    })

    it('shows a distinct no-results state and restores results when cleared', () => {
        const search = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        search.value = 'missing'
        search.dispatchEvent(new Event('input'))

        expect(document.querySelectorAll('.card')).toHaveLength(0)
        const empty = document.getElementById('empty')
        expect(document.getElementById('empty-title')?.textContent).toBe(
            'No matching videos',
        )
        expect(
            document.getElementById('empty-description')?.textContent,
        ).toContain('"missing"')
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
            document.querySelectorAll('.card .video-title'),
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
        search.value = ''
        search.dispatchEvent(new Event('input'))
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

    it('applies changes without another read of the full store', async () => {
        const storage = await import('../src/storage')
        vi.mocked(storage.getPopupData).mockClear()
        document.querySelector<HTMLButtonElement>('.ignore-btn')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(document.querySelectorAll('.card')).toHaveLength(0)
        expect(document.getElementById('ignored-count')?.textContent).toBe('1')

        document.querySelector<HTMLButtonElement>('.ignored-remove')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        document.querySelector<HTMLButtonElement>('.delete-btn')!.click()
        const toggle = document.getElementById(
            'toggle-enabled',
        ) as HTMLInputElement
        toggle.checked = false
        toggle.dispatchEvent(new Event('change'))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(document.querySelectorAll('.card')).toHaveLength(0)
        expect(
            document.querySelector('[data-tab="unfinished"] .tab-count'),
        ).toBeNull()
        expect(document.body.classList.contains('is-disabled')).toBe(true)
        expect(storage.getPopupData).not.toHaveBeenCalled()
    })

    it('offers the tabs that have matches when the active tab has none', async () => {
        const search = document.getElementById(
            'video-search',
        ) as HTMLInputElement
        search.value = 'finished'
        search.dispatchEvent(new Event('input'))
        expect(document.querySelectorAll('.card')).toHaveLength(0)
        expect(document.getElementById('empty-description')?.textContent).toBe(
            'No match for "finished" in the In progress tab. There are matches in:',
        )
        const jump = document.querySelector<HTMLButtonElement>('.empty-jump')!
        expect(jump.textContent).toBe('Finished (1)')
        jump.click()
        expect(document.querySelector('.card')?.textContent).toContain(
            'Finished',
        )
        expect(
            document
                .querySelector('[data-tab="finished"]')
                ?.classList.contains('active'),
        ).toBe(true)
        expect(search.value).toBe('finished')

        search.value = ''
        search.dispatchEvent(new Event('input'))
        document.querySelectorAll<HTMLButtonElement>('.delete-btn')[0].click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(
            document.getElementById('empty')?.classList.contains('hidden'),
        ).toBe(false)
        expect(document.querySelector('.empty-jump')).toBeNull()
    })

    it('shows more videos in steps of 20 and resets with the tab', async () => {
        setBaseDom()
        videos = Array.from({ length: 45 }, (_, index) => ({
            videoId: `video-${index}`,
            t: 20,
            ft: 20,
            updatedAt: 45 - index,
            duration: 100,
            title: `Video ${index}`,
            channel: 'Channel',
        }))
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))

        const showMore = document.getElementById('show-more')!
        const summary = document.getElementById('result-summary')!
        expect(document.querySelectorAll('.card')).toHaveLength(20)
        expect(summary.textContent).toBe('20 of 45 videos')
        expect(showMore.textContent).toBe('Show more (25 left)')
        const firstCard = document.querySelector('.card')

        showMore.click()
        expect(document.querySelectorAll('.card')).toHaveLength(40)
        expect(document.querySelector('.card')).toBe(firstCard)
        showMore.click()
        expect(document.querySelectorAll('.card')).toHaveLength(45)
        expect(showMore.classList.contains('hidden')).toBe(true)
        expect(summary.textContent).toBe('45 videos')

        document
            .querySelector<HTMLButtonElement>('[data-tab=finished]')!
            .click()
        document
            .querySelector<HTMLButtonElement>('[data-tab=unfinished]')!
            .click()
        expect(document.querySelectorAll('.card')).toHaveLength(20)
    })

    it('names the main action for the state of each video', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const tabs = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
        const card = () =>
            document.querySelector<HTMLButtonElement>('.last-btn')!

        expect(card().querySelector('.resume-label')?.textContent).toBe(
            'Resume 0:30',
        )
        tabs[1].click()
        expect(card().querySelector('.resume-label')?.textContent).toBe('Play')
        expect(card().getAttribute('aria-label')).toBe(
            'Play Unwatched from the start',
        )
        expect(document.querySelector('.furthest-btn')).toBeNull()
        card().click()
        expect(openSpy).toHaveBeenLastCalledWith(
            'https://www.youtube.com/watch?v=b2',
            '_blank',
        )

        tabs[2].click()
        expect(card().querySelector('.resume-label')?.textContent).toBe(
            'Watch again',
        )
        expect(card().getAttribute('aria-label')).toBe('Watch Finished again')
        expect(document.querySelector('.furthest-btn')).toBeNull()
        card().click()
        expect(openSpy).toHaveBeenLastCalledWith(
            'https://www.youtube.com/watch?v=c3',
            '_blank',
        )
        openSpy.mockRestore()
    })

    it('shows the furthest point only when it is ahead and not the end', async () => {
        setBaseDom()
        videos = [
            { ...seedVideos[0], videoId: 'same', t: 30, ft: 32 },
            { ...seedVideos[0], videoId: 'ahead', t: 30, ft: 60 },
            { ...seedVideos[0], videoId: 'ended', t: 30, ft: 99 },
            {
                ...seedVideos[0],
                videoId: 'unknown',
                t: 5000,
                ft: 5000,
                duration: Infinity,
            },
        ]
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))

        const card = (id: string) =>
            document.querySelector<HTMLElement>(`[data-video-id="${id}"]`)!
        expect(card('same').querySelector('.furthest-btn')).toBeNull()
        expect(
            card('ahead').querySelector('.furthest-btn')?.textContent,
        ).toMatch(/1:00/)
        expect(card('ended').querySelector('.furthest-btn')).toBeNull()
        // A video with no known length is in progress, with no bar to show.
        expect(card('same').querySelector('.bar')).not.toBeNull()
        expect(card('unknown').querySelector('.bar')).toBeNull()
        expect(card('unknown').querySelector('.video-duration')).toBeNull()
        expect(card('unknown').textContent).toContain('Resume 1:23:20')
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

    it('restores the toggle after a failed write and allows retry', async () => {
        const storage = await import('../src/storage')
        vi.mocked(storage.setEnabled).mockRejectedValueOnce(
            new Error('unavailable'),
        )
        const toggle = document.getElementById(
            'toggle-enabled',
        ) as HTMLInputElement
        toggle.checked = false
        toggle.dispatchEvent(new Event('change'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(toggle.checked).toBe(true)
        expect(
            document.getElementById('error')!.classList.contains('hidden'),
        ).toBe(false)
        toggle.checked = false
        toggle.dispatchEvent(new Event('change'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(enabled).toBe(false)
        expect(
            document.getElementById('error')!.classList.contains('hidden'),
        ).toBe(true)
    })

    it('keeps the last toggle choice when the first write is slow', async () => {
        const storage = await import('../src/storage')
        const write = deferred<void>()
        vi.mocked(storage.setEnabled).mockImplementationOnce(async (value) => {
            await write.promise
            enabled = value
        })
        const toggle = document.getElementById(
            'toggle-enabled',
        ) as HTMLInputElement
        toggle.checked = false
        toggle.dispatchEvent(new Event('change'))
        toggle.checked = true
        toggle.dispatchEvent(new Event('change'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        write.resolve(undefined)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(enabled).toBe(true)
        expect(toggle.checked).toBe(true)
    })

    it('does not apply an old initial load after a newer setting change', async () => {
        const storage = await import('../src/storage')
        const oldLoad =
            deferred<Awaited<ReturnType<typeof storage.getPopupData>>>()
        vi.mocked(storage.getPopupData).mockReturnValueOnce(oldLoad.promise)
        setBaseDom()
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        const toggle = document.getElementById(
            'toggle-enabled',
        ) as HTMLInputElement
        toggle.checked = false
        toggle.dispatchEvent(new Event('change'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        oldLoad.resolve({ videos, ignoredChannels: [], enabled: true })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(toggle.checked).toBe(false)
        expect(document.body.classList.contains('is-disabled')).toBe(true)
    })

    it('shows a useful message when saved videos cannot load', async () => {
        const storage = await import('../src/storage')
        vi.mocked(storage.getPopupData).mockRejectedValueOnce(
            new Error('unavailable'),
        )
        setBaseDom()
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(document.getElementById('error')!.textContent).toContain(
            'Could not load saved videos',
        )
    })

    it('opens videos from the named resume and furthest buttons', () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const lastBtn =
            document.querySelector<HTMLButtonElement>('button.last-btn')
        expect(lastBtn?.getAttribute('aria-label')).toBe(
            'Resume Unfinished at 0:30',
        )
        lastBtn?.click()
        expect(openSpy).toHaveBeenLastCalledWith(
            'https://www.youtube.com/watch?v=a1&t=30s',
            '_blank',
        )
        const furthestBtn = document.querySelector<HTMLButtonElement>(
            'button.furthest-btn',
        )
        furthestBtn?.click()
        expect(openSpy).toHaveBeenLastCalledWith(
            'https://www.youtube.com/watch?v=a1&t=40s',
            '_blank',
        )
        expect(openSpy).toHaveBeenCalledTimes(2)
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
        expect(document.getElementById('empty-title')?.textContent).toBe(
            'No matching videos',
        )
        expect(
            document.getElementById('empty-description')?.textContent,
        ).toContain('"UNFIN"')
        expect(search.value).toBe('UNFIN')
    })

    it('keeps keyboard focus in the list after removing a video', async () => {
        const button = document.querySelector<HTMLButtonElement>('.delete-btn')!
        button.focus()
        button.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(document.activeElement).toBe(
            document.getElementById('video-search'),
        )
    })

    it('keeps keyboard focus in settings after restoring the last channel', async () => {
        document.querySelector<HTMLButtonElement>('.ignore-btn')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        document.getElementById('settings-toggle')!.click()
        const button =
            document.querySelector<HTMLButtonElement>('.ignored-remove')!
        button.focus()
        button.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(document.activeElement).toBe(
            document.getElementById('settings-back'),
        )
        expect(document.getElementById('ignored-count')?.textContent).toBe('0')
    })

    it('preserves quotes in channel names when ignoring and restoring them', async () => {
        videos = [
            { ...seedVideos[0], channel: 'A "quoted" & <special> channel' },
        ]
        setBaseDom()
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        document.querySelector<HTMLButtonElement>('.ignore-btn')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(ignored).toEqual(['a "quoted" & <special> channel'])
        document.querySelector<HTMLButtonElement>('.ignored-remove')!.click()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(ignored).toEqual([])
        expect(document.querySelector('.channel')?.textContent).toBe(
            videos[0].channel,
        )
    })

    it('treats stored IDs as data in card attributes and thumbnail URLs', async () => {
        const videoId = 'id" data-injected="yes'
        videos = [{ ...seedVideos[0], videoId }]
        setBaseDom()
        vi.resetModules()
        await import('../src/popup')
        document.dispatchEvent(new Event('DOMContentLoaded'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(document.querySelector('[data-injected]')).toBeNull()
        expect(
            document.querySelector<HTMLElement>('.card')?.dataset.videoId,
        ).toBe(videoId)
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        document.querySelector<HTMLButtonElement>('.last-btn')!.click()
        expect(openSpy).toHaveBeenCalledWith(
            `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=30s`,
            '_blank',
        )
        openSpy.mockRestore()
    })
})
