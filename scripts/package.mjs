import { access, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const distDir = resolve('dist')
const zipPath = resolve('timestamp-goblin.zip')

try {
    await access(distDir)
} catch (err) {
    throw new Error('dist directory not found; run build first')
}

await rm(zipPath, { force: true })

await new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn('zip', ['-r', zipPath, '.'], {
        cwd: distDir,
        stdio: 'inherit',
    })
    proc.on('exit', (code) => {
        if (code === 0) {
            resolvePromise(null)
        } else {
            rejectPromise(new Error(`zip exited with code ${code}`))
        }
    })
    proc.on('error', (err) => rejectPromise(err))
})

console.log(`Package created at ${zipPath}`)
