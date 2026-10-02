import { DEFAULT_CHANNEL_NAME, DEFAULT_VIDEO_TITLE } from './constants'
import type { VideoItem } from './types'

const SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/u

/** Records are replaced on each storage read, so stale entries are collected. */
const wordsByVideo = new WeakMap<VideoItem, string[]>()

function splitWords(text: string): string[] {
    return text.toLowerCase().split(SPACE_OR_PUNCTUATION).filter(Boolean)
}

function getWords(video: VideoItem): string[] {
    let words = wordsByVideo.get(video)
    if (!words) {
        words = splitWords(
            `${video.title || DEFAULT_VIDEO_TITLE} ${video.channel || DEFAULT_CHANNEL_NAME}`,
        )
        wordsByVideo.set(video, words)
    }
    return words
}

/**
 * Returns a test for videos in which each query word starts a word of the
 * title or the channel. Returns null for a query with no words.
 */
export function createVideoMatcher(
    query: string,
): ((video: VideoItem) => boolean) | null {
    const terms = splitWords(query)
    if (terms.length === 0) {
        return null
    }
    return (video) => {
        const words = getWords(video)
        return terms.every((term) =>
            words.some((word) => word.startsWith(term)),
        )
    }
}
