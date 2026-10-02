import { describe, expect, it } from 'vitest'

import { createVideoMatcher } from '../src/search'
import type { VideoItem } from '../src/types'

const videos: VideoItem[] = [
    {
        videoId: 'a1',
        t: 30,
        ft: 40,
        updatedAt: 3,
        duration: 100,
        title: 'Deep Learning Systems',
        channel: 'Creator Labs',
    },
    {
        videoId: 'b2',
        t: 0,
        ft: 0,
        updatedAt: 2,
        duration: 100,
        title: 'A Travel Guide: "Señor" road-trip',
        channel: 'Road Creator',
    },
]

function find(query: string, items: VideoItem[] = videos): string[] {
    const matches = createVideoMatcher(query)
    return matches ? items.filter(matches).map((video) => video.videoId) : []
}

describe('video search', () => {
    it('matches title and channel words with case-insensitive prefixes', () => {
        expect(find('deep')).toEqual(['a1'])
        expect(find('CREAT')).toEqual(['a1', 'b2'])
        expect(find('eep')).toEqual([])
    })

    it('requires every query term across title and channel fields', () => {
        expect(find('deep creator')).toEqual(['a1'])
        expect(find('deep travel')).toEqual([])
    })

    it('splits words at punctuation and keeps letters with accents', () => {
        expect(find('trip')).toEqual(['b2'])
        expect(find('señ')).toEqual(['b2'])
        expect(find('"road-trip"')).toEqual(['b2'])
    })

    it('matches fallback labels for records with absent metadata', () => {
        const legacyVideos = [
            { ...videos[0], videoId: 'legacy-title', title: undefined },
            { ...videos[1], videoId: 'legacy-channel', channel: undefined },
        ] as unknown as VideoItem[]

        expect(find('untitled', legacyVideos)).toEqual(['legacy-title'])
        expect(find('unknown channel', legacyVideos)).toEqual([
            'legacy-channel',
        ])
    })

    it('returns no matcher for a query with no words', () => {
        expect(createVideoMatcher('   ')).toBeNull()
        expect(createVideoMatcher(' - ')).toBeNull()
    })
})
