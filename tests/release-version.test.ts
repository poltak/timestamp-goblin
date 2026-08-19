import { describe, expect, it } from 'vitest'
import {
    compareChromeVersions,
    decideRelease,
    parseChromeVersion,
    validateReleaseMetadata,
} from '../scripts/check-release-version.mjs'

describe('Chrome extension release versions', () => {
    it('parses valid Chrome versions', () => {
        expect(parseChromeVersion('0.1.4')).toEqual([0, 1, 4])
        expect(parseChromeVersion('65535.65535.65535.65535')).toEqual([
            65535, 65535, 65535, 65535,
        ])
    })

    it.each(['', '0', '0.0.0.0', '01.2', '1.2.3.4.5', '1.2.-1', '1.65536'])(
        'rejects invalid Chrome version %j',
        (version) => {
            expect(() => parseChromeVersion(version)).toThrow()
        },
    )

    it('compares missing components as zero', () => {
        expect(compareChromeVersions('1.2', '1.2.0')).toBe(0)
        expect(compareChromeVersions('1.2.1', '1.2')).toBe(1)
        expect(compareChromeVersions('1.1.9', '1.2')).toBe(-1)
    })

    it('publishes a strictly newer version', () => {
        expect(
            decideRelease({
                currentManifestVersion: '0.1.5',
                previousManifestVersion: '0.1.4',
                packageVersion: '0.1.5',
                lockfileVersion: '0.1.5',
                lockfilePackageVersion: '0.1.5',
            }),
        ).toEqual({
            release: true,
            currentVersion: '0.1.5',
            previousVersion: '0.1.4',
        })
    })

    it('skips an equal version', () => {
        expect(
            decideRelease({
                currentManifestVersion: '0.1.4',
                previousManifestVersion: '0.1.4',
                packageVersion: '0.1.4',
                lockfileVersion: '0.1.4',
                lockfilePackageVersion: '0.1.4',
            }).release,
        ).toBe(false)
    })

    it('rejects a version downgrade', () => {
        expect(() =>
            decideRelease({
                currentManifestVersion: '0.1.3',
                previousManifestVersion: '0.1.4',
                packageVersion: '0.1.3',
                lockfileVersion: '0.1.3',
                lockfilePackageVersion: '0.1.3',
            }),
        ).toThrow(/downgrade/i)
    })

    it('rejects mismatched package metadata', () => {
        expect(() =>
            validateReleaseMetadata({
                manifestVersion: '0.1.5',
                packageVersion: '0.1.4',
                lockfileVersion: '0.1.5',
                lockfilePackageVersion: '0.1.5',
            }),
        ).toThrow(/package\.json/i)

        expect(() =>
            validateReleaseMetadata({
                manifestVersion: '0.1.5',
                packageVersion: '0.1.5',
                lockfileVersion: '0.1.4',
                lockfilePackageVersion: '0.1.5',
            }),
        ).toThrow(/package-lock\.json/i)

        expect(() =>
            validateReleaseMetadata({
                manifestVersion: '0.1.5',
                packageVersion: '0.1.5',
                lockfileVersion: '0.1.5',
                lockfilePackageVersion: undefined,
            }),
        ).toThrow(/packages\[""\]/i)
    })
})
