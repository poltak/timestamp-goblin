export interface StoredVideoState {
    t: number
    updatedAt: number
    duration: number
    title: string
    channel: string
}

export interface VideoItem extends StoredVideoState {
    videoId: string
}
