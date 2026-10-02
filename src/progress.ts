import { DEFAULT_UNFINISHED_BUFFER_SECONDS } from './constants'

export function isFinished(progress: {
    time: number
    duration: number
}): boolean {
    return (
        Number.isFinite(progress.duration) &&
        progress.time >= progress.duration - DEFAULT_UNFINISHED_BUFFER_SECONDS
    )
}
