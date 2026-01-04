export interface StoredVideoState {
    lastWatchedTimestamp: number
    furthestWatchedTimestamp: number
    updatedAt: number
    duration: number
    title: string
    channel: string
}

export interface VideoItem extends StoredVideoState {
    videoId: string
}
