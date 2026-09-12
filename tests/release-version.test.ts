import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    compareChromeVersions,
    decideRelease,
    parseChromeVersion,
    validateReleaseMetadata,
    readCurrentMetadata,
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

    it('checks a pnpm checkout without an npm lockfile', async () => {
        const root = await mkdtemp(join(tmpdir(), 'goblin-release-'))
        try {
            await mkdir(join(root, 'src'))
            await writeFile(
                join(root, 'src/manifest.json'),
                JSON.stringify({ version: '0.1.5' }),
            )
            await writeFile(
                join(root, 'package.json'),
                JSON.stringify({
                    version: '0.1.5',
                    packageManager: 'pnpm@11.25.0',
                }),
            )
            await writeFile(
                join(root, 'pnpm-lock.yaml'),
                'lockfileVersion: 9.0\n',
            )
            const metadata = await readCurrentMetadata(root)
            expect(
                decideRelease({ ...metadata, previousManifestVersion: '0.1.4' })
                    .release,
            ).toBe(true)
            expect(() =>
                decideRelease({
                    ...metadata,
                    previousManifestVersion: '0.1.5',
                    packageVersion: '0.1.4',
                }),
            ).toThrow(/package\.json/)
            await rm(join(root, 'pnpm-lock.yaml'))
            await expect(readCurrentMetadata(root)).rejects.toThrow(/pnpm-lock/)
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    })
})
