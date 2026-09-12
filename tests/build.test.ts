// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

it('updates static assets and scripts in watch mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-watch-'))
    await mkdir(join(root, 'src/assets'), { recursive: true })
    const files = {
        'content.ts': 'console.log("original content")',
        'popup.ts': 'console.log("popup")',
        'popup.html': '<main>Original</main>',
        'popup.css': 'body { color: red; }',
        'manifest.json': '{"version":"0.1.0"}',
        'assets/icon-16.png': 'icon',
        'assets/icon-32.png': 'icon',
        'assets/icon-48.png': 'icon',
        'assets/icon-128.png': 'icon',
    }
    await Promise.all(
        Object.entries(files).map(([path, value]) =>
            writeFile(join(root, 'src', path), value),
        ),
    )
    const child = spawn(
        process.execPath,
        [
            fileURLToPath(new URL('../scripts/build.mjs', import.meta.url)),
            '--watch',
        ],
        { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const closed = new Promise((resolve) => child.once('close', resolve))
    let output = ''
    child.stderr.on('data', (chunk) => {
        output += chunk
    })
    try {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(output || 'Build did not start')),
                5000,
            )
            child.once('error', (error) => {
                clearTimeout(timer)
                reject(error)
            })
            child.stdout.on('data', (chunk) => {
                output += chunk
                if (output.includes('Build (development) complete!')) {
                    clearTimeout(timer)
                    resolve()
                }
            })
        })
        await Promise.all([
            writeFile(join(root, 'src/popup.css'), 'body { color: blue; }'),
            writeFile(join(root, 'src/popup.html'), '<main>Updated</main>'),
            writeFile(join(root, 'src/manifest.json'), '{"version":"0.1.1"}'),
            writeFile(join(root, 'src/assets/icon-16.png'), 'updated icon'),
            writeFile(
                join(root, 'src/content.ts'),
                'console.log("updated content")',
            ),
        ])
        await vi.waitFor(
            async () => {
                expect(
                    await readFile(join(root, 'dist/popup.css'), 'utf8'),
                ).toContain('blue')
                expect(
                    await readFile(join(root, 'dist/popup.html'), 'utf8'),
                ).toContain('Updated')
                expect(
                    await readFile(join(root, 'dist/manifest.json'), 'utf8'),
                ).toContain('0.1.1')
                expect(
                    await readFile(join(root, 'dist/icon-16.png'), 'utf8'),
                ).toBe('updated icon')
                expect(
                    await readFile(join(root, 'dist/content.js'), 'utf8'),
                ).toContain('updated content')
            },
            { timeout: 2000 },
        )
    } finally {
        child.kill('SIGTERM')
        await closed
        await rm(root, { recursive: true, force: true })
    }
}, 15000)
