/** Months that a video stays saved after its last save. 0 keeps it forever. */
export const DEFAULT_RETENTION_MONTHS = 12

export const RETENTION_OPTIONS: readonly { months: number; label: string }[] = [
    { months: 3, label: '3 months' },
    { months: 6, label: '6 months' },
    { months: 12, label: '1 year' },
    { months: 24, label: '2 years' },
    { months: 0, label: 'Forever' },
]

export function readRetentionMonths(value: unknown): number {
    return RETENTION_OPTIONS.some((option) => option.months === value)
        ? (value as number)
        : DEFAULT_RETENTION_MONTHS
}

export function getRetentionLabel(months: number): string {
    return (
        RETENTION_OPTIONS.find((option) => option.months === months)?.label ??
        `${months} months`
    )
}

/** Returns the videos that were not watched during the retention period. */
export function findExpiredVideos<T extends { updatedAt: number }>(
    videos: readonly T[],
    months: number,
    now: number,
): T[] {
    if (!(months > 0)) {
        return []
    }
    const cutoff = new Date(now)
    cutoff.setMonth(cutoff.getMonth() - months)
    const cutoffTime = cutoff.getTime()
    return videos.filter((video) => video.updatedAt < cutoffTime)
}
