import { describe, expect, it } from 'vitest'

import { buildVideoSearchIndex, findVideoIds } from '../src/search'
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
        title: 'A Travel Guide',
        channel: 'Road Creator',
    },
]

describe('video search', () => {
    it('indexes title and channel fields with case-insensitive prefixes', () => {
        const index = buildVideoSearchIndex(videos)

        expect(findVideoIds(index, 'deep')).toEqual(new Set(['a1']))
        expect(findVideoIds(index, 'CREAT')).toEqual(new Set(['a1', 'b2']))
    })

    it('requires every query term across title and channel fields', () => {
        const index = buildVideoSearchIndex(videos)

        expect(findVideoIds(index, 'deep creator')).toEqual(new Set(['a1']))
        expect(findVideoIds(index, 'deep travel')).toEqual(new Set())
    })

    it('indexes fallback labels for records with absent metadata', () => {
        const legacyVideos = [
            {
                videoId: 'legacy-title',
                t: 0,
                ft: 0,
                updatedAt: 1,
                duration: 100,
                title: undefined,
                channel: 'Creator Labs',
            },
            {
                videoId: 'legacy-channel',
                t: 0,
                ft: 0,
                updatedAt: 1,
                duration: 100,
                title: 'A Travel Guide',
                channel: undefined,
            },
        ] as unknown as VideoItem[]
        const index = buildVideoSearchIndex(legacyVideos)

        expect(findVideoIds(index, 'untitled')).toEqual(
            new Set(['legacy-title']),
        )
        expect(findVideoIds(index, 'unknown channel')).toEqual(
            new Set(['legacy-channel']),
        )
    })

    it('returns no matches for a blank query', () => {
        const index = buildVideoSearchIndex(videos)

        expect(findVideoIds(index, '   ')).toEqual(new Set())
    })
})
