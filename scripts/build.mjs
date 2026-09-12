import { build, context } from 'esbuild'
import { watch } from 'node:fs'
import { mkdir, copyFile, rm } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const distDir = resolve('dist')
const isProd =
    process.env.NODE_ENV === 'production' || process.argv.includes('--prod')
const isWatch = process.argv.includes('--watch')
const modeLabel = isProd ? 'production' : 'development'
const staticFiles = new Map(
    [
        'manifest.json',
        'popup.html',
        'popup.css',
        'assets/icon-16.png',
        'assets/icon-32.png',
        'assets/icon-48.png',
        'assets/icon-128.png',
    ].map((file) => [resolve('src', file), resolve(distDir, basename(file))]),
)

await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })
await Promise.all(
    [...staticFiles].map(([source, target]) => copyFile(source, target)),
)

const buildOptions = {
    entryPoints: ['src/content.ts', 'src/popup.ts'],
    outdir: distDir,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2018'],
    minify: isProd,
    define: { 'import.meta.env.MODE': JSON.stringify(modeLabel) },
}

if (isWatch) {
    const ctx = await context(buildOptions)
    let copyQueue = Promise.resolve()
    const watcher = watch('src', { recursive: true }, (_event, filename) => {
        if (!filename) return
        const source = resolve('src', filename)
        const target = staticFiles.get(source)
        if (target) {
            copyQueue = copyQueue
                .then(() => copyFile(source, target))
                .catch((error) => {
                    console.error(`Could not copy ${filename}`, error)
                })
        }
    })
    const stop = async () => {
        watcher.close()
        await copyQueue
        await ctx.dispose()
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    await ctx.watch()
} else {
    await build(buildOptions)
}

console.log(`Build (${modeLabel}) complete!`)
