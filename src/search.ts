import MiniSearch from 'minisearch'

import { DEFAULT_CHANNEL_NAME, DEFAULT_VIDEO_TITLE } from './constants'
import type { VideoItem } from './types'

export type VideoSearchIndex = MiniSearch<VideoItem>

export function buildVideoSearchIndex(
    videos: readonly VideoItem[],
): VideoSearchIndex {
    const index = new MiniSearch<VideoItem>({
        fields: ['title', 'channel'],
        idField: 'videoId',
        extractField: (document, fieldName) => {
            const value = document[fieldName as keyof VideoItem]
            if (fieldName === 'title') {
                return typeof value === 'string' && value
                    ? value
                    : DEFAULT_VIDEO_TITLE
            }
            if (fieldName === 'channel') {
                return typeof value === 'string' && value
                    ? value
                    : DEFAULT_CHANNEL_NAME
            }
            return typeof value === 'string' ? value : ''
        },
        processTerm: (term) => term.toLowerCase(),
    })

    index.addAll(videos)
    return index
}

export function findVideoIds(
    index: VideoSearchIndex,
    query: string,
): Set<string> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
        return new Set()
    }

    return new Set(
        index
            .search(normalizedQuery, { combineWith: 'AND', prefix: true })
            .map((result) => String(result.id)),
    )
}
