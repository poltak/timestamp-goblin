import { describe, expect, it } from 'vitest'

import {
    DEFAULT_RETENTION_MONTHS,
    findExpiredVideos,
    getRetentionLabel,
    readRetentionMonths,
} from '../src/retention'

const now = new Date('2026-10-03T12:00:00Z').getTime()
const day = 24 * 60 * 60 * 1000

describe('retention', () => {
    it('keeps videos for one year when no valid period is stored', () => {
        expect(DEFAULT_RETENTION_MONTHS).toBe(12)
        for (const value of [undefined, null, '12', 5, -1, NaN]) {
            expect(readRetentionMonths(value)).toBe(12)
        }
        expect(readRetentionMonths(3)).toBe(3)
        expect(readRetentionMonths(0)).toBe(0)
    })

    it('finds videos that were not watched during the period', () => {
        const videos = [
            { id: 'recent', updatedAt: now - 10 * day },
            { id: 'old', updatedAt: now - 400 * day },
            { id: 'edge', updatedAt: now - 100 * day },
        ]
        const ids = (months: number) =>
            findExpiredVideos(videos, months, now).map((video) => video.id)
        expect(ids(12)).toEqual(['old'])
        expect(ids(3)).toEqual(['old', 'edge'])
        expect(ids(24)).toEqual([])
        expect(ids(0)).toEqual([])
    })

    it('names each period', () => {
        expect(getRetentionLabel(12)).toBe('1 year')
        expect(getRetentionLabel(0)).toBe('Forever')
        expect(getRetentionLabel(5)).toBe('5 months')
    })
})
