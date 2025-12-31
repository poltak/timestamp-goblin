import { build, context } from 'esbuild'
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDir = resolve('dist')
const isProd =
    process.env.NODE_ENV === 'production' || process.argv.includes('--prod')
const isWatch = process.argv.includes('--watch')
await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })

const SCRIPTS = {
    content: {
        entry: 'src/content.ts',
        outfile: 'dist/content.js',
    },
    popup: {
        entry: 'src/popup.ts',
        outfile: 'dist/popup.js',
    },
}

const manifest = await readFile('src/manifest.json', 'utf8')
await writeFile('dist/manifest.json', manifest, 'utf8')

const popupHtml = await readFile('src/popup.html', 'utf8')
await writeFile('dist/popup.html', popupHtml, 'utf8')

const popupCss = await readFile('src/popup.css', 'utf8')
await writeFile('dist/popup.css', popupCss, 'utf8')

await copyFile('icon.png', resolve(distDir, 'icon.png'))

const modeLabel = isProd ? 'production' : 'development'
console.log(
    `Build (${modeLabel}) complete: dist/content.js, dist/popup.js, dist/manifest.json`,
)

await Promise.all(
    Object.values(SCRIPTS).map(async (script) => {
        const ctx = await context({
            entryPoints: [script.entry],
            outfile: script.outfile,
            bundle: true,
            format: 'iife',
            platform: 'browser',
            target: ['es2018'],
            minify: isProd,
        })
        if (isWatch) {
            console.log(`Watching ${script.entry}...`)
            await ctx.watch()
        }
    }),
)

if (!isWatch) {
    console.log('done')
    process.exit(0)
}
