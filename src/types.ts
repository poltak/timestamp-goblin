export interface StoredVideoState {
    /** Last watched time. */
    t: number
    /** Furthest watched time. */
    ft: number
    updatedAt: number
    duration: number
    title: string
    channel: string
}

export interface VideoItem extends StoredVideoState {
    videoId: string
}
