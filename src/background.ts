import { pruneExpiredVideos } from './storage'
import { log } from './util'

/** Deletes the videos that were not watched during the retention period. */
export function prune(): void {
    pruneExpiredVideos().then(
        (count) => log('deleted expired videos', count),
        (error) => log('could not delete expired videos', error),
    )
}

// A service worker must add its listeners when it starts.
chrome.runtime.onStartup.addListener(prune)
chrome.runtime.onInstalled.addListener(prune)
