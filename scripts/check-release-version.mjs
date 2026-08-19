import { appendFile, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const CHROME_VERSION_PARTS = 4
const CHROME_VERSION_LIMIT = 65535

/**
 * Parse and validate a Chrome extension version.
 *
 * Chrome accepts one to four dot-separated, non-negative integers. Each
 * integer must be at most 65535, and the complete version cannot be zero.
 */
export function parseChromeVersion(version) {
    if (typeof version !== 'string' || version.length === 0) {
        throw new Error('Chrome extension version must be a non-empty string')
    }

    const parts = version.split('.')
    if (parts.length > CHROME_VERSION_PARTS) {
        throw new Error(
            `Chrome extension version must have 1 to ${CHROME_VERSION_PARTS} parts: ${version}`,
        )
    }

    const values = parts.map((part) => {
        if (!/^(0|[1-9]\d*)$/.test(part)) {
            throw new Error(`Invalid Chrome extension version: ${version}`)
        }

        const value = Number(part)
        if (!Number.isSafeInteger(value) || value > CHROME_VERSION_LIMIT) {
            throw new Error(`Invalid Chrome extension version: ${version}`)
        }

        return value
    })

    if (values.every((value) => value === 0)) {
        throw new Error(
            `Chrome extension version cannot be all zero: ${version}`,
        )
    }

    return values
}

/**
 * Compare two valid Chrome extension versions.
 *
 * Missing components compare as zero, so 1.2 and 1.2.0 are equal.
 */
export function compareChromeVersions(left, right) {
    const leftParts = parseChromeVersion(left)
    const rightParts = parseChromeVersion(right)

    for (let index = 0; index < CHROME_VERSION_PARTS; index += 1) {
        const leftValue = leftParts[index] ?? 0
        const rightValue = rightParts[index] ?? 0
        if (leftValue !== rightValue) {
            return leftValue > rightValue ? 1 : -1
        }
    }

    return 0
}

/**
 * Validate that all package metadata uses the manifest version.
 */
export function validateReleaseMetadata({
    manifestVersion,
    packageVersion,
    lockfileVersion,
    lockfilePackageVersion,
}) {
    parseChromeVersion(manifestVersion)

    const metadata = [
        ['package.json', packageVersion],
        ['package-lock.json', lockfileVersion],
        ['package-lock.json packages[""].version', lockfilePackageVersion],
    ]

    for (const [location, version] of metadata) {
        if (version !== manifestVersion) {
            throw new Error(
                `Version mismatch: src/manifest.json is ${manifestVersion}, but ${location} is ${version ?? 'missing'}`,
            )
        }
    }
}

/**
 * Decide whether a push contains a publishable version bump.
 */
export function decideRelease({
    currentManifestVersion,
    previousManifestVersion,
    packageVersion,
    lockfileVersion,
    lockfilePackageVersion,
}) {
    validateReleaseMetadata({
        manifestVersion: currentManifestVersion,
        packageVersion,
        lockfileVersion,
        lockfilePackageVersion,
    })

    const comparison = compareChromeVersions(
        currentManifestVersion,
        previousManifestVersion,
    )

    if (comparison < 0) {
        throw new Error(
            `Version downgrade is not allowed: ${previousManifestVersion} -> ${currentManifestVersion}`,
        )
    }

    return {
        release: comparison > 0,
        currentVersion: currentManifestVersion,
        previousVersion: previousManifestVersion,
    }
}

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'))
}

async function readCurrentMetadata(rootDir) {
    const [manifest, packageJson, packageLock] = await Promise.all([
        readJson(resolve(rootDir, 'src/manifest.json')),
        readJson(resolve(rootDir, 'package.json')),
        readJson(resolve(rootDir, 'package-lock.json')),
    ])

    return {
        currentManifestVersion: manifest.version,
        packageVersion: packageJson.version,
        lockfileVersion: packageLock.version,
        lockfilePackageVersion: packageLock.packages?.['']?.version,
    }
}

async function readPreviousManifestVersion(rootDir, beforeSha) {
    if (!/^[0-9a-f]{40}$/i.test(beforeSha) || /^0+$/.test(beforeSha)) {
        throw new Error(
            `A previous commit SHA is required to compare the release version: ${beforeSha || 'missing'}`,
        )
    }

    const { stdout } = await execFileAsync(
        'git',
        ['show', `${beforeSha}:src/manifest.json`],
        { cwd: rootDir },
    )
    const previousManifest = JSON.parse(stdout)
    return previousManifest.version
}

async function writeOutputs(outputs) {
    const output = Object.entries(outputs)
        .map(([name, value]) => `${name}=${value}`)
        .join('\n')
        .concat('\n')

    if (process.env.GITHUB_OUTPUT) {
        await appendFile(process.env.GITHUB_OUTPUT, output)
    } else {
        process.stdout.write(output)
    }
}

async function main() {
    const [beforeSha] = process.argv.slice(2)
    const rootDir = process.cwd()
    const current = await readCurrentMetadata(rootDir)
    const previousManifestVersion = await readPreviousManifestVersion(
        rootDir,
        beforeSha,
    )
    const decision = decideRelease({
        ...current,
        previousManifestVersion,
    })

    await writeOutputs({
        version: decision.currentVersion,
        'previous-version': decision.previousVersion,
        release: decision.release,
    })

    console.log(
        decision.release
            ? `Version bump detected: ${decision.previousVersion} -> ${decision.currentVersion}`
            : `No version bump detected: ${decision.currentVersion}`,
    )
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
}
